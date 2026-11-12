import { ApiError } from "./api";
import type { Key } from "./i18n";

/** Server error codes in plain words. A code without a text here gets the generic message, never the raw code. */
const KNOWN: Record<string, Key> = {
  invite_not_found: "err_invite_not_found",
  group_full: "err_group_full",
  already_member: "err_already_member",
  request_already_pending: "err_request_already_pending",
  invalid_input: "err_invalid_input",
  need_at_least_2_members: "err_need_at_least_2_members",
  set_order_first: "err_set_order_first",
  already_started: "err_already_started",
  group_already_started: "err_group_already_started",
  already_cancelled: "err_already_cancelled",
  not_failed: "err_not_failed",
  paypal_error: "err_paypal_error",
  organizer_only: "err_organizer_only",
  platform_balance_low: "err_platform_balance_low",
  no_saved_method: "err_no_saved_method",
  not_a_member: "err_not_a_member",
  not_found: "err_not_found",
  already_reminded: "err_already_reminded",
  invoice_failed: "err_invoice_failed",
  invoice_already_sent: "err_invoice_already_sent",
  already_settled: "err_already_settled",
};

/** What to tell the person when a request fails: the reason if we know it, a connection hint if the server never answered. */
export function errorText(e: unknown, t: (k: Key) => string): string {
  if (!(e instanceof ApiError)) return t("serverDown");
  return t(KNOWN[e.code] ?? "errGeneric");
}
