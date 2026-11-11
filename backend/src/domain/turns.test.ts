import { test } from "node:test";
import assert from "node:assert/strict";
import { pickSwapPartner, swapProblem, type SwapCandidate } from "./turns";

test("only two different members whose rounds have not started can swap", () => {
  assert.equal(swapProblem({ memberId: "a", roundStatus: "UPCOMING" }, { memberId: "b", roundStatus: "UPCOMING" }), null);
  assert.equal(swapProblem({ memberId: "a", roundStatus: "UPCOMING" }, { memberId: "a", roundStatus: "UPCOMING" }), "same_member");
  for (const status of ["COLLECTING", "READY", "PAID_OUT"] as const) {
    assert.equal(swapProblem({ memberId: "a", roundStatus: status }, { memberId: "b", roundStatus: "UPCOMING" }), "round_not_upcoming", status);
    assert.equal(swapProblem({ memberId: "a", roundStatus: "UPCOMING" }, { memberId: "b", roundStatus: status }), "round_not_upcoming", status);
  }
});

const c = (membershipId: string, turn: number, o: Partial<SwapCandidate> = {}): SwapCandidate => ({ membershipId, turn, riskScore: 30, roundStatus: "UPCOMING", lateNow: false, ...o });

test("the late member is swapped with the nearest later turn, so the schedule moves as little as possible", () => {
  assert.equal(pickSwapPartner(2, [c("e", 5), c("c", 3), c("d", 4)])!.membershipId, "c");
});

test("earlier turns, started rounds, late members and risky members are never chosen", () => {
  assert.equal(pickSwapPartner(3, [c("a", 1), c("b", 2)]), null, "only later turns");
  assert.equal(pickSwapPartner(2, [c("x", 3, { roundStatus: "COLLECTING" })]), null);
  assert.equal(pickSwapPartner(2, [c("x", 3, { roundStatus: "PAID_OUT" })]), null);
  assert.equal(pickSwapPartner(2, [c("x", 3, { lateNow: true }), c("y", 4)])!.membershipId, "y", "skips a member who is late too");
  assert.equal(pickSwapPartner(2, [c("x", 3, { riskScore: 71 }), c("y", 4, { riskScore: 70 })])!.membershipId, "y", "skips the risky one, accepts the limit");
});

test("nobody to swap with", () => {
  assert.equal(pickSwapPartner(5, [c("a", 1), c("b", 5)]), null, "the late member already has the last turn");
  assert.equal(pickSwapPartner(1, []), null);
});
