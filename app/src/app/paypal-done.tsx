import { useEffect, useState } from "react";
import { Platform, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Loading } from "@/components/ui";
import { CHANNEL } from "@/lib/popup";
import { useI18n } from "@/lib/i18n";
import { useScheme } from "@/lib/scheme";
import { fonts, space } from "@/lib/theme";

/**
 * Where PayPal sends the person back to when it ran in a small window (see lib/popup.ts). It tells the app window how
 * it went (paid, deposit, cancelled, a login token...) and closes itself. Opened in a normal tab instead (the window
 * was blocked or the link was followed by hand), it simply carries on inside the app.
 */
export default function PayPalDone() {
  const { c } = useScheme();
  const { t } = useI18n();
  const params = useLocalSearchParams<Record<string, string>>();
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    if (Platform.OS !== "web") return router.replace("/groups");
    const clean = Object.fromEntries(Object.entries(params).filter(([, v]) => typeof v === "string")) as Record<string, string>;
    const message = { type: "ayni-paypal", params: clean };
    // another Ayni window is waiting for this (it opened this one): tell it on both roads and close
    const channel = typeof BroadcastChannel === "function" ? new BroadcastChannel(CHANNEL) : null;
    const opener = window.opener && !window.opener.closed ? window.opener : null;
    if (opener || channel) {
      opener?.postMessage(message, window.location.origin);
      channel?.postMessage(message);
      channel?.close();
      window.close();
      // a window that was not opened by script cannot close itself: say so instead of leaving a spinner
      const wait = setTimeout(() => {
        if (opener) setStuck(true);
        else if (clean.token) router.replace(`/auth?token=${encodeURIComponent(clean.token)}` as any);
        else router.replace((clean.status ? `/groups?status=${encodeURIComponent(clean.status)}` : "/groups") as any);
      }, 1200);
      return () => clearTimeout(wait);
    }
  }, [params]);

  if (!stuck) return <Loading />;
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: space(3), padding: space(6), backgroundColor: c.bg }}>
      <Text style={{ fontFamily: fonts.display, fontSize: 20, color: c.ink, textAlign: "center" }}>{t("ppDone")}</Text>
      <Text style={{ fontFamily: fonts.body, fontSize: 15, color: c.muted, textAlign: "center" }}>{t("ppDoneBody")}</Text>
    </View>
  );
}
