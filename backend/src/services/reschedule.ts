/**
 * Moving turns in a running pasanaku.
 *
 *  1. The organizer drags a turn on the timeline: they decide, so it is applied right away (after the app
 *     asks them to confirm), and both people are told.
 *  2. A member is late and their own turn is still ahead: the assistant PROPOSES swapping them with the next
 *     reliable member. The organizer approves or rejects; silence never applies it (unlike decisions that
 *     would block the group), because nothing is stuck.
 *
 * The due date of each round never moves: a swap changes who receives that round and their guarantee.
 * The AI proposes and explains; the choice of partner is a rule in domain/turns.ts.
 */
import { db } from "../db";
import type { User } from "@prisma/client";
import { pickSwapPartner, swapProblem } from "../domain/turns";
import { explainReschedule } from "../ai/agent";
import { execute } from "./actions";
import { HttpError } from "./errors";
import { logAi } from "./ailog";
import { notify } from "./notify";
import { windows } from "./windows";

async function loadRunningGroup(groupId: string) {
  const group = await db.group.findUnique({
    where: { id: groupId },
    include: { memberships: { include: { user: { select: { id: true, name: true, locale: true } } } }, rounds: true },
  });
  if (!group) throw new HttpError(404, "not_found");
  if (group.status !== "ACTIVE") throw new HttpError(409, "group_not_active");
  return group;
}

/** The organizer swaps the turns of two members (the timeline's drag and drop). */
export async function swapTurnsAsOrganizer(user: User, groupId: string, aId: string, bId: string, reason?: string) {
  const group = await loadRunningGroup(groupId);
  if (group.organizerId !== user.id) throw new HttpError(403, "organizer_only");
  const a = group.memberships.find((m) => m.id === aId);
  const b = group.memberships.find((m) => m.id === bId);
  if (!a || !b) throw new HttpError(404, "member_not_found");
  const roundA = group.rounds.find((r) => r.recipientId === a.id);
  const roundB = group.rounds.find((r) => r.recipientId === b.id);
  if (!roundA || !roundB) throw new HttpError(409, "round_not_upcoming");
  const problem = swapProblem({ memberId: a.id, roundStatus: roundA.status }, { memberId: b.id, roundStatus: roundB.status });
  if (problem) throw new HttpError(409, problem);

  const note = reason?.trim().slice(0, 200);
  const action = await db.pendingAction.create({
    data: {
      groupId,
      type: "SWAP_TURNS",
      payload: { a: a.id, b: b.id, reason: note ?? "Decisión del organizador" },
      summary: `Cambiar turnos: ${a.user.name} (#${a.turn}) ↔ ${b.user.name} (#${b.turn}).${note ? ` Motivo: ${note}` : ""}`,
      createdBy: user.id,
      expiresAt: new Date(),
    },
  });
  // The organizer is the one deciding, so this is their approval.
  await execute(action, "APPROVED");
  const done = await db.pendingAction.findUniqueOrThrow({ where: { id: action.id } });
  const fresh = await db.round.findMany({ where: { id: { in: [roundA.id, roundB.id] } } });
  const applied = fresh.find((r) => r.id === roundA.id)?.recipientId === b.id;
  if (!applied) throw new HttpError(409, "round_not_upcoming");

  for (const [m, other, turn] of [[a, b, b.turn], [b, a, a.turn]] as const) {
    if (m.userId === user.id) continue;
    await notify(m.userId, groupId, "action", `Cambio de turno · ${group.name}`, `El organizador cambió tu turno con el de ${other.user.name}: ahora te toca en la ronda ${turn}.`);
  }
  await logAi({
    groupId,
    kind: "reschedule",
    source: "rules",
    subject: `Cambio de turnos: ${a.user.name} ↔ ${b.user.name}`,
    consulted: { a: { name: a.user.name, turn: a.turn }, b: { name: b.user.name, turn: b.turn }, rounds: [roundA.number, roundB.number] },
    output: `El organizador intercambió los turnos. Las fechas de cada ronda no cambian: cambia quién cobra.${note ? ` Motivo: ${note}` : ""}`,
  });
  return { ok: true, actionId: done.id };
}

/**
 * A contribution went past its grace period. If the member's own turn is still ahead, propose swapping
 * them with the nearest later turn of a member who is up to date. Returns the proposal, or null.
 */
export async function proposeRescheduleForLate(groupId: string, lateMembershipId: string, now = new Date()) {
  const group = await db.group.findUnique({
    where: { id: groupId },
    include: { memberships: { include: { user: { select: { id: true, name: true, locale: true } } } }, rounds: { include: { contributions: true } } },
  });
  if (!group || group.status !== "ACTIVE") return null;
  const late = group.memberships.find((m) => m.id === lateMembershipId);
  const lateRound = group.rounds.find((r) => r.recipientId === lateMembershipId);
  if (!late || late.turn == null || !lateRound || lateRound.status !== "UPCOMING") return null;

  // Who is late right now: a pending contribution in a round whose due date has passed.
  const lateNow = (membershipId: string) =>
    group.rounds.some((r) => r.status === "COLLECTING" && r.dueAt.getTime() < now.getTime() && r.contributions.some((c) => c.membershipId === membershipId && c.status === "PENDING"));
  const partner = pickSwapPartner(
    late.turn,
    group.memberships
      .filter((m) => m.id !== late.id && m.turn != null)
      .map((m) => ({
        membershipId: m.id,
        turn: m.turn!,
        riskScore: m.riskScore,
        roundStatus: (group.rounds.find((r) => r.recipientId === m.id)?.status ?? "PAID_OUT") as "UPCOMING" | "COLLECTING" | "READY" | "PAID_OUT",
        lateNow: lateNow(m.id),
      }))
  );
  if (!partner) return null;
  const other = group.memberships.find((m) => m.id === partner.membershipId)!;

  // One proposal at a time for this pair.
  const existing = await db.pendingAction.findMany({ where: { groupId, type: "SWAP_TURNS", status: "PENDING" } });
  if (existing.some((a) => [(a.payload as any).a, (a.payload as any).b].includes(late.id) && [(a.payload as any).a, (a.payload as any).b].includes(other.id))) return null;

  const organizer = group.memberships.find((m) => m.userId === group.organizerId);
  const why = await explainReschedule({
    groupId,
    lateName: late.user.name,
    lateUserId: late.userId,
    partnerName: other.user.name,
    locale: organizer?.user.locale ?? "es",
  });
  const action = await db.pendingAction.create({
    data: {
      groupId,
      type: "SWAP_TURNS",
      // noAuto: if the organizer does not answer, the proposal simply expires. Nothing is blocked, so it never applies itself.
      payload: { a: late.id, b: other.id, reason: why, noAuto: true },
      summary: `Cambiar turnos: ${late.user.name} (#${late.turn}) ↔ ${other.user.name} (#${other.turn}). ${why}`,
      createdBy: "ai",
      expiresAt: new Date(now.getTime() + windows(group).approval),
    },
  });
  await notify(group.organizerId, groupId, "action", "Propuesta de cambio de turnos", `${late.user.name} se atrasó y su turno llega antes. El asistente propone cambiarlo con ${other.user.name}. Tú decides.`);
  return action;
}
