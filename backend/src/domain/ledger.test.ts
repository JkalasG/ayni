import { test } from "node:test";
import assert from "node:assert/strict";
import { buildLedger, type LedgerContribution, type LedgerPayout } from "./ledger";

const at = (d: number) => new Date(Date.UTC(2026, 10, d));

const contribution = (o: Partial<LedgerContribution> & { id: string; membershipId: string }): LedgerContribution => ({
  memberName: o.membershipId,
  round: 1,
  dueAt: at(5),
  status: "PAID",
  amountCents: 2000,
  lateFeeCents: 0,
  recoveredCents: 0,
  paidAt: at(4),
  paypalCaptureId: `CAP-${o.id}`,
  paypalFeeCents: 108,
  ...o,
});
const payout = (o: Partial<LedgerPayout> & { id: string; membershipId: string }): LedgerPayout => ({
  memberName: o.membershipId,
  round: 1,
  kind: "POT",
  status: "SUCCEEDED",
  amountCents: 6000,
  createdAt: at(6),
  paypalBatchId: `BATCH-${o.id}`,
  retried: false,
  ...o,
});

const contributions = [
  contribution({ id: "a", membershipId: "ana" }),
  contribution({ id: "b", membershipId: "beto", lateFeeCents: 100 }), // paid late
  contribution({ id: "c", membershipId: "carla", status: "COVERED", lateFeeCents: 100, paypalCaptureId: null, paypalFeeCents: null }),
  contribution({ id: "d", membershipId: "dani", status: "DEFAULTED", paidAt: null, paypalCaptureId: null, paypalFeeCents: null }),
  contribution({ id: "e", membershipId: "ana", round: 2, status: "PENDING", paidAt: null, paypalCaptureId: null, paypalFeeCents: null }),
];
const payouts = [
  payout({ id: "pot", membershipId: "ana" }),
  payout({ id: "ret", membershipId: "ana", kind: "RETENTION_RELEASE", amountCents: 500, round: null }),
  payout({ id: "comp", membershipId: "ana", kind: "COMPENSATION", amountCents: 2000 }),
];

const byId = (entries: { id: string }[], id: string) => entries.find((e) => e.id === id);

test("the organizer sees every movement with its details", () => {
  const { entries, totals } = buildLedger({ membershipId: "ana", isOrganizer: true }, contributions, payouts);
  assert.equal(entries.length, 7); // 4 settled contributions + 3 payouts; the pending one is not history yet
  assert.equal(byId(entries, "c_b")!.amountCents, 2100);
  assert.equal(byId(entries, "c_b")!.lateFeeCents, 100);
  assert.equal(byId(entries, "c_c")!.type, "GUARANTEE_COVER");
  assert.equal(byId(entries, "c_c")!.direction, "none");
  assert.equal(byId(entries, "c_d")!.type, "UNPAID");
  // Only money that PayPal actually charged counts as "in": Ana 20.00 + Beto 21.00.
  assert.equal(totals.inCents, 4100);
  assert.equal(totals.outCents, 8500);
  assert.equal(totals.feesCents, 216);
});

test("another member only sees paid contributions and the pot", () => {
  const { entries, totals } = buildLedger({ membershipId: "beto", isOrganizer: false }, contributions, payouts);
  // Carla's guarantee use looks like a normal payment; Dani's unpaid one, the refund and the compensation are hidden.
  assert.deepEqual(entries.map((e) => e.id).sort(), ["c_a", "c_b", "c_c", "p_pot"]);
  const carla = byId(entries, "c_c")!;
  assert.equal(carla.type, "CONTRIBUTION");
  assert.equal(carla.amountCents, 2000);
  assert.equal(carla.lateFeeCents, 0);
  // No PayPal reference or fee for other people's rows: a missing reference would reveal who was covered.
  for (const id of ["c_a", "c_c", "p_pot"]) {
    assert.equal(byId(entries, id)!.ref, null);
    assert.equal(byId(entries, id)!.feeCents, null);
  }
  // Their own row keeps everything.
  const own = byId(entries, "c_b")!;
  assert.equal(own.mine, true);
  assert.equal(own.amountCents, 2100);
  assert.equal(own.ref, "CAP-b");
  assert.equal(own.feeCents, 108);
  assert.equal(totals.feesCents, 108);
});

test("a member sees their own guarantee use, unpaid contribution and refunds", () => {
  const carla = buildLedger({ membershipId: "carla", isOrganizer: false }, contributions, payouts).entries;
  assert.equal(byId(carla, "c_c")!.type, "GUARANTEE_COVER");
  const dani = buildLedger({ membershipId: "dani", isOrganizer: false }, contributions, payouts).entries;
  assert.equal(byId(dani, "c_d")!.type, "UNPAID");
  const ana = buildLedger({ membershipId: "ana", isOrganizer: false }, contributions, payouts).entries;
  assert.ok(byId(ana, "p_ret") && byId(ana, "p_comp"));
  assert.equal(byId(ana, "c_d"), undefined);
});

test("failed and retried payouts never count as money sent", () => {
  const { entries, totals } = buildLedger({ membershipId: "ana", isOrganizer: true }, [], [
    payout({ id: "old", membershipId: "ana", status: "FAILED", retried: true }),
    payout({ id: "new", membershipId: "ana", status: "SENT" }),
    payout({ id: "bad", membershipId: "beto", status: "FAILED", amountCents: 700 }),
    payout({ id: "lost", membershipId: "beto", status: "UNKNOWN", amountCents: 300 }),
  ]);
  assert.deepEqual(entries.map((e) => e.id).sort(), ["p_bad", "p_lost", "p_new"]);
  assert.equal(byId(entries, "p_bad")!.status, "FAILED");
  assert.equal(byId(entries, "p_lost")!.status, "IN_PROGRESS");
  assert.equal(totals.outCents, 6300);
  assert.equal(totals.feesCents, null);
});

test("deposits and refunds are personal, and a reopened contribution's refund is not counted twice", () => {
  const extra = {
    deposits: [{ membershipId: "ana", memberName: "ana", amountCents: 3000, at: at(1), paypalCaptureId: "CAP-DEP" }],
    refunds: [
      { id: "r1", membershipId: "ana", memberName: "ana", round: null, amountCents: 3000, status: "COMPLETED" as const, createdAt: at(2), paypalRefundId: "REF-1", reopened: false },
      { id: "r2", membershipId: "beto", memberName: "beto", round: 1, amountCents: 2000, status: "COMPLETED" as const, createdAt: at(3), paypalRefundId: "REF-2", reopened: true },
      { id: "r3", membershipId: "beto", memberName: "beto", round: 1, amountCents: 500, status: "FAILED" as const, createdAt: at(3), paypalRefundId: null, reopened: false },
    ],
  };
  const organizer = buildLedger({ membershipId: "rosa", isOrganizer: true }, [], [], extra);
  assert.deepEqual(organizer.entries.map((e) => e.id).sort(), ["d_ana", "r_r1", "r_r2", "r_r3"]);
  assert.equal(organizer.totals.inCents, 3000);
  assert.equal(organizer.totals.outCents, 3000, "only the refund whose charge is still in the ledger; failed ones never");
  assert.equal(byId(organizer.entries, "r_r2")!.direction, "none");
  const ana = buildLedger({ membershipId: "ana", isOrganizer: false }, [], [], extra);
  assert.deepEqual(ana.entries.map((e) => e.id).sort(), ["d_ana", "r_r1"]);
  const carla = buildLedger({ membershipId: "carla", isOrganizer: false }, [], [], extra);
  assert.equal(carla.entries.length, 0);
});

test("newest first", () => {
  const { entries } = buildLedger({ membershipId: null, isOrganizer: true }, contributions, payouts);
  const times = entries.map((e) => e.at);
  assert.deepEqual(times, [...times].sort().reverse());
});
