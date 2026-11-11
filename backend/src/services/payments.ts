/**
 * Money movement. Every PayPal call here is either initiated by the member
 * themselves (paying a contribution) or by an approved / auto-executed
 * PendingAction. The AI never calls these functions directly.
 */
import { db } from "../db";
import type { User } from "@prisma/client";
import * as paypal from "../paypal";
import { config } from "../config";
import { appendQuery, isAllowedRedirect, signState } from "../auth";
import { coverageFromGuarantee, lateFeeCents, retentionCents, formatUSD } from "../domain/rules";
import { HttpError } from "./errors";
import { notify, postToGroupChat } from "./notify";

/** Member wants to pay their contribution: create a PayPal order and return the approval URL. */
export async function startCheckout(user: User, contributionId: string, appRedirect: string, popup = false) {
  if (!isAllowedRedirect(appRedirect)) throw new HttpError(400, "redirect_not_allowed");
  const c = await db.contribution.findUnique({
    where: { id: contributionId },
    include: { membership: true, round: { include: { group: true } } },
  });
  if (!c || c.membership.userId !== user.id) throw new HttpError(404, "not_found");
  if (c.status !== "PENDING") throw new HttpError(409, "already_settled");
  if (c.round.status !== "COLLECTING") throw new HttpError(409, "round_not_open");

  // Late fee applies as soon as the due date has passed.
  const fee = Date.now() > c.round.dueAt.getTime() ? lateFeeCents(c.amountCents, c.round.group.lateFeePct) : 0;
  if (fee !== c.lateFeeCents) await db.contribution.update({ where: { id: c.id }, data: { lateFeeCents: fee } });

  const state = signState({ cid: c.id, redirect: appRedirect });
  const order = await paypal.createOrder({
    amountCents: c.amountCents + fee,
    customId: c.id,
    description: `Ayni · ${c.round.group.name} · ronda ${c.round.number}`,
    returnUrl: `${config.publicApiUrl}/paypal/return?state=${encodeURIComponent(state)}`,
    cancelUrl: appendQuery(appRedirect, { status: "cancelled" }),
    locale: user.locale,
    popup,
  });
  await db.contribution.update({ where: { id: c.id }, data: { paypalOrderId: order.id } });
  return { approveUrl: order.approveUrl, orderId: order.id, amountCents: c.amountCents + fee, lateFeeCents: fee };
}

/** Popup flow: the page says the buyer approved `orderId`. Only the owner of that contribution can capture it. */
export async function captureForMember(user: User, contributionId: string, orderId: string) {
  const c = await db.contribution.findUnique({ where: { id: contributionId }, include: { membership: true } });
  if (!c || c.membership.userId !== user.id) throw new HttpError(404, "not_found");
  if (c.paypalOrderId !== orderId) throw new HttpError(409, "order_mismatch");
  await completeContribution(orderId); // idempotent: a webhook may have captured it first
  return { status: "paid" as const };
}

/** Called when PayPal redirects back, and again (idempotently) by the webhook. */
export async function completeContribution(orderId: string) {
  const c = await db.contribution.findUnique({
    where: { paypalOrderId: orderId },
    include: { membership: { include: { user: true } }, round: { include: { group: true } } },
  });
  if (!c) throw new HttpError(404, "contribution_not_found");
  if (c.status !== "PENDING") return c;

  let captureId: string | undefined;
  let fee: { paypalFeeCents?: number; paypalNetCents?: number } = {};
  try {
    const cap = await paypal.captureOrder(orderId);
    if (cap.status !== "COMPLETED") throw new HttpError(402, `capture_${cap.status}`);
    captureId = cap.captureId;
    fee = { paypalFeeCents: cap.feeCents, paypalNetCents: cap.netCents };
  } catch (e) {
    // Already captured (e.g. the webhook won the race): confirm with PayPal instead of failing.
    const order = await paypal.getOrder(orderId);
    if (order.status !== "COMPLETED") throw e;
  }

  const updated = await db.contribution.updateMany({
    where: { id: c.id, status: "PENDING" },
    data: { status: "PAID", paidAt: new Date(), paypalCaptureId: captureId, ...fee },
  });
  if (updated.count === 1) {
    // No amount in the group chat: it would reveal a late fee.
    await postToGroupChat(c.round.groupId, `${c.membership.user.name} pagó su aporte de la ronda ${c.round.number}.`, { type: "paid", name: c.membership.user.name, round: c.round.number });
    await settleInvoice(c.paypalInvoiceId);
    await maybeReleaseRetention(c.membershipId);
  }
  return c;
}

/** The contribution got settled another way: cancel its open PayPal invoice (best effort). */
async function settleInvoice(invoiceId: string | null) {
  if (invoiceId) await paypal.cancelInvoice(invoiceId).catch((e) => console.error("cancel invoice failed", e));
}

/**
 * "Firm" stage: send a formal PayPal invoice for the overdue contribution (+ late fee).
 * The member can pay it from their email even without opening the app.
 */
export async function sendOverdueInvoice(contributionId: string) {
  const c = await db.contribution.findUnique({
    where: { id: contributionId },
    include: { membership: { include: { user: true } }, round: { include: { group: true } } },
  });
  if (!c || c.status !== "PENDING" || c.paypalInvoiceId) return null;
  const g = c.round.group;
  const items = [{ name: `Aporte ronda ${c.round.number} · ${g.name}`, amountCents: c.amountCents }];
  if (c.lateFeeCents > 0) items.push({ name: "Multa por atraso (va al pozo)", amountCents: c.lateFeeCents });
  const invoiceId = await paypal.createAndSendInvoice({
    reference: c.id,
    email: c.membership.user.email,
    name: c.membership.user.name,
    items,
    note: `Ayni · ${g.name}. Tu aporte está vencido; el grupo te espera. Puedes pagar aquí o desde la app.`,
    dueDate: new Date(),
  });
  await db.contribution.update({ where: { id: c.id }, data: { paypalInvoiceId: invoiceId } });
  return invoiceId;
}

/** Webhook INVOICING.INVOICE.PAID: the member paid the invoice from their email. */
export async function completeInvoice(invoiceId: string) {
  const c = await db.contribution.findUnique({
    where: { paypalInvoiceId: invoiceId },
    include: { membership: { include: { user: true } }, round: true },
  });
  if (!c) return;
  const updated = await db.contribution.updateMany({
    where: { id: c.id, status: "PENDING" },
    data: { status: "PAID", paidAt: new Date() },
  });
  if (updated.count === 1) {
    await postToGroupChat(c.round.groupId, `${c.membership.user.name} pagó su aporte de la ronda ${c.round.number}.`, { type: "paid", name: c.membership.user.name, round: c.round.number });
    await maybeReleaseRetention(c.membershipId);
  } else {
    // Paid twice (checkout + invoice): the organizer must refund one of them from PayPal.
    const g = await db.group.findUniqueOrThrow({ where: { id: c.round.groupId } });
    await notify(g.organizerId, g.id, "action", "Pago duplicado", `${c.membership.user.name} pagó la factura de un aporte que ya estaba saldado. Reembólsalo desde PayPal.`);
  }
}

/** Pot = all contributions (+ late fees). Recipient gets pot minus their retention. */
export async function releasePot(roundId: string) {
  const round = await db.round.findUnique({
    where: { id: roundId },
    include: {
      contributions: true,
      group: { include: { memberships: true } },
      recipient: { include: { user: true } },
    },
  });
  if (!round) throw new HttpError(404, "round_not_found");

  // Claim the round atomically so a double click / retry cannot pay twice.
  const claim = await db.round.updateMany({ where: { id: roundId, status: "READY" }, data: { status: "PAID_OUT" } });
  if (claim.count === 0) return;

  // Paid or covered contributions (+ late fees), plus whatever was recovered from a defaulter's guarantee.
  const pot = round.contributions.reduce(
    (s, c) => s + (c.status === "DEFAULTED" ? c.recoveredCents : c.amountCents + c.lateFeeCents),
    0
  );
  const members = round.group.memberships.length;
  const held = retentionCents(pot, round.recipient.retentionPct, round.group.contributionCents, round.recipient.turn!, members);

  // If the recipient left a contribution unpaid in an earlier round, that debt comes out of their pot
  // and goes to whoever received less because of it.
  const debts = await db.contribution.findMany({
    // Earlier rounds only: a default in THIS round already made this pot smaller.
    where: { membershipId: round.recipientId, status: "DEFAULTED", roundId: { not: roundId } },
    include: { round: { include: { recipient: { include: { user: true } } } } },
    orderBy: { round: { number: "asc" } },
  });
  let available = pot - held;
  const compensations: { contributionId: string; to: { id: string; user: paypal.PayoutRecipient }; cents: number; round: number }[] = [];
  for (const d of debts) {
    const shortfall = d.amountCents - d.recoveredCents - d.compensatedCents;
    if (shortfall <= 0 || available <= 0) continue;
    const cents = Math.min(shortfall, available);
    available -= cents;
    compensations.push({
      contributionId: d.id,
      to: { id: d.round.recipientId, user: d.round.recipient.user },
      cents,
      round: d.round.number,
    });
  }
  const debtCents = pot - held - available;
  const net = available;

  await db.membership.update({
    where: { id: round.recipientId },
    data: { retentionHeldCents: { increment: held } },
  });
  if (net > 0) {
    const payout = await db.payout.create({
      data: { roundId, membershipId: round.recipientId, kind: "POT", amountCents: net },
    });
    // A failed payout never freezes the group: it is recorded and the organizer can retry it.
    await sendRecordedPayout(payout.id, {
      to: round.recipient.user,
      subject: `Ayni: ¡recibiste el pozo de ${round.group.name}!`,
      note: `Ronda ${round.number}. Retenido como garantía: $${formatUSD(held)}, se te devuelve al completar tus aportes.`,
      organizerId: round.group.organizerId,
      groupId: round.groupId,
    });
  }

  for (const comp of compensations) {
    await db.contribution.update({ where: { id: comp.contributionId }, data: { compensatedCents: { increment: comp.cents } } });
    const p = await db.payout.create({ data: { roundId, membershipId: comp.to.id, kind: "COMPENSATION", amountCents: comp.cents } });
    await sendRecordedPayout(p.id, {
      to: comp.to.user,
      subject: `Ayni: completamos tu pozo de ${round.group.name}`,
      note: `En la ronda ${comp.round} faltó un aporte. Lo descontamos del pozo de quien no pagó.`,
      organizerId: round.group.organizerId,
      groupId: round.groupId,
    });
  }

  await postToGroupChat(
    round.groupId,
    `Pozo de la ronda ${round.number} enviado a ${round.recipient.user.name}: $${formatUSD(net)}` +
      (held ? ` (garantía retenida: $${formatUSD(held)})` : ""),
    { type: "pot", name: round.recipient.user.name, round: round.number, amountCents: net, heldCents: held }
  );
  if (debtCents) {
    await notify(round.recipient.userId, round.groupId, "pot", "Descuento en tu pozo", `Se descontaron $${formatUSD(debtCents)} por aportes que quedaron impagos; se devolvieron a quienes recibieron de menos.`);
    await notify(round.group.organizerId, round.groupId, "action", "Compensación enviada", `Del pozo de ${round.recipient.user.name} se descontaron $${formatUSD(debtCents)} por aportes impagos.`);
  }
  await notify(round.recipient.userId, round.groupId, "pot", "¡Recibiste el pozo!", `$${formatUSD(net)} llegaron a tu PayPal.`);
  await openNextRound(round.groupId, round.number);
  await maybeReleaseRetention(round.recipientId);
}

async function sendRecordedPayout(
  payoutId: string,
  p: { to: paypal.PayoutRecipient; subject: string; note: string; organizerId: string; groupId: string }
): Promise<boolean> {
  const payout = await db.payout.findUniqueOrThrow({ where: { id: payoutId } });
  try {
    // sender_batch_id = our payout id: sending the same record twice can never pay twice.
    const res = await paypal.sendPayout({ senderBatchId: payout.id, to: p.to, amountCents: payout.amountCents, subject: p.subject, note: p.note });
    await db.payout.update({ where: { id: payout.id }, data: { status: "SENT", paypalBatchId: res.batchId } });
    return true;
  } catch (e) {
    const kind = paypal.payoutErrorKind(e);
    console.error(`payout ${kind}`, payout.id, e);
    if (kind === "duplicate") {
      // An earlier attempt with this same id reached PayPal: it is sent.
      await db.payout.update({ where: { id: payout.id }, data: { status: "SENT" } });
      return true;
    }
    // "unknown" is retried automatically with the SAME id; "failed" waits for the organizer.
    await db.payout.update({ where: { id: payout.id }, data: { status: kind === "unknown" ? "UNKNOWN" : "FAILED" } });
    if (kind === "failed")
      await notify(p.organizerId, p.groupId, "action", "Error al enviar un pago", `No se pudo enviar $${formatUSD(payout.amountCents)}. Puedes reintentarlo desde el grupo.`);
    return false;
  }
}

function payoutTexts(kind: string, groupName: string) {
  return {
    POT: { subject: `Ayni: ¡recibiste el pozo de ${groupName}!`, note: "Tu pozo del pasanaku." },
    RETENTION_RELEASE: { subject: `Ayni: te devolvemos tu garantía de ${groupName}`, note: "Cumpliste con todos tus aportes. ¡Gracias!" },
    COMPENSATION: { subject: `Ayni: completamos tu pozo de ${groupName}`, note: "Faltó un aporte en tu ronda; lo descontamos del pozo de quien no pagó." },
  }[kind] ?? { subject: `Ayni · ${groupName}`, note: "Pago de tu pasanaku." };
}

/** Engine: payouts whose outcome is unknown are re-sent with the SAME id (PayPal deduplicates). */
export async function retryUnknownPayouts() {
  const stale = await db.payout.findMany({
    where: { status: "UNKNOWN", createdAt: { lte: new Date(Date.now() - 60_000) } },
    include: { membership: { include: { user: true, group: true } } },
    take: 20,
  });
  for (const p of stale) {
    const claim = await db.payout.updateMany({ where: { id: p.id, status: "UNKNOWN" }, data: { status: "PENDING" } });
    if (claim.count === 0) continue;
    const g = p.membership.group;
    await sendRecordedPayout(p.id, { to: p.membership.user, ...payoutTexts(p.kind, g.name), organizerId: g.organizerId, groupId: g.id });
  }
}

/** Organizer retries a failed payout. A new record (and PayPal batch id) keeps PayPal's idempotency intact. */
export async function retryPayout(user: User, payoutId: string) {
  const old = await db.payout.findUnique({
    where: { id: payoutId },
    include: { membership: { include: { user: true, group: true } } },
  });
  if (!old) throw new HttpError(404, "not_found");
  const g = old.membership.group;
  if (g.organizerId !== user.id) throw new HttpError(403, "organizer_only");

  if (old.status === "UNKNOWN") {
    // Maybe PayPal has it: re-send the SAME record, never a new one.
    const claim = await db.payout.updateMany({ where: { id: old.id, status: "UNKNOWN" }, data: { status: "PENDING" } });
    if (claim.count === 0) throw new HttpError(409, "already_retrying");
    const ok = await sendRecordedPayout(old.id, { to: old.membership.user, ...payoutTexts(old.kind, g.name), organizerId: g.organizerId, groupId: g.id });
    return { ok };
  }

  const fresh = await db.payout.create({
    data: { roundId: old.roundId, membershipId: old.membershipId, kind: old.kind, amountCents: old.amountCents },
  });
  // Claim the failed record so two clicks cannot send twice.
  const claim = await db.payout.updateMany({ where: { id: old.id, status: "FAILED", retriedById: null }, data: { retriedById: fresh.id } });
  if (claim.count === 0) {
    await db.payout.delete({ where: { id: fresh.id } });
    throw new HttpError(409, "not_failed");
  }
  const ok = await sendRecordedPayout(fresh.id, {
    to: old.membership.user,
    ...payoutTexts(old.kind, g.name),
    organizerId: g.organizerId,
    groupId: g.id,
  });
  if (ok) await notify(g.organizerId, g.id, "pot", "Pago reenviado", `Se reenvió con éxito $${formatUSD(old.amountCents)} a ${old.membership.user.name}.`);
  return { ok };
}

async function openNextRound(groupId: string, finishedNumber: number) {
  const next = await db.round.findUnique({ where: { groupId_number: { groupId, number: finishedNumber + 1 } } });
  if (next) {
    await db.round.update({ where: { id: next.id }, data: { status: "COLLECTING" } });
    return;
  }
  // No more rounds: the cycle is over. Release everything still held.
  const memberships = await db.membership.findMany({ where: { groupId, retentionHeldCents: { gt: 0 } } });
  for (const m of memberships) await releaseRetention(m.id);
  await db.group.update({ where: { id: groupId }, data: { status: "FINISHED" } });
  await postToGroupChat(groupId, "¡El pasanaku terminó! Gracias por cumplir. Ayni: hoy por ti, mañana por mí.", { type: "finished" });
}

/** Give back the guarantee as soon as the member has no pending contributions left. */
export async function maybeReleaseRetention(membershipId: string) {
  const m = await db.membership.findUnique({ where: { id: membershipId } });
  if (!m || m.retentionHeldCents <= 0) return;
  const pending = await db.contribution.count({ where: { membershipId, status: "PENDING" } });
  if (pending === 0) await releaseRetention(membershipId);
}

async function releaseRetention(membershipId: string) {
  const m = await db.membership.findUnique({ where: { id: membershipId }, include: { user: true, group: true } });
  if (!m || m.retentionHeldCents <= 0) return;
  const amount = m.retentionHeldCents;
  const claim = await db.membership.updateMany({
    where: { id: m.id, retentionHeldCents: amount },
    data: { retentionHeldCents: 0 },
  });
  if (claim.count === 0) return;
  const payout = await db.payout.create({ data: { membershipId: m.id, kind: "RETENTION_RELEASE", amountCents: amount } });
  const ok = await sendRecordedPayout(payout.id, {
    to: m.user,
    subject: `Ayni: te devolvemos tu garantía de ${m.group.name}`,
    note: "Cumpliste con todos tus aportes. ¡Gracias!",
    organizerId: m.group.organizerId,
    groupId: m.groupId,
  });
  if (ok) await notify(m.userId, m.groupId, "pot", "Garantía devuelta", `$${formatUSD(amount)} volvieron a tu PayPal.`);
}

/**
 * Overdue past the grace period: cover the contribution (and its late fee)
 * with the member's retention, if they have enough held.
 */
export async function coverWithRetention(contributionId: string): Promise<boolean> {
  const c = await db.contribution.findUnique({
    where: { id: contributionId },
    include: { membership: true, round: { include: { group: true } } },
  });
  if (!c || c.status !== "PENDING") return false;
  const fee = lateFeeCents(c.amountCents, c.round.group.lateFeePct);
  const cover = coverageFromGuarantee(c.membership.retentionHeldCents, c.amountCents, fee);
  if (!cover) return false;
  const needed = cover.amount + cover.fee;
  // Conditional updates: a payment arriving at the same moment wins, and nothing is taken twice.
  const done = await db
    .$transaction(async (tx) => {
      const claim = await tx.contribution.updateMany({
        where: { id: c.id, status: "PENDING" },
        data: { status: "COVERED", lateFeeCents: cover.fee, paidAt: new Date() },
      });
      if (claim.count === 0) return false;
      const take = await tx.membership.updateMany({
        where: { id: c.membershipId, retentionHeldCents: { gte: needed } },
        data: { retentionHeldCents: { decrement: needed } },
      });
      if (take.count === 0) throw new Error("guarantee_changed"); // rolls back the claim
      return true;
    })
    .catch(() => false);
  if (done) await settleInvoice(c.paypalInvoiceId);
  return done;
}

/**
 * Unpaid and the guarantee is not enough: the organizer (or the timeout) lets the
 * round close without it. Whatever guarantee they still hold goes to the pot, and
 * it stays on their trust profile as an abandoned pasanaku.
 */
export async function waiveContribution(contributionId: string) {
  const c = await db.contribution.findUnique({
    where: { id: contributionId },
    include: { membership: { include: { user: true } }, round: true },
  });
  if (!c || c.status !== "PENDING") return;
  const recovered = Math.min(c.membership.retentionHeldCents, c.amountCents);
  const done = await db.$transaction(async (tx) => {
    const claim = await tx.contribution.updateMany({
      where: { id: c.id, status: "PENDING" },
      data: { status: "DEFAULTED", lateFeeCents: 0, recoveredCents: recovered },
    });
    if (claim.count === 0) return false;
    if (recovered > 0)
      await tx.membership.update({ where: { id: c.membershipId }, data: { retentionHeldCents: { decrement: recovered } } });
    return true;
  });
  if (!done) return;
  await settleInvoice(c.paypalInvoiceId);
  // Details only to the person and the organizer; the group just sees the round move on.
  const detail =
    `Tu aporte de la ronda ${c.round.number} quedó impago. ` +
    (recovered ? `Se usaron $${formatUSD(recovered)} de tu garantía. ` : "") +
    "Se descontará de tu pozo y queda en tu perfil de confianza. Si quieres hablar, el asistente puede ayudarte.";
  await notify(c.membership.userId, c.round.groupId, "mediation", "Aporte impago", detail);
  await postToGroupChat(c.round.groupId, `La ronda ${c.round.number} se cerró por decisión del organizador.`);
}
