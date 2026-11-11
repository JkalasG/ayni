/**
 * Payment history ("libro de pagos"). Pure: rows in, entries out, so the privacy
 * rules are easy to test.
 *
 * Privacy, same as the rest of Ayni: other members only see that a contribution
 * was paid. Late fees, guarantee use, unpaid contributions, compensations,
 * guarantee refunds, PayPal fees and PayPal references of someone else are for
 * that person and the organizer only.
 */

export type LedgerViewer = { membershipId: string | null; isOrganizer: boolean };

export type LedgerContribution = {
  id: string;
  membershipId: string;
  memberName: string;
  round: number;
  dueAt: Date;
  status: "PENDING" | "PAID" | "COVERED" | "DEFAULTED";
  amountCents: number;
  lateFeeCents: number;
  recoveredCents: number;
  paidAt: Date | null;
  paypalCaptureId: string | null;
  paypalFeeCents: number | null;
};

export type LedgerPayout = {
  id: string;
  membershipId: string;
  memberName: string;
  round: number | null;
  kind: "POT" | "RETENTION_RELEASE" | "COMPENSATION";
  status: "PENDING" | "SENT" | "SUCCEEDED" | "FAILED" | "UNKNOWN";
  amountCents: number;
  createdAt: Date;
  paypalBatchId: string | null;
  /** FAILED payout that was sent again as a new record: the new one is the one that counts. */
  retried: boolean;
};

export type LedgerEntryType =
  | "CONTRIBUTION" // paid with PayPal
  | "GUARANTEE_COVER" // overdue, paid from the member's own guarantee
  | "UNPAID" // closed without payment
  | "POT"
  | "GUARANTEE_RETURN"
  | "COMPENSATION";

export type LedgerEntry = {
  id: string;
  at: string; // ISO date
  type: LedgerEntryType;
  /** in = PayPal charged a member · out = PayPal paid a member · none = no PayPal movement */
  direction: "in" | "out" | "none";
  status: "DONE" | "IN_PROGRESS" | "FAILED";
  amountCents: number;
  lateFeeCents: number;
  /** PayPal's fee, when PayPal reported it and the viewer may see it. */
  feeCents: number | null;
  membershipId: string;
  memberName: string;
  round: number | null;
  /** PayPal capture id or payout batch id. */
  ref: string | null;
  mine: boolean;
};

export type LedgerTotals = {
  /** Charged to members through PayPal. */
  inCents: number;
  /** Paid to members through PayPal (failed payouts excluded). */
  outCents: number;
  /** PayPal fees on what the viewer can see. Null when PayPal reported none. */
  feesCents: number | null;
};

export function buildLedger(
  viewer: LedgerViewer,
  contributions: LedgerContribution[],
  payouts: LedgerPayout[]
): { entries: LedgerEntry[]; totals: LedgerTotals } {
  const full = (membershipId: string) => viewer.isOrganizer || membershipId === viewer.membershipId;
  const entries: LedgerEntry[] = [];

  for (const c of contributions) {
    if (c.status === "PENDING") continue;
    const detailed = full(c.membershipId);
    const base = {
      id: `c_${c.id}`,
      membershipId: c.membershipId,
      memberName: c.memberName,
      round: c.round,
      mine: c.membershipId === viewer.membershipId,
    };
    if (c.status === "DEFAULTED") {
      // Others just see the round move on.
      if (!detailed) continue;
      entries.push({
        ...base,
        at: c.dueAt.toISOString(),
        type: "UNPAID",
        direction: "none",
        status: "FAILED",
        amountCents: c.amountCents,
        lateFeeCents: 0,
        feeCents: null,
        ref: null,
      });
      continue;
    }
    const covered = c.status === "COVERED";
    entries.push({
      ...base,
      at: (c.paidAt ?? c.dueAt).toISOString(),
      // To everyone else a covered contribution looks like any paid one.
      type: covered && detailed ? "GUARANTEE_COVER" : "CONTRIBUTION",
      direction: covered && detailed ? "none" : "in",
      status: "DONE",
      amountCents: detailed ? c.amountCents + c.lateFeeCents : c.amountCents,
      lateFeeCents: detailed ? c.lateFeeCents : 0,
      feeCents: detailed && !covered ? c.paypalFeeCents : null,
      // A missing reference would give away that the guarantee paid: references stay private.
      ref: detailed && !covered ? c.paypalCaptureId : null,
    });
  }

  for (const p of payouts) {
    if (p.retried) continue;
    // The pot is announced to the whole group; guarantees and compensations are personal.
    if (p.kind !== "POT" && !full(p.membershipId)) continue;
    entries.push({
      id: `p_${p.id}`,
      at: p.createdAt.toISOString(),
      type: p.kind === "POT" ? "POT" : p.kind === "RETENTION_RELEASE" ? "GUARANTEE_RETURN" : "COMPENSATION",
      direction: "out",
      status: p.status === "FAILED" ? "FAILED" : p.status === "SENT" || p.status === "SUCCEEDED" ? "DONE" : "IN_PROGRESS",
      amountCents: p.amountCents,
      lateFeeCents: 0,
      feeCents: null,
      membershipId: p.membershipId,
      memberName: p.memberName,
      round: p.round,
      ref: full(p.membershipId) ? p.paypalBatchId : null,
      mine: p.membershipId === viewer.membershipId,
    });
  }

  entries.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : a.id < b.id ? 1 : -1));

  const fees = entries.filter((e) => e.feeCents != null);
  return {
    entries,
    totals: {
      inCents: sum(entries.filter((e) => e.direction === "in").map((e) => e.amountCents)),
      outCents: sum(entries.filter((e) => e.direction === "out" && e.status !== "FAILED").map((e) => e.amountCents)),
      feesCents: fees.length ? sum(fees.map((e) => e.feeCents!)) : null,
    },
  };
}

const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);
