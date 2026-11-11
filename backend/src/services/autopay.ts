/**
 * Automatic contributions ("pago automático") with a PayPal payment method the member saved (vault).
 *
 *  - The member turns it on themselves, while paying a contribution in PayPal (PayPal shows the
 *    agreement). They can turn it off, or delete the saved method, at any time.
 *  - Each round the engine first TELLS the member the charge is coming, and only charges later
 *    (see autoPayStep in domain/rules.ts). It never charges after the due date: a late payment
 *    has a fee and the member should see it and pay it themselves.
 *  - This is a rule of the engine. The AI never triggers a charge.
 *
 * Safety: the attempt is claimed first (one attempt per contribution), the PayPal call carries an
 * idempotency key, and a charge for a contribution that is already paid is refunded at once.
 */
import { db } from "../db";
import type { User } from "@prisma/client";
import * as paypal from "../paypal";
import { autoPayStep, formatUSD } from "../domain/rules";
import { HttpError } from "./errors";
import { notify, postToGroupChat } from "./notify";

/** Turn automatic payment on or off for one group. Turning it on needs a saved PayPal method. */
export async function setAutoPay(user: User, groupId: string, enabled: boolean) {
  const m = await db.membership.findUnique({ where: { userId_groupId: { userId: user.id, groupId } } });
  if (!m) throw new HttpError(403, "not_a_member");
  if (enabled && !user.paypalVaultId) throw new HttpError(409, "no_saved_method");
  await db.membership.update({ where: { id: m.id }, data: { autoPay: enabled } });
  return { autoPay: enabled };
}

/** The member removes their saved PayPal method: delete it at PayPal and stop every automatic payment. */
export async function removeSavedMethod(user: User) {
  if (user.paypalVaultId) await paypal.deleteVaultToken(user.paypalVaultId).catch((e) => console.error("vault delete failed", e));
  await forgetVault(user.id);
  return { ok: true };
}

async function forgetVault(userId: string) {
  await db.$transaction([
    db.user.update({ where: { id: userId }, data: { paypalVaultId: null } }),
    db.membership.updateMany({ where: { userId }, data: { autoPay: false } }),
  ]);
}

/** PayPal saved the member's method during a checkout where they asked for it: remember it and turn automatic payment on for that group. */
export async function rememberVault(userId: string, membershipId: string, vaultId: string) {
  await db.$transaction([
    db.user.update({ where: { id: userId }, data: { paypalVaultId: vaultId } }),
    db.membership.update({ where: { id: membershipId }, data: { autoPay: true } }),
  ]);
}

/** Webhook VAULT.PAYMENT-TOKEN.CREATED: the token can arrive after the capture. */
export async function onVaultCreated(resource: any) {
  const vaultId: string | undefined = resource?.id;
  const orderId: string | undefined = resource?.metadata?.order_id;
  if (!vaultId || !orderId) return;
  const c = await db.contribution.findUnique({ where: { paypalOrderId: orderId }, include: { membership: true } });
  if (!c || !c.saveMethod) return; // only when the member asked for it in that checkout
  await rememberVault(c.membership.userId, c.membershipId, vaultId);
}

/** Webhook VAULT.PAYMENT-TOKEN.DELETED: the member removed Ayni from their PayPal account. */
export async function onVaultDeleted(resource: any) {
  const vaultId: string | undefined = resource?.id;
  if (!vaultId) return;
  const users = await db.user.findMany({ where: { paypalVaultId: vaultId } });
  for (const u of users) {
    await forgetVault(u.id);
    await notify(u.id, null, "action", "Pago automático desactivado", "Quitaste a Ayni de tus pagos automáticos en PayPal. Desde ahora pagas cada aporte tú mismo.");
  }
}

type Due = {
  id: string;
  amountCents: number;
  status: string;
  autoPayNoticeAt: Date | null;
  autoPayAttemptedAt: Date | null;
  membershipId: string;
  membership: { autoPay: boolean; userId: string; user: { name: string; paypalVaultId: string | null } };
};

/**
 * Engine, for one pending contribution of a member with automatic payment:
 *  "off"      nothing to do with automatic payment (not enabled, already tried, too late)
 *  "handling" the member was told, or is being told now, that the charge is coming
 *  "paid"     charged and recorded
 */
export async function autoPayTick(
  c: Due,
  round: { id: string; number: number; dueAt: Date },
  group: { id: string; name: string },
  now: Date,
  leadMs: number
): Promise<"off" | "handling" | "paid"> {
  const vaultId = c.membership.user.paypalVaultId;
  if (c.status !== "PENDING" || !c.membership.autoPay || !vaultId || c.autoPayAttemptedAt) return "off";
  const step = autoPayStep(now, round.dueAt, leadMs, c.autoPayNoticeAt);
  if (step === "skip") return "off";
  if (step === "wait") return c.autoPayNoticeAt ? "handling" : "off";

  if (step === "notify") {
    // Told once, before any money moves, with the way out in the same message.
    const first = await db.contribution.updateMany({ where: { id: c.id, status: "PENDING", autoPayNoticeAt: null }, data: { autoPayNoticeAt: now } });
    if (first.count === 1)
      await notify(
        c.membership.userId,
        group.id,
        "reminder",
        "Pago automático: aviso",
        `Pronto PayPal cobrará $${formatUSD(c.amountCents)} de tu aporte de la ronda ${round.number} en ${group.name}. Si no quieres, desactiva el pago automático en el grupo antes del cobro.`
      );
    return "handling";
  }

  // step === "charge". One attempt per contribution, claimed before PayPal is called.
  const claim = await db.contribution.updateMany({ where: { id: c.id, status: "PENDING", autoPayAttemptedAt: null }, data: { autoPayAttemptedAt: now } });
  if (claim.count === 0) return "off";
  // The member may have turned it off after the notice: read the switch again at the last moment.
  const fresh = await db.membership.findUnique({ where: { id: c.membershipId }, include: { user: { select: { paypalVaultId: true } } } });
  if (!fresh?.autoPay || fresh.user.paypalVaultId !== vaultId) return "off";

  let charge: Awaited<ReturnType<typeof paypal.chargeVault>>;
  try {
    charge = await paypal.chargeVault({
      vaultId,
      amountCents: c.amountCents,
      customId: c.id,
      description: `Ayni · ${group.name} · ronda ${round.number} (pago automático)`,
      requestId: `autopay-${c.id}`,
    });
  } catch (e) {
    const definite = e instanceof paypal.PayPalError && e.status < 500;
    console.error(`autopay ${definite ? "failed" : "unknown"}`, c.id, e);
    if (!definite) {
      // We do not know if PayPal charged. Free the claim: the next tick asks again with the SAME key,
      // and PayPal answers with the same order instead of charging twice.
      await db.contribution.updateMany({ where: { id: c.id, status: "PENDING" }, data: { autoPayAttemptedAt: null } });
      return "handling";
    }
    await notify(c.membership.userId, group.id, "reminder", group.name, `No pudimos cobrar tu aporte automático de la ronda ${round.number}. No se te cobró nada: págalo tú desde el grupo antes del vencimiento.`);
    return "off";
  }
  if (charge.status !== "COMPLETED" || !charge.captureId) {
    await notify(c.membership.userId, group.id, "reminder", group.name, `PayPal no completó tu aporte automático de la ronda ${round.number}. Págalo tú desde el grupo antes del vencimiento.`);
    return "off";
  }
  const paid = await settleCapture(c.id, { captureId: charge.captureId, orderId: charge.orderId, feeCents: charge.feeCents, netCents: charge.netCents });
  return paid ? "paid" : "off";
}

/**
 * Record a PayPal capture as the contribution's payment. Reached from the automatic charge, and from
 * the webhook (PAYMENT.CAPTURE.COMPLETED carrying our contribution id) when the API answer was lost.
 * If the contribution is already settled, the capture is one too many and is refunded at once.
 */
export async function settleCapture(contributionId: string, cap: { captureId: string; orderId?: string; feeCents?: number; netCents?: number }): Promise<boolean> {
  const c = await db.contribution.findUnique({
    where: { id: contributionId },
    include: { membership: { include: { user: true } }, round: { include: { group: true } } },
  });
  if (!c) return false;
  if (c.paypalCaptureId === cap.captureId) return true; // already recorded
  const g = c.round.group;
  const paid = await db.contribution.updateMany({
    where: { id: c.id, status: "PENDING" },
    data: { status: "PAID", paidAt: new Date(), paypalCaptureId: cap.captureId, paypalOrderId: cap.orderId, paypalFeeCents: cap.feeCents, paypalNetCents: cap.netCents },
  });
  if (paid.count === 0) {
    const refund = await db.refund
      .create({ data: { groupId: g.id, userId: c.membership.userId, membershipId: c.membershipId, contributionId: c.id, captureId: cap.captureId, amountCents: c.amountCents, reason: "DUPLICATE_CHARGE", dedupeKey: `dup-${cap.captureId}`, reopened: true } })
      .catch(() => null); // this capture already has its refund
    if (!refund) return false;
    try {
      const res = await paypal.refundCapture({ captureId: cap.captureId, requestId: `refund-${refund.id}-0`, note: "Ayni: este aporte ya estaba pagado." });
      await db.refund.update({ where: { id: refund.id }, data: { status: "COMPLETED", paypalRefundId: res.id } });
      await notify(c.membership.userId, g.id, "action", "Cobro duplicado devuelto", `Tu aporte de la ronda ${c.round.number} ya estaba pagado, así que devolvimos el segundo cobro de $${formatUSD(c.amountCents)} a tu PayPal.`);
    } catch (e) {
      console.error("duplicate charge refund failed", refund.id, e);
      await db.refund.update({ where: { id: refund.id }, data: { status: paypal.refundErrorKind(e) === "failed" ? "FAILED" : "PENDING" } });
      await notify(g.organizerId, g.id, "action", "Cobro duplicado", `${c.membership.user.name} tiene un cobro duplicado de $${formatUSD(c.amountCents)} que no se pudo devolver solo. Reinténtalo en "Reembolsos que no salieron".`);
    }
    return false;
  }
  await postToGroupChat(g.id, `${c.membership.user.name} pagó su aporte de la ronda ${c.round.number}.`, { type: "paid", name: c.membership.user.name, round: c.round.number });
  if (c.paypalInvoiceId) await paypal.cancelInvoice(c.paypalInvoiceId).catch((e) => console.error("cancel invoice failed", e));
  await notify(c.membership.userId, g.id, "pot", "Aporte cobrado", `PayPal cobró $${formatUSD(c.amountCents)} de tu aporte de la ronda ${c.round.number} en ${g.name}.`);
  const { maybeReleaseRetention } = await import("./payments");
  await maybeReleaseRetention(c.membershipId);
  return true;
}
