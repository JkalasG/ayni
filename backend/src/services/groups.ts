/**
 * Group lifecycle: create -> join -> set turn order -> start.
 */
import { db } from "../db";
import { Prisma, type Frequency, type OrderMethod, type User } from "@prisma/client";
import {
  adjustedRetentionPct,
  baseRetentionPct,
  generateInviteCode,
  lotteryOrder,
  riskScore,
  roundDueDate,
} from "../domain/rules";
import { proposeTurnOrder } from "../ai/agent";
import { postToGroupChat, notify } from "./notify";

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function createGroup(
  user: User,
  input: {
    name: string;
    contributionCents: number;
    frequency: Frequency;
    orderMethod: OrderMethod;
    maxMembers: number;
    lateFeePct: number;
    maxRetentionPct: number;
    demoMode: boolean;
    demoRoundMinutes?: number;
  }
) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await db.group.create({
        data: {
          ...input,
          inviteCode: generateInviteCode(),
          organizerId: user.id,
          memberships: { create: { userId: user.id } },
        },
      });
    } catch (e) {
      // retry only on invite code collision
      if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) throw e;
    }
  }
  throw new HttpError(500, "Could not generate invite code");
}

export async function joinGroup(user: User, code: string) {
  const group = await db.group.findUnique({
    where: { inviteCode: code.trim().toUpperCase() },
    include: { memberships: true },
  });
  if (!group) throw new HttpError(404, "invite_not_found");
  if (group.memberships.some((m) => m.userId === user.id)) return group;
  if (group.status !== "FORMING") throw new HttpError(409, "group_already_started");
  if (group.memberships.length >= group.maxMembers) throw new HttpError(409, "group_full");
  await db.membership.create({ data: { userId: user.id, groupId: group.id } });
  await notify(group.organizerId, group.id, "action", "Nuevo miembro", `${user.name} se unió a ${group.name}`);
  return group;
}

/** Risk score from each member's history across ALL their Ayni groups. */
async function computeRisk(userId: string) {
  const contributions = await db.contribution.findMany({
    where: { membership: { userId }, status: { in: ["PAID", "COVERED"] } },
    include: { round: true },
  });
  let onTime = 0, late = 0, covered = 0;
  for (const c of contributions) {
    if (c.status === "COVERED") covered++;
    else if (c.paidAt && c.paidAt > c.round.dueAt) late++;
    else onTime++;
  }
  return { history: { onTime, late, covered }, score: riskScore({ onTime, late, covered }) };
}

/**
 * Decide the turn order. LOTTERY and ORGANIZER apply immediately.
 * AI proposes an order with reasons and waits for the organizer's approval.
 */
export async function setTurnOrder(user: User, groupId: string, organizerOrder?: string[]) {
  const group = await db.group.findUnique({
    where: { id: groupId },
    include: { memberships: { include: { user: true } } },
  });
  if (!group) throw new HttpError(404, "not_found");
  if (group.organizerId !== user.id) throw new HttpError(403, "organizer_only");
  if (group.status !== "FORMING" && group.status !== "ORDERING") throw new HttpError(409, "already_started");
  if (group.memberships.length < 2) throw new HttpError(409, "need_at_least_2_members");

  // refresh risk scores
  const risks = new Map<string, { score: number; history: { onTime: number; late: number; covered: number } }>();
  for (const m of group.memberships) {
    const r = await computeRisk(m.userId);
    risks.set(m.id, r);
    await db.membership.update({ where: { id: m.id }, data: { riskScore: r.score } });
  }

  let ordered: string[]; // membership ids
  if (group.orderMethod === "LOTTERY") {
    ordered = lotteryOrder(group.memberships.map((m) => m.id));
  } else if (group.orderMethod === "ORGANIZER") {
    const ids = new Set(group.memberships.map((m) => m.id));
    if (!organizerOrder || organizerOrder.length !== ids.size || !organizerOrder.every((id) => ids.has(id)))
      throw new HttpError(400, "order_must_include_every_member_once");
    ordered = organizerOrder;
  } else {
    const existing = await db.pendingAction.findFirst({ where: { groupId, type: "APPROVE_ORDER", status: "PENDING" } });
    if (existing) return { proposed: true };
    const proposal = await proposeTurnOrder(
      group.memberships.map((m) => ({
        membershipId: m.id,
        name: m.user.name,
        riskScore: risks.get(m.id)!.score,
        history: risks.get(m.id)!.history,
      })),
      group.memberships.find((m) => m.userId === group.organizerId)?.user.locale ?? "es"
    );
    await db.pendingAction.create({
      data: {
        groupId,
        type: "APPROVE_ORDER",
        payload: { order: proposal.order, reasons: proposal.reasons },
        summary: proposal.summary,
        createdBy: "ai",
        expiresAt: new Date(Date.now() + group.approvalTimeoutHours * 3600_000),
      },
    });
    await db.group.update({ where: { id: groupId }, data: { status: "ORDERING" } });
    await postToGroupChat(groupId, `🤖 ${proposal.summary}`);
    return { proposed: true };
  }

  await applyOrder(groupId, ordered);
  return { proposed: false };
}

/** Persist turn numbers and the retention % for each member. */
export async function applyOrder(groupId: string, orderedMembershipIds: string[]) {
  const group = await db.group.findUniqueOrThrow({ where: { id: groupId }, include: { memberships: true } });
  const n = orderedMembershipIds.length;
  await db.$transaction(
    orderedMembershipIds.map((id, i) => {
      const m = group.memberships.find((x) => x.id === id)!;
      const turn = i + 1;
      const base = baseRetentionPct(turn, n, group.maxRetentionPct);
      return db.membership.update({
        where: { id },
        data: { turn, retentionPct: adjustedRetentionPct(base, m.riskScore, group.maxRetentionPct, turn === n) },
      });
    })
  );
  await db.group.update({ where: { id: groupId }, data: { status: "ORDERING" } });
}

/** Create every round and every contribution up front, then open round 1. */
export async function startGroup(user: User, groupId: string) {
  const group = await db.group.findUnique({ where: { id: groupId }, include: { memberships: true } });
  if (!group) throw new HttpError(404, "not_found");
  if (group.organizerId !== user.id) throw new HttpError(403, "organizer_only");
  if (group.status !== "ORDERING" || group.memberships.some((m) => m.turn == null))
    throw new HttpError(409, "set_order_first");

  const start = new Date();
  const members = [...group.memberships].sort((a, b) => a.turn! - b.turn!);
  await db.$transaction(async (tx) => {
    for (let i = 0; i < members.length; i++) {
      await tx.round.create({
        data: {
          groupId,
          number: i + 1,
          recipientId: members[i].id,
          status: i === 0 ? "COLLECTING" : "UPCOMING",
          dueAt: roundDueDate(start, group.frequency, i, group.demoMode ? { minutes: group.demoRoundMinutes } : undefined),
          contributions: {
            create: members.map((m) => ({ membershipId: m.id, amountCents: group.contributionCents })),
          },
        },
      });
    }
    await tx.group.update({ where: { id: groupId }, data: { status: "ACTIVE", startsAt: start } });
  });
  for (const m of members) {
    await notify(m.userId, groupId, "action", "¡Empezó el pasanaku!", `${group.name}: tu turno es el #${m.turn}.`);
  }
}

/** Everything the app needs to render a group screen. */
export async function groupDetail(user: User, groupId: string) {
  const group = await db.group.findUnique({
    where: { id: groupId },
    include: {
      memberships: { include: { user: { select: { id: true, name: true } } }, orderBy: { turn: "asc" } },
      rounds: {
        orderBy: { number: "asc" },
        include: { contributions: true, recipient: { include: { user: { select: { name: true } } } } },
      },
      actions: { where: { status: "PENDING" }, orderBy: { createdAt: "desc" } },
    },
  });
  if (!group) throw new HttpError(404, "not_found");
  const me = group.memberships.find((m) => m.userId === user.id);
  if (!me) throw new HttpError(403, "not_a_member");
  return {
    ...group,
    myMembershipId: me.id,
    isOrganizer: group.organizerId === user.id,
    potCents: group.contributionCents * group.memberships.length,
  };
}

export async function myGroups(user: User) {
  return db.group.findMany({
    where: { memberships: { some: { userId: user.id } } },
    include: { _count: { select: { memberships: true } } },
    orderBy: { createdAt: "desc" },
  });
}
