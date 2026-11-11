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
  buildTrustProfile,
  checkAdmission,
  placeNewcomers,
  newcomerRetentionPct,
  coverageFromGuarantee,
  fillAmounts,
  autoPayStep,
  type TrustProfile,
} from "./rules";

test("amounts in AI text are always put by the code; invented numbers are discarded", () => {
  assert.equal(fillAmounts("Hola Ana, tu aporte de {amount} está pendiente.", { amount: "20.00", fee: null }), "Hola Ana, tu aporte de $20.00 está pendiente.");
  assert.equal(fillAmounts("Son {amount} (incluye {fee} de multa).", { amount: "21.00", fee: "1.00" }), "Son $21.00 (incluye $1.00 de multa).");
  assert.equal(fillAmounts("Tu aporte de $25 está pendiente.", { amount: "20.00", fee: null }), null); // invented number
  assert.equal(fillAmounts("Tu aporte está pendiente.", { amount: "20.00", fee: null }), null); // no amount at all
  assert.equal(fillAmounts("Paga {amount} antes del {date}.", { amount: "20.00", fee: null }), null); // unknown placeholder
  assert.equal(fillAmounts("Son {amount} más {fee}.", { amount: "20.00", fee: null }), null); // fee that doesn't exist
});

const now = new Date("2026-11-10T00:00:00Z");
const day = 86_400_000;

function profile(over: Partial<TrustProfile> = {}): TrustProfile {
  return {
    completed: 2, abandoned: 0, activeGroups: 0, onTime: 10, late: 0, covered: 0, defaulted: 0,
    onTimePct: 100, accountAgeDays: 90, paypalVerified: true, isNewcomer: false, riskScore: 20, streak: 0, ...over,
  };
}

test("trust profile counts completed, abandoned and late events from payment history only", () => {
  const due = new Date(now.getTime() - 10 * day);
  const p = buildTrustProfile({
    accountCreatedAt: new Date(now.getTime() - 40 * day),
    paypalVerified: true,
    now,
    memberships: [
      {
        groupStatus: "FINISHED",
        contributions: [
          { status: "PAID", paidAt: new Date(due.getTime() - day), dueAt: due },
          { status: "PAID", paidAt: new Date(due.getTime() + day), dueAt: due },
          { status: "COVERED", paidAt: due, dueAt: due },
        ],
      },
      { groupStatus: "ACTIVE", contributions: [{ status: "DEFAULTED", paidAt: null, dueAt: due }] },
    ],
  });
  assert.equal(p.completed, 1);
  assert.equal(p.abandoned, 1);
  assert.equal(p.onTime, 1);
  assert.equal(p.late, 2); // paid late + covered
  assert.equal(p.covered, 1);
  assert.equal(p.onTimePct, 25);
  assert.equal(p.accountAgeDays, 40);
  assert.equal(p.isNewcomer, false);
});

test("streak counts on-time payments in a row, from the most recent back", () => {
  const at = (d: number) => new Date(now.getTime() - d * day);
  const onTime = (d: number) => ({ status: "PAID" as const, paidAt: at(d + 1), dueAt: at(d) });
  const p = buildTrustProfile({
    accountCreatedAt: at(200),
    paypalVerified: true,
    now,
    memberships: [
      { groupStatus: "FINISHED", contributions: [onTime(100), { status: "PAID", paidAt: at(80), dueAt: at(90) }, onTime(70)] },
      { groupStatus: "ACTIVE", contributions: [onTime(30), onTime(14), { status: "PENDING", paidAt: null, dueAt: at(-7) }] },
    ],
  });
  // 14, 30 and 70 days ago were on time; 90 days ago was paid late, so the streak stops there
  assert.equal(p.streak, 3);
});

test("a person with no history is a newcomer with a neutral risk", () => {
  const p = buildTrustProfile({ accountCreatedAt: now, paypalVerified: true, now, memberships: [] });
  assert.equal(p.isNewcomer, true);
  assert.equal(p.onTimePct, null);
  assert.equal(p.riskScore, 50);
});

test("admission: meets, borderline and hard failures", () => {
  const rules = { minCompleted: 2, minOnTimePct: 90, maxLate: 1, acceptNewcomers: false };
  assert.deepEqual(checkAdmission(profile(), rules), { meets: true, borderline: false, failures: [] });

  const near = checkAdmission(profile({ onTimePct: 85 }), rules);
  assert.equal(near.meets, false);
  assert.equal(near.borderline, true);

  const far = checkAdmission(profile({ onTimePct: 50 }), rules);
  assert.equal(far.borderline, false);

  const twoMisses = checkAdmission(profile({ completed: 1, late: 2 }), rules);
  assert.equal(twoMisses.borderline, false);

  const abandoned = checkAdmission(profile({ abandoned: 1 }), rules);
  assert.ok(abandoned.failures.includes("has_abandoned"));
  assert.equal(abandoned.borderline, false);
});

test("admission: newcomers skip history rules only when the organizer accepts them", () => {
  const p = profile({ completed: 0, onTime: 0, onTimePct: null, isNewcomer: true, riskScore: 50 });
  assert.equal(checkAdmission(p, { minCompleted: 3, minOnTimePct: 90, maxLate: 0, acceptNewcomers: true }).meets, true);
  assert.deepEqual(checkAdmission(p, { minCompleted: 0, minOnTimePct: 0, maxLate: null, acceptNewcomers: false }).failures, [
    "newcomers_not_accepted",
  ]);
});

test("newcomers are moved to the second half, keeping the rest of the order", () => {
  const isNew = (id: string) => id === "n1" || id === "n2";
  assert.deepEqual(placeNewcomers(["n1", "a", "n2", "b", "c", "d"], isNew), ["a", "b", "c", "n1", "n2", "d"]);
  // not enough experienced members: fill what we can
  assert.deepEqual(placeNewcomers(["n1", "n2", "a", "n3"], (id) => id.startsWith("n")), ["a", "n1", "n2", "n3"]);
  assert.equal(newcomerRetentionPct(20, 10, false), 30);
  assert.equal(newcomerRetentionPct(20, 10, true), 0);
});

test("guarantee covers the contribution first, then as much late fee as it can", () => {
  // Turn 4 of 5 holds exactly one contribution: it must still be coverable.
  assert.deepEqual(coverageFromGuarantee(10000, 10000, 500), { amount: 10000, fee: 0 });
  assert.deepEqual(coverageFromGuarantee(12500, 10000, 500), { amount: 10000, fee: 500 });
  assert.equal(coverageFromGuarantee(9000, 10000, 500), null);
});

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

test("automatic payment: the member is always told before being charged, and never charged late", () => {
  const due = new Date("2026-11-20T12:00:00Z");
  const h = 3600_000;
  const lead = 24 * h;
  const at = (hoursBeforeDue: number) => new Date(due.getTime() - hoursBeforeDue * h);
  assert.equal(autoPayStep(at(30), due, lead, null), "wait"); // too early
  assert.equal(autoPayStep(at(24), due, lead, null), "notify"); // 24 h before: tell them
  assert.equal(autoPayStep(at(20), due, lead, at(24)), "wait"); // told, not yet time
  assert.equal(autoPayStep(at(12), due, lead, at(24)), "charge"); // 12 h before: charge
  assert.equal(autoPayStep(at(1), due, lead, at(24)), "charge");
  // Never without a notice, however close the due date is.
  assert.equal(autoPayStep(at(1), due, lead, null), "notify");
  // Told late (they turned it on at the last minute): wait a quarter of the window before charging.
  assert.equal(autoPayStep(at(10), due, lead, at(11)), "wait");
  assert.equal(autoPayStep(at(5), due, lead, at(11)), "charge");
  // Told so late that the waiting time ends after the due date: it is never charged automatically.
  assert.equal(autoPayStep(at(0.5), due, lead, at(2)), "wait");
  assert.equal(autoPayStep(at(0), due, lead, at(24)), "skip");
  assert.equal(autoPayStep(at(-5), due, lead, at(24)), "skip");
  assert.equal(autoPayStep(at(-5), due, lead, null), "skip");
});
