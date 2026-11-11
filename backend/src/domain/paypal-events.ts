/**
 * What a PayPal webhook event means for our records. Pure, so every case is tested.
 */

/**
 * Payouts item events -> what happens to our payout record.
 *  - "SUCCEEDED": the money is in the member's account.
 *  - "FAILED": the money did not reach them, or came back. Safe to send again as a new payout.
 *  - "WAITING": PayPal still holds it for the member (they must claim it, or PayPal is reviewing it).
 *    NOT a failure: sending it again could pay twice if they claim the first one later.
 *  - null: not a payout item event.
 */
export function payoutOutcome(eventType: string): "SUCCEEDED" | "FAILED" | "WAITING" | null {
  const m = /^PAYMENT\.PAYOUTS-ITEM\.([A-Z]+)$/.exec(eventType);
  if (!m) return null;
  switch (m[1]) {
    case "SUCCEEDED":
      return "SUCCEEDED";
    case "FAILED":
    case "DENIED":
    case "BLOCKED":
    case "CANCELED":
    case "RETURNED": // unclaimed for 30 days: PayPal gave it back to us
    case "REFUNDED": // the member sent it back
      return "FAILED";
    case "UNCLAIMED":
    case "HELD":
      return "WAITING";
    default:
      return null;
  }
}

/** The capture a refund / reversal event is about. PayPal puts it in the "up" link of the refund. */
export function captureIdOfRefund(resource: any): string | null {
  const up = (resource?.links ?? []).find((l: any) => l?.rel === "up" && typeof l.href === "string");
  const fromLink = up ? /\/captures\/([^/?#]+)/.exec(up.href)?.[1] : undefined;
  return fromLink ?? resource?.capture_id ?? null;
}
