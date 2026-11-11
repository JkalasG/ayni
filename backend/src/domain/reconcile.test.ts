import { test } from "node:test";
import assert from "node:assert/strict";
import { reconcile, type OurCharge, type PayPalCharge } from "./reconcile";

const ours = (captureId: string, amountCents: number, groupId = "g1"): OurCharge => ({ captureId, amountCents, groupId });
const theirs = (id: string, amountCents: number, status = "S", invoiced = false): PayPalCharge => ({ id, amountCents, status, invoiced });

test("everything matches", () => {
  const r = reconcile([ours("A", 2000), ours("B", 2100, "g2")], [theirs("A", 2000), theirs("B", 2100)]);
  assert.equal(r.checked, 2);
  assert.equal(r.matched, 2);
  assert.deepEqual(r.issues, []);
  assert.deepEqual(r.perGroup, { g1: { checked: 1, matched: 1 }, g2: { checked: 1, matched: 1 } });
});

test("a charge Ayni recorded that PayPal does not have", () => {
  const r = reconcile([ours("A", 2000), ours("B", 2000)], [theirs("A", 2000)]);
  assert.equal(r.matched, 1);
  assert.deepEqual(r.issues, [{ type: "MISSING_IN_PAYPAL", captureId: "B", groupId: "g1", ours: 2000 }]);
  assert.deepEqual(r.perGroup.g1, { checked: 2, matched: 1 });
});

test("different amounts, and charges that did not complete", () => {
  const r = reconcile([ours("A", 2000), ours("B", 2000), ours("C", 2000)], [theirs("A", 1900), theirs("B", 2000, "D"), theirs("C", 2000, "P")]);
  assert.equal(r.matched, 0);
  assert.deepEqual(r.issues.map((i) => i.type), ["AMOUNT_MISMATCH", "NOT_COMPLETED", "NOT_COMPLETED"]);
  assert.deepEqual(r.issues[0], { type: "AMOUNT_MISMATCH", captureId: "A", groupId: "g1", ours: 2000, theirs: 1900 });
});

test("a PayPal charge Ayni never recorded is reported, unless a refund or an invoice explains it", () => {
  const all = [theirs("X", 500), theirs("REFUNDED", 2000), theirs("INV", 2000, "S", true), theirs("FAILED", 300, "D")];
  const r = reconcile([], all, new Set(["REFUNDED"]));
  assert.deepEqual(r.issues, [{ type: "UNKNOWN_CHARGE", captureId: "X", groupId: null, theirs: 500 }]);
});

test("the same capture is never counted twice", () => {
  const r = reconcile([ours("A", 2000), ours("A", 2000)], [theirs("A", 2000)]);
  assert.equal(r.checked, 1);
  assert.equal(r.matched, 1);
});

test("nothing to compare", () => {
  assert.deepEqual(reconcile([], []), { checked: 0, matched: 0, issues: [], perGroup: {} });
});
