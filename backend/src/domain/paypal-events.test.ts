import { test } from "node:test";
import assert from "node:assert/strict";
import { captureIdOfRefund, payoutOutcome } from "./paypal-events";

test("payout events: only real failures allow sending the money again", () => {
  assert.equal(payoutOutcome("PAYMENT.PAYOUTS-ITEM.SUCCEEDED"), "SUCCEEDED");
  for (const s of ["FAILED", "DENIED", "BLOCKED", "CANCELED", "RETURNED", "REFUNDED"]) assert.equal(payoutOutcome(`PAYMENT.PAYOUTS-ITEM.${s}`), "FAILED", s);
});

test("an unclaimed or held payout is NOT a failure (re-sending could pay twice)", () => {
  assert.equal(payoutOutcome("PAYMENT.PAYOUTS-ITEM.UNCLAIMED"), "WAITING");
  assert.equal(payoutOutcome("PAYMENT.PAYOUTS-ITEM.HELD"), "WAITING");
});

test("other events are not payout outcomes", () => {
  for (const e of ["PAYMENT.CAPTURE.COMPLETED", "PAYMENT.PAYOUTSBATCH.SUCCESS", "PAYMENT.PAYOUTS-ITEM.SOMETHING", "", "payment.payouts-item.failed"]) assert.equal(payoutOutcome(e), null, e);
});

test("the capture of a refund comes from its 'up' link", () => {
  const resource = {
    id: "REFUND1",
    links: [
      { rel: "self", href: "https://api.paypal.com/v2/payments/refunds/REFUND1" },
      { rel: "up", href: "https://api.paypal.com/v2/payments/captures/8AB12345CD678901E" },
    ],
  };
  assert.equal(captureIdOfRefund(resource), "8AB12345CD678901E");
  assert.equal(captureIdOfRefund({ id: "R", links: [{ rel: "up", href: "http://localhost/v2/payments/captures/SIM-CAPTURE-AB0001?x=1" }] }), "SIM-CAPTURE-AB0001");
  assert.equal(captureIdOfRefund({ id: "R", capture_id: "CAP9" }), "CAP9");
  assert.equal(captureIdOfRefund({ id: "R", links: [{ rel: "up" }] }), null);
  assert.equal(captureIdOfRefund(undefined), null);
});
