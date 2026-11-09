import { Platform } from "react-native";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import { api } from "./api";
import { payInPopup, popupReady } from "./paypal-sdk";

export type PayResult = "paid" | "deposit" | "cancelled" | "error" | "dismissed";

/** Where PayPal should send the member back to (the backend only accepts our own app). */
export function returnUrl(path: string): string {
  return Platform.OS === "web" ? `${window.location.origin}/${path}` : Linking.createURL(path);
}

/**
 * Open a PayPal approval page.
 * Native: in-app browser that returns to the app. Web: full-page redirect back to `redirect`.
 */
export async function openPayPal(approveUrl: string, redirect: string): Promise<PayResult> {
  if (Platform.OS === "web") {
    window.location.href = approveUrl;
    return "dismissed";
  }
  const result = await WebBrowser.openAuthSessionAsync(approveUrl, redirect);
  if (result.type !== "success") return "dismissed";
  const status = Linking.parse(result.url).queryParams?.status;
  return status === "paid" || status === "deposit" || status === "cancelled" ? status : "error";
}

/** Pay one contribution with PayPal Checkout. Web: popup over the app. Native / fallback: approval page. */
export async function payContribution(contributionId: string, groupId: string): Promise<PayResult> {
  if (popupReady()) return payInPopup(contributionId); // nothing awaited before this: the popup needs the click
  const redirect = returnUrl(`groups/${groupId}`);
  const { approveUrl } = await api<{ approveUrl: string }>(`/contributions/${contributionId}/checkout`, {
    body: { redirect },
  });
  return openPayPal(approveUrl, redirect);
}
