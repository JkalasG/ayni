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
import { lateFeeCents, retentionCents, formatUSD } from "../domain/rules";
import { HttpError } from "./groups";
import { notify, postToGroupChat } from "./notify";

/** Member wants to pay their contribution: create a PayPal order and return the approval URL. */
export async function startCheckout(user: User, contributionId: string, appRedirect: string) {
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
  });
  await db.contribution.update({ where: { id: c.id }, data: { paypalOrderId: order.id } });
  return { approveUrl: order.approveUrl, amountCents: c.amountCents + fee, lateFeeCents: fee };
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
  try {
    const cap = await paypal.captureOrder(orderId);
    if (cap.status !== "COMPLETED") throw new HttpError(402, `capture_${cap.status}`);
    captureId = cap.captureId;
  } catch (e) {
    // Already captured (e.g. the webhook won the race): confirm with PayPal instead of failing.
    const order = await paypal.getOrder(orderId);
    if (order.status !== "COMPLETED") throw e;
  }

  const updated = await db.contribution.updateMany({
    where: { id: c.id, status: "PENDING" },
    data: { status: "PAID", paidAt: new Date(), paypalCaptureId: captureId },
  });
  if (updated.count === 1) {
    await postToGroupChat(
      c.round.groupId,
      `✅ ${c.membership.user.name} pagó su aporte de la ronda ${c.round.number} ($${formatUSD(c.amountCents + c.lateFeeCents)}).`
    );
    await maybeReleaseRetention(c.membershipId);
  }
  return c;
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

  const pot = round.contributions.reduce((s, c) => s + c.amountCents + c.lateFeeCents, 0);
  const members = round.group.memberships.length;
  const held = retentionCents(pot, round.recipient.retentionPct, round.group.contributionCents, round.recipient.turn!, members);
  const net = pot - held;

  const payout = await db.payout.create({
    data: { roundId, membershipId: round.recipientId, kind: "POT", amountCents: net },
  });
  await db.membership.update({
    where: { id: round.recipientId },
    data: { retentionHeldCents: { increment: held } },
  });

  try {
    const res = await paypal.sendPayout({
      senderBatchId: payout.id,
      email: round.recipient.user.email,
      amountCents: net,
      subject: `Ayni: ¡recibiste el pozo de ${round.group.name}!`,
      note: `Ronda ${round.number}. Retenido como garantía: $${formatUSD(held)}, se te devuelve al completar tus aportes.`,
    });
    await db.payout.update({ where: { id: payout.id }, data: { status: "SENT", paypalBatchId: res.batchId } });
  } catch (e) {
    await db.payout.update({ where: { id: payout.id }, data: { status: "FAILED" } });
    await notify(round.group.organizerId, round.groupId, "action", "Error al enviar el pozo", String(e));
    throw e;
  }

  await postToGroupChat(
    round.groupId,
    `🎉 Pozo de la ronda ${round.number} enviado a ${round.recipient.user.name}: $${formatUSD(net)}` +
      (held ? ` (garantía retenida: $${formatUSD(held)})` : "")
  );
  await notify(round.recipient.userId, round.groupId, "pot", "¡Recibiste el pozo!", `$${formatUSD(net)} llegaron a tu PayPal.`);
  await openNextRound(round.groupId, round.number);
  await maybeReleaseRetention(round.recipientId);
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
  await postToGroupChat(groupId, "🌄 ¡El pasanaku terminó! Gracias por cumplir. Ayni: hoy por ti, mañana por mí.");
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
  try {
    const res = await paypal.sendPayout({
      senderBatchId: payout.id,
      email: m.user.email,
      amountCents: amount,
      subject: `Ayni: te devolvemos tu garantía de ${m.group.name}`,
      note: "Cumpliste con todos tus aportes. ¡Gracias!",
    });
    await db.payout.update({ where: { id: payout.id }, data: { status: "SENT", paypalBatchId: res.batchId } });
    await notify(m.userId, m.groupId, "pot", "Garantía devuelta", `$${formatUSD(amount)} volvieron a tu PayPal.`);
  } catch (e) {
    await db.payout.update({ where: { id: payout.id }, data: { status: "FAILED" } });
    throw e;
  }
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
  const needed = c.amountCents + fee;
  if (c.membership.retentionHeldCents < needed) return false;
  await db.$transaction([
    db.membership.update({ where: { id: c.membershipId }, data: { retentionHeldCents: { decrement: needed } } }),
    db.contribution.update({ where: { id: c.id }, data: { status: "COVERED", lateFeeCents: fee, paidAt: new Date() } }),
  ]);
  return true;
}
