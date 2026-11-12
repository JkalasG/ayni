import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPersonalCalendar, type CalGroup } from "./personal-calendar";

const day = (n: number) => new Date(Date.UTC(2026, 10, n, 12));
const now = day(10);

/** 4 members, $20 each, I am turn 2: rounds are due on the 5th, 12th, 19th and 26th. */
function group(over: Partial<CalGroup> = {}): CalGroup {
  return {
    id: "g1",
    name: "Barrio",
    status: "ACTIVE",
    contributionCents: 2000,
    members: 4,
    myTurn: 2,
    myRetentionPct: 25,
    rounds: [
      { number: 1, dueAt: day(5), status: "PAID_OUT", recipientIsMe: false, retainedCents: 0 },
      { number: 2, dueAt: day(12), status: "COLLECTING", recipientIsMe: true, retainedCents: 0 },
      { number: 3, dueAt: day(19), status: "UPCOMING", recipientIsMe: false, retainedCents: 0 },
      { number: 4, dueAt: day(26), status: "UPCOMING", recipientIsMe: false, retainedCents: 0 },
    ],
    mine: [
      { roundNumber: 1, status: "PAID", amountCents: 2000, lateFeeCents: 0, paidAt: day(4) },
      { roundNumber: 2, status: "PENDING", amountCents: 2000, lateFeeCents: 0, paidAt: null },
    ],
    payouts: [],
    ...over,
  };
}

test("a paid contribution counts on the day it was paid, a pending one on its due day", () => {
  const ev = buildPersonalCalendar([group()], now);
  const r1 = ev.find((e) => e.id === "pay:g1:1")!;
  assert.equal(r1.status, "paid");
  assert.equal(r1.at, day(4).toISOString());
  assert.equal(r1.dueAt, null);
  const r2 = ev.find((e) => e.id === "pay:g1:2")!;
  assert.equal(r2.status, "pending");
  assert.equal(r2.at, day(12).toISOString());
});

test("an overdue pending contribution is late, and a late fee is part of what is owed", () => {
  const g = group({ mine: [{ roundNumber: 1, status: "PAID", amountCents: 2000, lateFeeCents: 0, paidAt: day(4) }, { roundNumber: 2, status: "PENDING", amountCents: 2000, lateFeeCents: 100, paidAt: null }] });
  const ev = buildPersonalCalendar([g], day(13));
  const r2 = ev.find((e) => e.id === "pay:g1:2")!;
  assert.equal(r2.status, "late");
  assert.equal(r2.amountCents, 2100);
});

test("rounds not opened yet are estimated contributions", () => {
  const r3 = buildPersonalCalendar([group()], now).find((e) => e.id === "pay:g1:3")!;
  assert.equal(r3.status, "upcoming");
  assert.equal(r3.estimated, true);
  assert.equal(r3.amountCents, 2000);
});

test("the pot I will receive is the whole pot minus the guarantee held, and the guarantee comes back at the end", () => {
  const ev = buildPersonalCalendar([group()], now);
  const r = ev.find((e) => e.kind === "receive")!;
  // pot 80.00, 25% = 20.00 held (my two remaining contributions are 40.00, so the cap does not bite)
  assert.equal(r.amountCents, 6000);
  assert.equal(r.heldCents, 2000);
  assert.equal(r.status, "upcoming");
  const back = ev.find((e) => e.kind === "return")!;
  assert.equal(back.amountCents, 2000);
  assert.equal(back.at, day(26).toISOString());
});

test("a pot that was sent shows what PayPal really sent, on the day it was sent", () => {
  const g = group({
    rounds: group().rounds.map((r) => (r.number === 2 ? { ...r, status: "PAID_OUT" as const, retainedCents: 1500 } : r)),
    payouts: [{ roundNumber: 2, kind: "POT", status: "SUCCEEDED", amountCents: 6500, createdAt: day(9) }],
  });
  const r = buildPersonalCalendar([g], now).find((e) => e.kind === "receive")!;
  assert.equal(r.status, "received");
  assert.equal(r.amountCents, 6500);
  assert.equal(r.estimated, false);
  assert.equal(r.at, day(9).toISOString());
  assert.equal(buildPersonalCalendar([g], now).find((e) => e.kind === "return")!.amountCents, 1500);
});

test("a returned guarantee is not projected again", () => {
  const g = group({ status: "FINISHED", payouts: [{ roundNumber: null, kind: "RETENTION_RELEASE", status: "SUCCEEDED", amountCents: 2000, createdAt: day(27) }] });
  const returns = buildPersonalCalendar([g], now).filter((e) => e.kind === "return");
  assert.equal(returns.length, 1);
  assert.equal(returns[0].status, "received");
});

test("a failed payout is shown as failed, not as money received", () => {
  const g = group({
    rounds: group().rounds.map((r) => (r.number === 2 ? { ...r, status: "PAID_OUT" as const } : r)),
    payouts: [{ roundNumber: 2, kind: "POT", status: "FAILED", amountCents: 6000, createdAt: day(9) }],
  });
  assert.equal(buildPersonalCalendar([g], now).find((e) => e.kind === "receive")!.status, "failed");
});

test("cancelled groups and groups without rounds add nothing; several groups are merged in date order", () => {
  const other = group({ id: "g2", name: "Feria", rounds: group().rounds.map((r) => ({ ...r, dueAt: new Date(r.dueAt.getTime() + 86_400_000) })) });
  assert.deepEqual(buildPersonalCalendar([group({ status: "CANCELLED" }), group({ rounds: [] })], now), []);
  const ev = buildPersonalCalendar([group(), other], now);
  assert.ok(ev.some((e) => e.groupId === "g2"));
  assert.deepEqual(ev.map((e) => e.at), [...ev.map((e) => e.at)].sort());
});
