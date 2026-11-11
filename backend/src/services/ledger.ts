/**
 * Payment history, read from our own records (contributions and payouts), each
 * with its PayPal reference. Read-only: nothing here moves money.
 */
import { db } from "../db";
import type { User } from "@prisma/client";
import { buildLedger, type LedgerEntry, type LedgerViewer } from "../domain/ledger";
import { HttpError } from "./errors";

async function ledgerRows(groupId: string) {
  const [contributions, payouts, refunds, members, rounds] = await Promise.all([
    db.contribution.findMany({
      where: { round: { groupId }, status: { not: "PENDING" } },
      include: { round: { select: { number: true, dueAt: true } }, membership: { include: { user: { select: { name: true } } } } },
    }),
    db.payout.findMany({
      where: { membership: { groupId } },
      include: { round: { select: { number: true } }, membership: { include: { user: { select: { name: true } } } } },
    }),
    db.refund.findMany({ where: { groupId } }),
    db.membership.findMany({ where: { groupId }, include: { user: { select: { name: true } } } }),
    db.round.count({ where: { groupId } }),
  ]);
  const nameOf = (membershipId: string | null) => members.find((m) => m.id === membershipId)?.user.name ?? "";
  const refundRounds = await db.contribution.findMany({
    where: { id: { in: refunds.map((r) => r.contributionId).filter((x): x is string => !!x) } },
    select: { id: true, round: { select: { number: true } } },
  });
  return {
    extra: {
      // Once the group starts, the deposit is the round-1 contribution and shows up there.
      deposits:
        rounds === 0
          ? members
              .filter((m) => m.depositCaptureId)
              .map((m) => ({ membershipId: m.id, memberName: m.user.name, amountCents: 0, at: m.joinedAt, paypalCaptureId: m.depositCaptureId! }))
          : [],
      refunds: refunds.map((r) => ({
        id: r.id,
        membershipId: r.membershipId,
        memberName: nameOf(r.membershipId),
        round: refundRounds.find((c) => c.id === r.contributionId)?.round.number ?? null,
        amountCents: r.amountCents,
        status: r.status,
        createdAt: r.createdAt,
        paypalRefundId: r.paypalRefundId,
        reopened: r.reopened,
      })),
    },
    contributions: contributions.map((c) => ({
      id: c.id,
      membershipId: c.membershipId,
      memberName: c.membership.user.name,
      round: c.round.number,
      dueAt: c.round.dueAt,
      status: c.status,
      amountCents: c.amountCents,
      lateFeeCents: c.lateFeeCents,
      recoveredCents: c.recoveredCents,
      paidAt: c.paidAt,
      paypalCaptureId: c.paypalCaptureId,
      paypalFeeCents: c.paypalFeeCents,
    })),
    payouts: payouts.map((p) => ({
      id: p.id,
      membershipId: p.membershipId,
      memberName: p.membership.user.name,
      round: p.round?.number ?? null,
      kind: p.kind,
      status: p.status,
      amountCents: p.amountCents,
      createdAt: p.createdAt,
      paypalBatchId: p.paypalBatchId,
      retried: p.retriedById != null,
    })),
  };
}

/** A group's history, as this member is allowed to see it. */
export async function groupLedger(user: User, groupId: string) {
  const group = await db.group.findUnique({ where: { id: groupId }, include: { memberships: true } });
  if (!group) throw new HttpError(404, "not_found");
  const me = group.memberships.find((m) => m.userId === user.id);
  if (!me) throw new HttpError(403, "not_a_member");
  const isOrganizer = group.organizerId === user.id;
  const viewer: LedgerViewer = { membershipId: me.id, isOrganizer };
  const rows = await ledgerRows(groupId);
  for (const d of rows.extra.deposits) d.amountCents = group.contributionCents;
  const ledger = buildLedger(viewer, rows.contributions, rows.payouts, rows.extra);
  return {
    group: { id: group.id, name: group.name, currency: group.currency },
    isOrganizer,
    ...ledger,
    // Guarantee still held: the organizer sees the group's total, a member only their own.
    guaranteeHeldCents: isOrganizer ? group.memberships.reduce((s, m) => s + m.retentionHeldCents, 0) : me.retentionHeldCents,
  };
}

/** Everything this person paid and received, across all their groups. Only their own rows. */
export async function myLedger(user: User) {
  const memberships = await db.membership.findMany({
    where: { userId: user.id },
    include: { group: { select: { id: true, name: true, contributionCents: true } } },
    orderBy: { joinedAt: "desc" },
  });
  const entries: (LedgerEntry & { groupId: string; groupName: string })[] = [];
  for (const m of memberships) {
    const rows = await ledgerRows(m.groupId);
    // Not as organizer: this screen is about the person, not the groups they run.
    for (const d of rows.extra.deposits) d.amountCents = m.group.contributionCents;
    const mine = buildLedger({ membershipId: m.id, isOrganizer: false }, rows.contributions, rows.payouts, rows.extra).entries.filter((e) => e.mine);
    for (const e of mine) entries.push({ ...e, groupId: m.group.id, groupName: m.group.name });
  }
  entries.sort((a, b) => (a.at < b.at ? 1 : -1));
  const of = (d: "in" | "out") => entries.filter((e) => e.direction === d && e.status !== "FAILED").reduce((s, e) => s + e.amountCents, 0);
  return {
    entries: entries.slice(0, 300),
    totals: { paidCents: of("in"), receivedCents: of("out") },
    guaranteeHeldCents: memberships.reduce((s, m) => s + m.retentionHeldCents, 0),
  };
}
