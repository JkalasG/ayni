/**
 * Human-in-the-loop: important decisions become PendingActions.
 * The organizer approves or rejects; if they stay silent past the timeout,
 * the engine auto-executes (so the group is never blocked).
 */
import { db } from "../db";
import type { PendingAction, User } from "@prisma/client";
import { HttpError, applyOrder } from "./groups";
import { releasePot } from "./payments";
import { postToGroupChat } from "./notify";

export async function resolveAction(user: User, actionId: string, approve: boolean) {
  const action = await db.pendingAction.findUnique({ where: { id: actionId }, include: { group: true } });
  if (!action) throw new HttpError(404, "not_found");
  if (action.group.organizerId !== user.id) throw new HttpError(403, "organizer_only");
  if (action.status !== "PENDING") throw new HttpError(409, "already_resolved");

  if (!approve) {
    await db.pendingAction.update({ where: { id: action.id }, data: { status: "REJECTED", resolvedAt: new Date() } });
    await postToGroupChat(action.groupId, `❌ El organizador rechazó: ${action.summary}`);
    return;
  }
  await execute(action, "APPROVED");
}

export async function execute(action: PendingAction, finalStatus: "APPROVED" | "AUTO_EXECUTED") {
  // claim first: never execute the same action twice
  const claim = await db.pendingAction.updateMany({
    where: { id: action.id, status: "PENDING" },
    data: { status: finalStatus, resolvedAt: new Date() },
  });
  if (claim.count === 0) return;
  const payload = action.payload as any;

  switch (action.type) {
    case "RELEASE_POT":
      await releasePot(payload.roundId);
      break;
    case "APPROVE_ORDER":
      await applyOrder(action.groupId, payload.order);
      await postToGroupChat(action.groupId, "📋 Orden de turnos confirmado. El organizador ya puede iniciar el pasanaku.");
      break;
    case "SWAP_TURNS":
      await swapTurns(action.groupId, payload.a, payload.b);
      break;
    case "APPLY_LATE_FEE":
      // late fees are applied automatically by the group rules; kept for future manual fees
      break;
  }
  if (finalStatus === "AUTO_EXECUTED") {
    await postToGroupChat(action.groupId, `⏱️ Se ejecutó automáticamente (sin respuesta del organizador): ${action.summary}`);
  }
}

/** Swap two members' turns, only for rounds that haven't been paid out yet. */
async function swapTurns(groupId: string, membershipA: string, membershipB: string) {
  const rounds = await db.round.findMany({
    where: { groupId, recipientId: { in: [membershipA, membershipB] } },
  });
  if (rounds.length !== 2 || rounds.some((r) => r.status === "PAID_OUT" || r.status === "READY"))
    throw new HttpError(409, "cannot_swap_after_payout");
  const [ra, rb] = rounds;
  const ma = await db.membership.findUniqueOrThrow({ where: { id: ra.recipientId } });
  const mb = await db.membership.findUniqueOrThrow({ where: { id: rb.recipientId } });
  await db.$transaction([
    db.round.update({ where: { id: ra.id }, data: { recipientId: rb.recipientId } }),
    db.round.update({ where: { id: rb.id }, data: { recipientId: ra.recipientId } }),
    db.membership.update({ where: { id: ma.id }, data: { turn: mb.turn, retentionPct: mb.retentionPct } }),
    db.membership.update({ where: { id: mb.id }, data: { turn: ma.turn, retentionPct: ma.retentionPct } }),
  ]);
  await postToGroupChat(groupId, "🔄 Cambio de turnos aplicado.");
}
