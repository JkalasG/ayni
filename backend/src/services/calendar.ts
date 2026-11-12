import type { User } from "@prisma/client";
import { db } from "../db";
import { buildPersonalCalendar } from "../domain/personal-calendar";

/** My money calendar across every pasanaku I am in (see domain/personal-calendar.ts). Only my own movements. */
export async function myCalendar(user: User, now = new Date()) {
  const memberships = await db.membership.findMany({
    where: { userId: user.id, group: { status: { not: "CANCELLED" } } },
    include: {
      group: {
        include: {
          _count: { select: { memberships: true } },
          rounds: { orderBy: { number: "asc" } },
        },
      },
      contributions: { include: { round: { select: { number: true } } } },
      payouts: { include: { round: { select: { number: true } } } },
    },
  });
  const groups = memberships.map((m) => ({
    id: m.group.id,
    name: m.group.name,
    status: m.group.status,
    contributionCents: m.group.contributionCents,
    frequency: m.group.frequency,
    members: m.group._count.memberships,
    myTurn: m.turn,
    myRetentionPct: m.retentionPct,
    rounds: m.group.rounds.map((r) => ({ number: r.number, dueAt: r.dueAt, status: r.status, recipientIsMe: r.recipientId === m.id, retainedCents: r.retainedCents })),
    mine: m.contributions.map((c) => ({ roundNumber: c.round.number, status: c.status, amountCents: c.amountCents, lateFeeCents: c.lateFeeCents, paidAt: c.paidAt })),
    payouts: m.payouts.map((p) => ({ roundNumber: p.round?.number ?? null, kind: p.kind, status: p.status, amountCents: p.amountCents, createdAt: p.createdAt })),
  }));
  return {
    now: now.toISOString(),
    // enough for the card of a movement: which pasanaku it is, how big and how far along
    groups: groups.map((g) => ({ id: g.id, name: g.name, status: g.status, frequency: g.frequency, members: g.members, contributionCents: g.contributionCents, rounds: g.rounds.length, paidOutRounds: g.rounds.filter((r) => r.status === "PAID_OUT").length, myTurn: g.myTurn })),

    events: buildPersonalCalendar(groups, now),
  };
}
