import { test } from "node:test";
import assert from "node:assert/strict";
import {
  baseRetentionPct,
  adjustedRetentionPct,
  retentionCents,
  lateFeeCents,
  riskScore,
  lotteryOrder,
  reminderStage,
} from "./rules";

test("retention tapers from max to zero", () => {
  assert.equal(baseRetentionPct(1, 5, 25), 25);
  assert.equal(baseRetentionPct(3, 5, 25), 13);
  assert.equal(baseRetentionPct(5, 5, 25), 0);
});

test("AI adjustment is bounded and last turn is always zero", () => {
  assert.equal(adjustedRetentionPct(25, 100, 25, false), 35);
  assert.equal(adjustedRetentionPct(25, 0, 25, false), 15);
  assert.equal(adjustedRetentionPct(25, 100, 25, true), 0);
});

test("retention never exceeds what the person still owes", () => {
  // 5 members, $100 each, pot $500. Turn 4 owes only 1 more contribution ($100).
  assert.equal(retentionCents(50000, 35, 10000, 4, 5), 10000);
  assert.equal(retentionCents(50000, 25, 10000, 1, 5), 12500);
});

test("late fee", () => {
  assert.equal(lateFeeCents(10000, 5), 500);
});

test("risk score moves with history and is clamped", () => {
  assert.equal(riskScore({ onTime: 0, late: 0, covered: 0 }), 50);
  assert.ok(riskScore({ onTime: 5, late: 0, covered: 0 }) < 50);
  assert.equal(riskScore({ onTime: 0, late: 5, covered: 3 }), 95);
});

test("lottery keeps every member exactly once", () => {
  const out = lotteryOrder(["a", "b", "c", "d"]);
  assert.deepEqual([...out].sort(), ["a", "b", "c", "d"]);
});

test("reminder stages escalate", () => {
  const due = new Date("2026-11-10T12:00:00Z");
  const h = 3600_000;
  assert.equal(reminderStage(new Date("2026-11-08T00:00:00Z"), due, 48 * h, 24 * h), "none");
  assert.equal(reminderStage(new Date("2026-11-10T00:00:00Z"), due, 48 * h, 24 * h), "friendly");
  assert.equal(reminderStage(new Date("2026-11-10T13:00:00Z"), due, 48 * h, 24 * h), "due");
  assert.equal(reminderStage(new Date("2026-11-11T13:00:00Z"), due, 48 * h, 24 * h), "firm");
  assert.equal(reminderStage(new Date("2026-11-12T13:00:00Z"), due, 48 * h, 24 * h), "final");
});
