import { test } from "node:test";
import assert from "node:assert/strict";
import { TOOLS, type Api } from "./tools";

const tool = (name: string) => TOOLS.find((t) => t.name === name)!;

test("every tool is a plain read: it only asks for GET paths the read-only key may use", async () => {
  const { mcpAllowed } = await import("../domain/mcp-access");
  const asked: string[] = [];
  const api: Api = async (path) => {
    asked.push(path);
    return path === "/groups" ? [] : path === "/me/payments" ? { totals: {}, entries: [] } : path.endsWith("/claims") ? { claims: [] } : path.endsWith("/ledger") ? { totals: {}, entries: [] } : path === "/me/profile" ? {} : { rounds: [], memberships: [] };
  };
  for (const t of TOOLS) await t.run(api, Object.fromEntries(Object.keys(t.args).map((k) => [k, "g1"])));
  assert.equal(asked.length, TOOLS.length);
  for (const path of asked) assert.equal(mcpAllowed("GET", path), true, path);
});

test("group ids cannot be used to reach other endpoints", async () => {
  const api: Api = async () => ({});
  for (const bad of ["../me", "a/b", "x?y=1", "", "a".repeat(80), "a b"]) await assert.rejects(tool("group_status").run(api, { group_id: bad }), /invalid_id/, JSON.stringify(bad));
});

test("group_status says what the member owes and who is missing, in money formatted from cents", async () => {
  const api: Api = async () => ({
    name: "Pasanaku", status: "ACTIVE", contributionCents: 2500, potCents: 10000, myMembershipId: "m1", autoPay: true,
    memberships: [{ id: "m1", turn: 2, retentionHeldCents: 500, user: { name: "Ana" } }, { id: "m2", turn: 1, user: { name: "Beto" } }],
    rounds: [{ number: 1, status: "PAID_OUT", contributions: [] }, { number: 2, status: "COLLECTING", dueAt: "2026-12-01", recipient: { user: { name: "Beto" } }, contributions: [{ membershipId: "m1", status: "PENDING", amountCents: 2500, lateFeeCents: 125 }, { membershipId: "m2", status: "PAID", amountCents: 2500, lateFeeCents: 0 }] }],
  });
  const r: any = await tool("group_status").run(api, { group_id: "g1" });
  assert.equal(r.pot, "$100.00");
  assert.equal(r.myContribution.amount, "$26.25");
  assert.equal(r.myContribution.status, "PENDING");
  assert.deepEqual(r.currentRound.pending, ["Ana"]);
  assert.equal(r.currentRound.receives, "Beto");
  assert.equal(r.myGuaranteeHeld, "$5.00");
  assert.equal(r.automaticPayment, true);
});

test("my_payments and group_payments pass through what the API allowed, nothing more", async () => {
  const api: Api = async () => ({
    totals: { paidCents: 5000, receivedCents: 0, inCents: 5000, outCents: 0, feesCents: null }, guaranteeHeldCents: 0,
    entries: [{ at: "2026-11-01", groupName: "P", memberName: "Ana", type: "CONTRIBUTION", round: 1, amountCents: 2500, status: "DONE", ref: "CAP1", mine: true, secretField: "x" }],
  });
  const mine: any = await tool("my_payments").run(api, {});
  assert.equal(mine.paid, "$50.00");
  assert.deepEqual(Object.keys(mine.recent[0]).sort(), ["amount", "at", "circle", "paypalRef", "round", "status", "type"]);
  const grp: any = await tool("group_payments").run(api, { group_id: "g1" });
  assert.equal(grp.paypalFees, null);
  assert.ok(!JSON.stringify(grp).includes("secretField"));
});
