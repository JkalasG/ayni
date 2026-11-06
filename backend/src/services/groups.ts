/**
 * Group lifecycle: create -> join (code, or request for open groups) -> set turn order -> start.
 */
import { config } from "../config";
import { db } from "../db";
import { Prisma, type AdmissionMode, type Frequency, type OrderMethod, type User } from "@prisma/client";
import {
  adjustedRetentionPct,
  baseRetentionPct,
  generateInviteCode,
  lotteryOrder,
  newcomerRetentionPct,
  placeNewcomers,
  roundDueDate,
  type TrustProfile,
} from "../domain/rules";
import { proposeTurnOrder } from "../ai/agent";
import { postToGroupChat, notify } from "./notify";
import { trustProfile } from "./trust";
import { logAi } from "./ailog";
import { HttpError } from "./errors";
import { windows } from "./windows";

export { HttpError };

export type AdmissionSettings = {
  isOpen: boolean;
  description?: string | null;
  admissionMode: AdmissionMode;
  minCompleted: number;
  minOnTimePct: number;
  maxLate: number | null;
  acceptNewcomers: boolean;
  requireDeposit: boolean;
};

export async function createGroup(
  user: User,
  input: {
    name: string;
    country?: string;
    contributionCents: number;
    frequency: Frequency;
    orderMethod: OrderMethod;
    maxMembers: number;
    lateFeePct: number;
    maxRetentionPct: number;
    demoMode: boolean;
    demoRoundMinutes?: number;
  } & Partial<AdmissionSettings>
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

/** Publish as an open pasanaku (or close it again) and set the admission rules. */
export async function updateAdmission(user: User, groupId: string, settings: AdmissionSettings) {
  const group = await db.group.findUnique({ where: { id: groupId } });
  if (!group) throw new HttpError(404, "not_found");
  if (group.organizerId !== user.id) throw new HttpError(403, "organizer_only");
  if (group.status !== "FORMING") throw new HttpError(409, "group_already_started");
  return db.group.update({ where: { id: groupId }, data: settings });
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

/**
 * Decide the turn order. LOTTERY and ORGANIZER apply immediately.
 * AI proposes an order with reasons and waits for the organizer's approval.
 * In every method, newcomers admitted to an open group go to the second half.
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

  // refresh risk scores from each member's history across all their groups
  const profiles = new Map<string, TrustProfile>();
  for (const m of group.memberships) {
    const p = await trustProfile(m.userId);
    profiles.set(m.id, p);
    await db.membership.update({ where: { id: m.id }, data: { riskScore: p.riskScore } });
  }
  const isNewcomer = (membershipId: string) => group.memberships.find((m) => m.id === membershipId)?.isNewcomer ?? false;

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
      groupId,
      group.memberships.map((m) => {
        const p = profiles.get(m.id)!;
        return {
          membershipId: m.id,
          name: m.user.name,
          riskScore: p.riskScore,
          isNewcomer: m.isNewcomer,
          history: { onTime: p.onTime, late: p.late, covered: p.covered, completed: p.completed, abandoned: p.abandoned },
        };
      }),
      group.memberships.find((m) => m.userId === group.organizerId)?.user.locale ?? "es"
    );
    const order = placeNewcomers(proposal.order, isNewcomer);
    await db.pendingAction.create({
      data: {
        groupId,
        type: "APPROVE_ORDER",
        payload: { order, reasons: proposal.reasons },
        summary: proposal.summary,
        createdBy: "ai",
        expiresAt: new Date(Date.now() + windows(group).approval),
      },
    });
    await db.group.update({ where: { id: groupId }, data: { status: "ORDERING" } });
    await postToGroupChat(groupId, `${proposal.summary}`);
    return { proposed: true };
  }

  await applyOrder(groupId, placeNewcomers(ordered, isNewcomer));
  return { proposed: false };
}

/** Persist turn numbers and the retention % for each member (taper + risk + newcomer extra). */
export async function applyOrder(groupId: string, orderedMembershipIds: string[]) {
  const group = await db.group.findUniqueOrThrow({
    where: { id: groupId },
    include: { memberships: { include: { user: { select: { name: true } } } } },
  });
  const n = orderedMembershipIds.length;
  const lines: string[] = [];
  const updates = orderedMembershipIds.map((id, i) => {
    const m = group.memberships.find((x) => x.id === id)!;
    const turn = i + 1;
    const last = turn === n;
    const base = baseRetentionPct(turn, n, group.maxRetentionPct);
    let pct = adjustedRetentionPct(base, m.riskScore, group.maxRetentionPct, last);
    if (m.isNewcomer) pct = newcomerRetentionPct(pct, group.newcomerExtraPct, last);
    lines.push(
      `#${turn} ${m.user.name}: base ${base}% → ${pct}% (riesgo ${m.riskScore}/100${m.isNewcomer ? `, nuevo +${group.newcomerExtraPct}` : ""})`
    );
    return db.membership.update({ where: { id }, data: { turn, retentionPct: pct } });
  });
  await db.$transaction(updates);
  await db.group.update({ where: { id: groupId }, data: { status: "ORDERING" } });
  await logAi({
    groupId,
    kind: "guarantee",
    audience: "organizer", // risk scores are personal
    source: "rules",
    subject: "Garantía escalonada ajustada por riesgo",
    consulted: group.memberships.map((m) => ({ name: m.user.name, riskScore: m.riskScore, newcomer: m.isNewcomer })),
    output: lines.join("\n"),
  });
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
            create: members.map((m) =>
              // The admission deposit (already captured) is their round-1 contribution.
              i === 0 && m.depositCaptureId
                ? { membershipId: m.id, amountCents: group.contributionCents, status: "PAID" as const, paidAt: start, paypalCaptureId: m.depositCaptureId }
                : { membershipId: m.id, amountCents: group.contributionCents }
            ),
          },
        },
      });
    }
    await tx.group.update({ where: { id: groupId }, data: { status: "ACTIVE", startsAt: start } });
  });
  // Cancel requests that were still waiting: the group is closed now.
  const waiting = await db.joinRequest.findMany({ where: { groupId, status: { in: ["AWAITING_DEPOSIT", "PENDING"] } } });
  if (waiting.length) {
    const { rejectRequest } = await import("./admission");
    for (const r of waiting) await rejectRequest(r.id, "full").catch((e) => console.error(e));
  }
  for (const m of members) {
    await notify(m.userId, groupId, "action", "¡Empezó el pasanaku!", `${group.name}: tu turno es el #${m.turn}.`);
  }
}

/** Everything the app needs to render a group screen. */
export async function groupDetail(user: User, groupId: string) {
  const group = await db.group.findUnique({
    where: { id: groupId },
    include: {
      memberships: { include: { user: { select: { id: true, name: true, country: true } } }, orderBy: { turn: "asc" } },
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
  const isOrganizer = group.organizerId === user.id;

  // Join requests waiting for the organizer, with the applicant's trust profile.
  const requestIds = group.actions.filter((a) => a.type === "ADMIT_MEMBER").map((a) => (a.payload as any).requestId as string);
  const requests = isOrganizer && requestIds.length
    ? await db.joinRequest.findMany({ where: { id: { in: requestIds } }, include: { user: { select: { name: true } } } })
    : [];

  const failedPayouts = isOrganizer
    ? await db.payout.findMany({
        where: { membership: { groupId }, status: { in: ["FAILED", "UNKNOWN"] }, retriedById: null },
        include: { membership: { include: { user: { select: { name: true } } } } },
      })
    : [];

  // PayPal money leaving the pot. Compensations name a debt, so only the organizer and the person involved see them.
  const payouts = (
    await db.payout.findMany({
      where: { membership: { groupId } },
      include: { round: { select: { number: true } } },
      orderBy: { createdAt: "desc" },
      take: 40,
    })
  )
    .filter((p) => p.kind !== "COMPENSATION" || isOrganizer || p.membershipId === me.id)
    .map((p) => ({
      id: p.id,
      kind: p.kind,
      status: p.status,
      amountCents: p.amountCents,
      membershipId: p.membershipId,
      round: p.round?.number ?? null,
      paypalBatchId: p.paypalBatchId,
      createdAt: p.createdAt,
    }));

  // Privacy inside the group: others only see paid / pending (dignity).
  const mask = <T extends { membershipId: string; status: string; lateFeeCents: number }>(c: T): T =>
    isOrganizer || c.membershipId === me.id
      ? c
      : { ...c, status: c.status === "COVERED" ? "PAID" : c.status === "DEFAULTED" ? "CLOSED" : c.status, lateFeeCents: 0 };
  const rounds = group.rounds.map((r) => ({ ...r, contributions: r.contributions.map(mask) }));
  const memberships = group.memberships.map((m) =>
    isOrganizer || m.id === me.id ? m : { ...m, retentionHeldCents: 0, riskScore: 0, riskReason: null }
  );

  return {
    ...group,
    rounds,
    memberships,
    // Decisions name people (admissions, unpaid contributions): organizer only.
    actions: isOrganizer ? group.actions : [],
    myMembershipId: me.id,
    isOrganizer,
    payouts,
    paypalMode: config.mode,
    failedPayouts: failedPayouts.map((p) => ({ id: p.id, kind: p.kind, status: p.status, amountCents: p.amountCents, name: p.membership.user.name })),
    potCents: group.contributionCents * group.memberships.length,
    requests: requests.map((r) => ({
      id: r.id,
      name: r.user.name,
      message: r.message,
      profile: r.profile,
      failures: r.failures,
      meetsRules: r.meetsRules,
      aiRecommendation: r.aiRecommendation,
      aiReason: r.aiReason,
      depositCents: r.authorizationId ? r.depositCents : 0,
    })),
  };
}

export async function myGroups(user: User) {
  return db.group.findMany({
    where: { memberships: { some: { userId: user.id } } },
    include: { _count: { select: { memberships: true } } },
    orderBy: { createdAt: "desc" },
  });
}
