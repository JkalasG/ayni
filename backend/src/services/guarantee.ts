/**
 * Guarantee timeline of a group, read from our own records. Read-only: nothing here moves money.
 * Who sees what is decided in domain/guarantee.ts.
 */
import { db } from "../db";
import type { User } from "@prisma/client";
import { buildGuarantee } from "../domain/guarantee";
import { HttpError } from "./errors";

export async function groupGuarantee(user: User, groupId: string) {
  const group = await db.group.findUnique({
    where: { id: groupId },
    include: { memberships: { include: { user: { select: { name: true } } }, orderBy: { turn: "asc" } } },
  });
  if (!group) throw new HttpError(404, "not_found");
  const me = group.memberships.find((m) => m.userId === user.id);
  if (!me) throw new HttpError(403, "not_a_member");
  const isOrganizer = group.organizerId === user.id;

  const [rounds, contributions, payouts, refunds] = await Promise.all([
    db.round.findMany({ where: { groupId }, orderBy: { number: "asc" } }),
    db.contribution.findMany({ where: { round: { groupId }, status: { in: ["COVERED", "DEFAULTED"] } }, include: { round: { select: { number: true, dueAt: true } } } }),
    db.payout.findMany({ where: { membership: { groupId }, kind: "RETENTION_RELEASE" }, include: { round: { select: { number: true } } } }),
    db.refund.findMany({ where: { groupId } }),
  ]);
  const refundContributions = await db.contribution.findMany({
    where: { id: { in: refunds.map((r) => r.contributionId).filter((x): x is string => !!x) } },
    select: { id: true, round: { select: { number: true } } },
  });

  const items = buildGuarantee(
    { membershipId: me.id, isOrganizer },
    {
      rounds: rounds.map((r) => ({ number: r.number, recipientId: r.recipientId, status: r.status, retainedCents: r.retainedCents, retainedAt: r.retainedAt })),
      contributions: contributions.map((c) => ({ id: c.id, membershipId: c.membershipId, round: c.round.number, dueAt: c.round.dueAt, status: c.status, amountCents: c.amountCents, lateFeeCents: c.lateFeeCents, recoveredCents: c.recoveredCents, paidAt: c.paidAt })),
      payouts: payouts.map((p) => ({ id: p.id, membershipId: p.membershipId, kind: p.kind, status: p.status, amountCents: p.amountCents, createdAt: p.createdAt, retried: p.retriedById != null, round: p.round?.number ?? null })),
      refunds: refunds.map((r) => ({ id: r.id, membershipId: r.membershipId, round: refundContributions.find((c) => c.id === r.contributionId)?.round.number ?? null, amountCents: r.amountCents, status: r.status, createdAt: r.createdAt })),
    }
  );
  // Only the members whose story this person may see.
  const visible = group.memberships.filter((m) => isOrganizer || m.id === me.id);
  return {
    // The span of the whole pasanaku, so the timeline shows the guarantee in the context of the rounds.
    group: { id: group.id, name: group.name, startsAt: group.startsAt, endsAt: rounds.length ? rounds[rounds.length - 1].dueAt : null, status: group.status },
    isOrganizer,
    myMembershipId: me.id,
    members: visible.map((m) => ({ id: m.id, name: m.user.name, turn: m.turn, heldCents: m.retentionHeldCents })),
    items,
    now: new Date().toISOString(),
  };
}
