/**
 * Reconciliation: do the charges Ayni has recorded match the charges PayPal reports?
 * Pure, so every kind of mismatch is tested. Scope on purpose: incoming charges (captures).
 *
 *   MISSING_IN_PAYPAL  Ayni says it was charged, PayPal has no such charge
 *   AMOUNT_MISMATCH    both have it, with different amounts
 *   NOT_COMPLETED      PayPal has it, but it did not complete (denied, reversed, pending)
 *   UNKNOWN_CHARGE     PayPal charged something Ayni has no record of (and no refund explains it)
 */
export type OurCharge = { captureId: string; amountCents: number; groupId: string };
export type PayPalCharge = { id: string; amountCents: number; status: string; invoiced: boolean };

export type Issue =
  | { type: "MISSING_IN_PAYPAL"; captureId: string; groupId: string; ours: number }
  | { type: "AMOUNT_MISMATCH"; captureId: string; groupId: string; ours: number; theirs: number }
  | { type: "NOT_COMPLETED"; captureId: string; groupId: string; theirs: number; status: string }
  | { type: "UNKNOWN_CHARGE"; captureId: string; groupId: null; theirs: number };

export type Reconciliation = {
  checked: number;
  matched: number;
  issues: Issue[];
  perGroup: Record<string, { checked: number; matched: number }>;
};

/** PayPal's "S" = success. Anything else (pending, denied, reversed) is not money we can count on. */
const COMPLETED = "S";

export function reconcile(ours: OurCharge[], theirs: PayPalCharge[], knownElsewhere: Set<string> = new Set()): Reconciliation {
  const byId = new Map(theirs.map((t) => [t.id, t]));
  const issues: Issue[] = [];
  const perGroup: Reconciliation["perGroup"] = {};
  let matched = 0;
  const seen = new Set<string>();

  for (const o of ours) {
    if (seen.has(o.captureId)) continue; // the same capture can only be counted once
    seen.add(o.captureId);
    const g = (perGroup[o.groupId] ??= { checked: 0, matched: 0 });
    g.checked++;
    const t = byId.get(o.captureId);
    if (!t) issues.push({ type: "MISSING_IN_PAYPAL", captureId: o.captureId, groupId: o.groupId, ours: o.amountCents });
    else if (t.status !== COMPLETED) issues.push({ type: "NOT_COMPLETED", captureId: o.captureId, groupId: o.groupId, theirs: t.amountCents, status: t.status });
    else if (t.amountCents !== o.amountCents) issues.push({ type: "AMOUNT_MISMATCH", captureId: o.captureId, groupId: o.groupId, ours: o.amountCents, theirs: t.amountCents });
    else {
      matched++;
      g.matched++;
    }
  }

  for (const t of theirs) {
    if (seen.has(t.id) || knownElsewhere.has(t.id)) continue;
    // Paid through a PayPal invoice: Ayni records those by invoice, not by capture.
    if (t.invoiced || t.status !== COMPLETED) continue;
    issues.push({ type: "UNKNOWN_CHARGE", captureId: t.id, groupId: null, theirs: t.amountCents });
  }
  return { checked: seen.size, matched, issues, perGroup };
}
