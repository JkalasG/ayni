import { Platform } from "react-native";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import { api } from "./api";

export type PayResult = "paid" | "cancelled" | "error" | "dismissed";

/**
 * Opens PayPal checkout for one contribution.
 * Native: in-app browser that returns to the app. Web: full-page redirect back to the group.
 */
export async function payContribution(contributionId: string, groupId: string): Promise<PayResult> {
  const redirect =
    Platform.OS === "web" ? `${window.location.origin}/groups/${groupId}` : Linking.createURL(`groups/${groupId}`);
  const { approveUrl } = await api<{ approveUrl: string }>(`/contributions/${contributionId}/checkout`, {
    body: { redirect },
  });
  if (Platform.OS === "web") {
    window.location.href = approveUrl;
    return "dismissed";
  }
  const result = await WebBrowser.openAuthSessionAsync(approveUrl, redirect);
  if (result.type !== "success") return "dismissed";
  const status = Linking.parse(result.url).queryParams?.status;
  return status === "paid" || status === "cancelled" ? status : "error";
}
