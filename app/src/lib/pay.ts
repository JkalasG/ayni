import { Platform } from "react-native";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import { api } from "./api";
import { payInPopup, popupReady } from "./paypal-sdk";
import { runInPopup } from "./popup";

export type PayResult = "paid" | "deposit" | "cancelled" | "error" | "dismissed";

/** Where PayPal should send the member back to (the backend only accepts our own app). */
export function returnUrl(path: string): string {
  return Platform.OS === "web" ? `${window.location.origin}/${path}` : Linking.createURL(path);
}

const asResult = (status: unknown): PayResult => (status === "paid" || status === "deposit" || status === "cancelled" ? status : "error");

/**
 * Take the person to PayPal and back. `prepare(redirect)` asks the server for the approval address and returns it
 * (or null when there is nothing to approve). Web: a small window over the app; if the browser blocks it, the
 * full-page redirect to `fallbackPath`. Native: the in-app browser that returns to the app.
 */
export async function runPayPal(label: string, fallbackPath: string, prepare: (redirect: string) => Promise<string | null>): Promise<PayResult> {
  if (Platform.OS === "web") {
    const r = await runInPopup(label, prepare);
    if (r === "blocked") {
      const url = await prepare(returnUrl(fallbackPath));
      if (url) window.location.href = url;
      return "dismissed";
    }
    if (!r) return "dismissed";
    return asResult(r.status);
  }
  const redirect = returnUrl(fallbackPath);
  const url = await prepare(redirect);
  if (!url) return "dismissed";
  const result = await WebBrowser.openAuthSessionAsync(url, redirect);
  return result.type === "success" ? asResult(Linking.parse(result.url).queryParams?.status) : "dismissed";
}

/** Pay one contribution with PayPal Checkout. Web: popup over the app. Native / fallback: approval page. */
export async function payContribution(contributionId: string, groupId: string, saveMethod = false): Promise<PayResult> {
  // Saving a PayPal for automatic payment needs PayPal's own page (it shows the agreement), so no popup then.
  if (popupReady() && !saveMethod) return payInPopup(contributionId); // nothing awaited before this: the popup needs the click
  return runPayPal("PayPal…", `groups/${groupId}`, async (redirect) => {
    const { approveUrl } = await api<{ approveUrl: string }>(`/contributions/${contributionId}/checkout`, {
      body: { redirect, ...(saveMethod ? { save: true } : {}) },
    });
    return approveUrl;
  });
}
