import { test } from "node:test";
import assert from "node:assert/strict";
import { buildGuarantee, type GuaranteeContribution, type GuaranteePayout } from "./guarantee";

const d = (s: string) => new Date(`2026-01-${s}T10:00:00Z`);
const rounds = [
  { number: 1, recipientId: "ana", status: "PAID_OUT", retainedCents: 2500, retainedAt: d("05") },
  { number: 2, recipientId: "beto", status: "PAID_OUT", retainedCents: 1000, retainedAt: d("12") },
  { number: 3, recipientId: "cris", status: "UPCOMING", retainedCents: 0, retainedAt: null },
];
const c = (o: Partial<GuaranteeContribution> & { id: string; membershipId: string }): GuaranteeContribution => ({
  round: 1, dueAt: d("05"), status: "PAID", amountCents: 1000, lateFeeCents: 0, recoveredCents: 0, paidAt: d("04"), ...o,
});
const contributions = [
  c({ id: "c1", membershipId: "beto", round: 2, status: "COVERED", lateFeeCents: 50, paidAt: d("14") }),
  c({ id: "c2", membershipId: "cris", round: 1, status: "DEFAULTED", recoveredCents: 400 }),
  c({ id: "c3", membershipId: "ana", round: 2, status: "PAID" }),
];
const payouts: GuaranteePayout[] = [
  { id: "p1", membershipId: "ana", kind: "RETENTION_RELEASE", status: "SUCCEEDED", amountCents: 2500, createdAt: d("20"), retried: false, round: null },
  { id: "p2", membershipId: "ana", kind: "POT", status: "SUCCEEDED", amountCents: 7500, createdAt: d("05"), retried: false, round: 1 },
  { id: "p3", membershipId: "cris", kind: "COMPENSATION", status: "SUCCEEDED", amountCents: 300, createdAt: d("21"), retried: false, round: 2 },
];
const refunds = [{ id: "f1", membershipId: "beto", round: 2, amountCents: 1000, status: "COMPLETED" as const, createdAt: d("22") }];
const input = { rounds, contributions, payouts, refunds };

test("the organizer sees every member's guarantee story, in order", () => {
  const items = buildGuarantee({ membershipId: "org", isOrganizer: true }, input);
  assert.deepEqual(items.map((i) => `${i.membershipId}:${i.kind}`), ["ana:HELD", "cris:RECOVERED", "beto:HELD", "beto:USED", "ana:RETURNED", "beto:REFUND"]);
  assert.equal(items.length, 6);
  const times = items.map((i) => i.at);
  assert.deepEqual(times, [...times].sort());
});

test("a held guarantee is a period that ends when it is returned, and stays open until then", () => {
  const items = buildGuarantee({ membershipId: "org", isOrganizer: true }, input);
  const ana = items.find((i) => i.kind === "HELD" && i.membershipId === "ana")!;
  assert.equal(ana.until, d("20").toISOString());
  assert.equal(ana.status, "DONE");
  const beto = items.find((i) => i.kind === "HELD" && i.membershipId === "beto")!;
  assert.equal(beto.until, null);
  assert.equal(beto.status, "IN_PROGRESS");
});

test("a member sees only their own guarantee, never anyone else's", () => {
  const items = buildGuarantee({ membershipId: "beto", isOrganizer: false }, input);
  assert.ok(items.length > 0);
  assert.ok(items.every((i) => i.membershipId === "beto" && i.mine));
  assert.deepEqual(items.map((i) => i.kind).sort(), ["HELD", "REFUND", "USED"]);
  // someone who has nothing of their own sees nothing, not even a hint of the others
  assert.deepEqual(buildGuarantee({ membershipId: "dani", isOrganizer: false }, input), []);
});

test("covering a contribution counts the late fee too; closing an unpaid one counts what was recovered", () => {
  const items = buildGuarantee({ membershipId: "org", isOrganizer: true }, input);
  assert.equal(items.find((i) => i.kind === "USED")!.amountCents, 1050);
  assert.equal(items.find((i) => i.kind === "RECOVERED")!.amountCents, 400);
});

test("a compensation is not part of the guarantee, and a retried payout counts once", () => {
  const items = buildGuarantee({ membershipId: "org", isOrganizer: true }, {
    ...input,
    payouts: [...payouts, { id: "p4", membershipId: "ana", kind: "RETENTION_RELEASE", status: "FAILED", amountCents: 2500, createdAt: d("19"), retried: true, round: null }],
  });
  assert.ok(!items.some((i) => i.id === "p_p3"));
  assert.equal(items.filter((i) => i.kind === "RETURNED").length, 1);
  assert.equal(items.find((i) => i.kind === "HELD" && i.membershipId === "ana")!.until, d("20").toISOString());
});

test("a failed return shows as failed, a pending one as in progress; rounds with nothing held are skipped", () => {
  const items = buildGuarantee({ membershipId: "ana", isOrganizer: false }, {
    ...input,
    payouts: [{ id: "p9", membershipId: "ana", kind: "RETENTION_RELEASE", status: "UNKNOWN", amountCents: 2500, createdAt: d("20"), retried: false, round: null }],
  });
  assert.equal(items.find((i) => i.kind === "RETURNED")!.status, "IN_PROGRESS");
  assert.ok(!items.some((i) => i.round === 3));
});
