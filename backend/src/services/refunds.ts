/**
 * Money going back to a member through PayPal Refunds.
 *
 *  - The organizer cancels a pasanaku before it starts: every admission deposit already
 *    charged is refunded, every hold still pending is released.
 *  - PayPal itself refunds or reverses a capture (a dispute lost, a refund made from the
 *    PayPal account): we record it and put the group's books back in order.
 *
 * Same rules as payouts: the record is written first, the PayPal call carries an
 * idempotency key taken from that record, and an unknown outcome is retried with the
 * SAME key, so a refund can never be sent twice.
 */
import { db } from "../db";
import type { User } from "@prisma/client";
import * as paypal from "../paypal";
import { formatUSD } from "../domain/rules";
import { captureIdOfRefund } from "../domain/paypal-events";
import { HttpError } from "./errors";
import { notify, postToGroupChat } from "./notify";
import { rejectRequest } from "./admission";

/** Organizer cancels a pasanaku that has not started. Nobody keeps money in it. */
export async function cancelGroup(user: User, groupId: string) {
  const group = await db.group.findUnique({ where: { id: groupId }, include: { memberships: { include: { user: true } } } });
  if (!group) throw new HttpError(404, "not_found");
  if (group.organizerId !== user.id) throw new HttpError(403, "organizer_only");

  // Claim first: two clicks cancel (and refund) once. Once rounds exist there is money in play: no cancelling.
  const claim = await db.group.updateMany({ where: { id: groupId, status: { in: ["FORMING", "ORDERING"] } }, data: { status: "CANCELLED", isOpen: false } });
  if (claim.count === 0) throw new HttpError(409, group.status === "CANCELLED" ? "already_cancelled" : "group_already_started");

  await db.pendingAction.updateMany({ where: { groupId, status: "PENDING" }, data: { status: "REJECTED", resolvedAt: new Date() } });

  // Requests still waiting: release their deposit holds (nothing was charged).
  const waiting = await db.joinRequest.findMany({ where: { groupId, status: { in: ["AWAITING_DEPOSIT", "PENDING"] } } });
  for (const r of waiting) await rejectRequest(r.id, "cancelled").catch((e) => console.error("reject on cancel failed", r.id, e));

  // Deposits already charged: refund them in full.
  let refunded = 0;
  for (const m of group.memberships) {
    if (!m.depositCaptureId) continue;
    const refund = await db.refund
      .create({
        data: {
          groupId,
          userId: m.userId,
          membershipId: m.id,
          captureId: m.depositCaptureId,
          amountCents: group.contributionCents,
          reason: "GROUP_CANCELLED",
          dedupeKey: `cancel-${m.depositCaptureId}`,
        },
      })
      .catch(() => null); // the unique key says this deposit already has its refund
    if (!refund) continue;
    refunded++;
    await sendRefund(refund.id);
  }

  for (const m of group.memberships) {
    if (m.userId === user.id) continue;
    await notify(
      m.userId,
      groupId,
      "action",
      "Pasanaku cancelado",
      `El organizador canceló ${group.name} antes de empezar.` + (m.depositCaptureId ? ` Tu depósito de $${formatUSD(group.contributionCents)} vuelve a tu PayPal.` : " No se te cobró nada.")
    );
  }
  await postToGroupChat(groupId, "El organizador canceló el pasanaku antes de empezar. Los depósitos se devuelven por PayPal.", { type: "cancelled" });
  return { ok: true, refunds: refunded };
}

/** Send (or re-send) one recorded refund. Returns true when PayPal accepted it. */
async function sendRefund(refundId: string): Promise<boolean> {
  const r = await db.refund.findUniqueOrThrow({ where: { id: refundId } });
  if (r.status === "COMPLETED") return true;
  try {
    const res = await paypal.refundCapture({
      captureId: r.captureId,
      // Same key while the outcome is unknown; a new one only after PayPal definitely said no.
      requestId: `refund-${r.id}-${r.attempts}`,
      note: r.reason === "DUPLICATE_CHARGE" ? "Ayni: este aporte ya estaba pagado." : "Ayni: el pasanaku se canceló antes de empezar.",
    });
    await db.refund.update({ where: { id: r.id }, data: { status: "COMPLETED", paypalRefundId: res.id } });
    return true;
  } catch (e) {
    const kind = paypal.refundErrorKind(e);
    console.error(`refund ${kind}`, r.id, e);
    if (kind === "already") {
      await db.refund.update({ where: { id: r.id }, data: { status: "COMPLETED" } });
      return true;
    }
    if (kind === "failed") {
      const changed = await db.refund.updateMany({ where: { id: r.id, status: "PENDING" }, data: { status: "FAILED" } });
      if (changed.count === 1) {
        const [g, u] = await Promise.all([db.group.findUnique({ where: { id: r.groupId } }), db.user.findUnique({ where: { id: r.userId } })]);
        if (g) await notify(g.organizerId, g.id, "action", "Un reembolso no salió", `PayPal no pudo devolver $${formatUSD(r.amountCents)} a ${u?.name ?? "un miembro"}. Puedes reintentarlo desde el grupo.`);
      }
    }
    // "unknown": stays PENDING; the engine tries again with the same key.
    return false;
  }
}

/** Engine: refunds whose outcome we never learned (timeout, 5xx). */
export async function retryPendingRefunds() {
  const stale = await db.refund.findMany({ where: { status: "PENDING", reason: { in: ["GROUP_CANCELLED", "DUPLICATE_CHARGE"] }, createdAt: { lte: new Date(Date.now() - 60_000) } }, take: 20 });
  for (const r of stale) await sendRefund(r.id);
}

/** Organizer retries a refund PayPal rejected. */
export async function retryRefund(user: User, refundId: string) {
  const r = await db.refund.findUnique({ where: { id: refundId } });
  if (!r) throw new HttpError(404, "not_found");
  const g = await db.group.findUnique({ where: { id: r.groupId } });
  if (!g || g.organizerId !== user.id) throw new HttpError(403, "organizer_only");
  // Claim: two clicks send one attempt. A new attempt number gives PayPal a new idempotency key.
  const claim = await db.refund.updateMany({ where: { id: r.id, status: "FAILED" }, data: { status: "PENDING", attempts: { increment: 1 } } });
  if (claim.count === 0) throw new HttpError(409, "not_failed");
  return { ok: await sendRefund(r.id) };
}

/**
 * Webhook PAYMENT.CAPTURE.REFUNDED / PAYMENT.CAPTURE.REVERSED: money of a capture went back to the payer.
 * Either it is one of our own refunds (confirm it), or PayPal did it (dispute, manual refund).
 */
export async function onCaptureRefunded(resource: any, reason: "PAYPAL_REFUND" | "PAYPAL_REVERSAL") {
  const paypalRefundId: string | undefined = resource?.id;
  const captureId = captureIdOfRefund(resource);
  if (!paypalRefundId || !captureId) return;

  const ours = await db.refund.findFirst({ where: { OR: [{ paypalRefundId }, { captureId, reason: { in: ["GROUP_CANCELLED", "DUPLICATE_CHARGE"] } }] } });
  if (ours) {
    if (ours.status !== "COMPLETED" || !ours.paypalRefundId)
      await db.refund.update({ where: { id: ours.id }, data: { status: "COMPLETED", paypalRefundId: ours.paypalRefundId ?? paypalRefundId } }).catch(() => undefined);
    return;
  }

  const amountCents = paypal.toCents(resource?.amount?.value) ?? 0;
  const c = await db.contribution.findFirst({
    where: { paypalCaptureId: captureId },
    include: { round: { include: { group: true } }, membership: { include: { user: true } } },
  });
  if (c) {
    const g = c.round.group;
    const full = amountCents >= c.amountCents + c.lateFeeCents;
    // The pot has not left yet and the whole contribution went back: it is simply unpaid again.
    const reopen = full && c.status === "PAID" && (c.round.status === "COLLECTING" || c.round.status === "READY");
    const created = await db.refund
      .create({
        data: { groupId: g.id, userId: c.membership.userId, membershipId: c.membershipId, contributionId: c.id, captureId, amountCents, reason, status: "COMPLETED", paypalRefundId, reopened: reopen },
      })
      .catch(() => null);
    if (!created) return; // this refund was already handled
    const who = c.membership.user.name;
    if (reopen) {
      await db.$transaction(async (tx) => {
        const back = await tx.contribution.updateMany({
          where: { id: c.id, status: "PAID", paypalCaptureId: captureId },
          data: { status: "PENDING", paidAt: null, paypalOrderId: null, paypalCaptureId: null, paypalFeeCents: null, paypalNetCents: null, remindersSent: 0, lastReminderAt: null },
        });
        if (back.count === 0) return;
        await tx.round.updateMany({ where: { id: c.roundId, status: "READY" }, data: { status: "COLLECTING" } });
        // A release that was waiting for approval no longer applies: the round is incomplete again.
        await tx.pendingAction.updateMany({
          where: { groupId: g.id, type: "RELEASE_POT", status: "PENDING", payload: { path: ["roundId"], equals: c.roundId } },
          data: { status: "REJECTED", resolvedAt: new Date() },
        });
      });
      await notify(c.membership.userId, g.id, "reminder", g.name, `PayPal te devolvió tu aporte de la ronda ${c.round.number}. Para seguir al día, vuelve a pagarlo desde el grupo.`);
      await notify(g.organizerId, g.id, "action", "PayPal devolvió un aporte", `El aporte de ${who} (ronda ${c.round.number}) volvió a su PayPal y quedó pendiente otra vez.`);
    } else {
      await notify(
        g.organizerId,
        g.id,
        "mediation",
        "PayPal devolvió un aporte",
        `PayPal devolvió $${formatUSD(amountCents)} del aporte de ${who} (ronda ${c.round.number})` +
          (c.round.status === "PAID_OUT" ? " cuando el pozo ya se había enviado. Ese dinero falta en la cuenta: revisa Disputas y habla con la persona." : ". Revisa el historial de pagos.")
      );
    }
    return;
  }

  // An admission deposit of a group that has not started yet.
  const m = await db.membership.findFirst({ where: { depositCaptureId: captureId }, include: { user: true, group: true } });
  if (!m) return; // not a capture of ours
  const created = await db.refund
    .create({ data: { groupId: m.groupId, userId: m.userId, membershipId: m.id, captureId, amountCents, reason, status: "COMPLETED", paypalRefundId } })
    .catch(() => null);
  if (!created) return;
  if (m.group.status === "FORMING" || m.group.status === "ORDERING") {
    // Their deposit is gone, so it can no longer count as their first contribution.
    if (amountCents >= m.group.contributionCents) await db.membership.updateMany({ where: { id: m.id, depositCaptureId: captureId }, data: { depositCaptureId: null } });
    await notify(m.group.organizerId, m.groupId, "action", "PayPal devolvió un depósito", `El depósito de ${m.user.name} volvió a su PayPal. Si sigue en el grupo, pagará la primera ronda normalmente.`);
  }
}

/** Webhook PAYMENT.CAPTURE.DENIED: PayPal did not approve a payment that was under review. Nothing was recorded as paid. */
export async function onCaptureDenied(resource: any) {
  const orderId: string | undefined = resource?.supplementary_data?.related_ids?.order_id;
  if (!orderId) return;
  const c = await db.contribution.findUnique({ where: { paypalOrderId: orderId }, include: { round: { include: { group: true } }, membership: true } });
  if (!c || c.status !== "PENDING") return;
  await notify(c.membership.userId, c.round.groupId, "reminder", c.round.group.name, `PayPal no aprobó tu pago de la ronda ${c.round.number}. No se te cobró. Intenta de nuevo desde el grupo, con otro medio de pago si hace falta.`);
}

/** Webhook PAYMENT.AUTHORIZATION.VOIDED: PayPal released a deposit hold on its own (it expired). */
export async function onAuthorizationVoided(resource: any) {
  const authorizationId: string | undefined = resource?.id;
  if (!authorizationId) return;
  // Our own voids set the request to REJECTED first, so only PayPal-side voids match here.
  const r = await db.joinRequest.findFirst({ where: { authorizationId, status: "PENDING" }, include: { group: true, user: true } });
  if (!r) return;
  const changed = await db.joinRequest.updateMany({ where: { id: r.id, status: "PENDING", authorizationId }, data: { authorizationId: null, depositCents: 0 } });
  if (changed.count === 0) return;
  await notify(r.userId, r.groupId, "action", `Solicitud a ${r.group.name}`, "PayPal liberó tu depósito porque pasó mucho tiempo. No se te cobró nada. Si te aceptan, pagarás la primera ronda normalmente.");
  await notify(r.group.organizerId, r.groupId, "action", "Depósito vencido", `El depósito de ${r.user.name} venció en PayPal. Aún puedes decidir su solicitud.`);
}
