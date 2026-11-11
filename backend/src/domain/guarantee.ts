/**
 * Guarantee timeline: when each member's guarantee was withheld, used, returned or refunded.
 * Pure: rows in, items out, so the privacy rule is easy to test.
 *
 * Privacy: guarantee use, refunds and compensations are personal. The organizer sees every
 * member; a member sees only their own row. Nobody else gets even a hint of someone's guarantee.
 */

export type GuaranteeViewer = { membershipId: string | null; isOrganizer: boolean };

export type GuaranteeRound = { number: number; recipientId: string; status: string; retainedCents: number; retainedAt: Date | null };
export type GuaranteeContribution = {
  id: string;
  membershipId: string;
  round: number;
  dueAt: Date;
  status: "PENDING" | "PAID" | "COVERED" | "DEFAULTED";
  amountCents: number;
  lateFeeCents: number;
  recoveredCents: number;
  paidAt: Date | null;
};
export type GuaranteePayout = { id: string; membershipId: string; kind: "POT" | "RETENTION_RELEASE" | "COMPENSATION"; status: string; amountCents: number; createdAt: Date; retried: boolean; round: number | null };
export type GuaranteeRefund = { id: string; membershipId: string | null; round: number | null; amountCents: number; status: "PENDING" | "COMPLETED" | "FAILED"; createdAt: Date };

export type GuaranteeKind =
  | "HELD" // withheld from the pot when it was their turn; a period that ends when it is returned
  | "USED" // an overdue contribution was paid from it
  | "RECOVERED" // an unpaid contribution closed and what they held went to the pot
  | "RETURNED" // sent back to their PayPal
  | "REFUND"; // PayPal gave a contribution back

export type GuaranteeItem = {
  id: string;
  membershipId: string;
  kind: GuaranteeKind;
  /** ISO date. For HELD this is when it started. */
  at: string;
  /** HELD only: when it was returned or used up. Null = still held. */
  until: string | null;
  amountCents: number;
  status: "DONE" | "IN_PROGRESS" | "FAILED";
  round: number | null;
  mine: boolean;
};

const state = (s: string): GuaranteeItem["status"] => (s === "FAILED" ? "FAILED" : s === "SENT" || s === "SUCCEEDED" || s === "COMPLETED" ? "DONE" : "IN_PROGRESS");

export function buildGuarantee(
  viewer: GuaranteeViewer,
  input: { rounds: GuaranteeRound[]; contributions: GuaranteeContribution[]; payouts: GuaranteePayout[]; refunds: GuaranteeRefund[] }
): GuaranteeItem[] {
  const visible = (membershipId: string) => viewer.isOrganizer || membershipId === viewer.membershipId;
  const items: GuaranteeItem[] = [];
  const mine = (membershipId: string) => membershipId === viewer.membershipId;

  const returns = input.payouts.filter((p) => p.kind === "RETENTION_RELEASE" && !p.retried);

  for (const r of input.rounds) {
    if (r.retainedCents <= 0 || !r.retainedAt || !visible(r.recipientId)) continue;
    // The guarantee is one pool per member: it ends when it is returned to them.
    const back = returns.filter((p) => p.membershipId === r.recipientId && p.createdAt >= r.retainedAt!).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0];
    items.push({
      id: `h_${r.number}`,
      membershipId: r.recipientId,
      kind: "HELD",
      at: r.retainedAt.toISOString(),
      until: back ? back.createdAt.toISOString() : null,
      amountCents: r.retainedCents,
      status: back ? "DONE" : "IN_PROGRESS",
      round: r.number,
      mine: mine(r.recipientId),
    });
  }

  for (const c of input.contributions) {
    if (!visible(c.membershipId)) continue;
    if (c.status === "COVERED") {
      items.push({ id: `u_${c.id}`, membershipId: c.membershipId, kind: "USED", at: (c.paidAt ?? c.dueAt).toISOString(), until: null, amountCents: c.amountCents + c.lateFeeCents, status: "DONE", round: c.round, mine: mine(c.membershipId) });
    } else if (c.status === "DEFAULTED" && c.recoveredCents > 0) {
      items.push({ id: `x_${c.id}`, membershipId: c.membershipId, kind: "RECOVERED", at: c.dueAt.toISOString(), until: null, amountCents: c.recoveredCents, status: "DONE", round: c.round, mine: mine(c.membershipId) });
    }
  }

  for (const p of input.payouts) {
    if (p.retried || !visible(p.membershipId)) continue;
    // A compensation is money received for someone else's unpaid contribution: it is not part of anyone's guarantee.
    if (p.kind === "RETENTION_RELEASE") {
      items.push({ id: `p_${p.id}`, membershipId: p.membershipId, kind: "RETURNED", at: p.createdAt.toISOString(), until: null, amountCents: p.amountCents, status: state(p.status), round: p.round, mine: mine(p.membershipId) });
    }
  }

  for (const f of input.refunds) {
    if (!f.membershipId || !visible(f.membershipId)) continue;
    items.push({ id: `f_${f.id}`, membershipId: f.membershipId, kind: "REFUND", at: f.createdAt.toISOString(), until: null, amountCents: f.amountCents, status: state(f.status), round: f.round, mine: mine(f.membershipId) });
  }

  return items.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : a.id < b.id ? -1 : 1));
}
