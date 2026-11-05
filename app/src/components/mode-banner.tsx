import { useEffect, useState } from "react";
import { Platform, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { API_URL } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { colors, fonts } from "@/lib/theme";

function useMock() {
  const [mock, setMock] = useState(false);
  useEffect(() => {
    fetch(`${API_URL}/health`)
      .then((r) => r.json())
      .then((h) => setMock(h?.mode === "mock"))
      .catch(() => {});
  }, []);
  return mock;
}

/**
 * Visible whenever the backend runs in APP_MODE=mock, so nothing on screen looks like real money.
 * Web: a thin strip above everything. Native: a floating pill that never blocks a tap.
 */
export function ModeBanner() {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const mock = useMock();
  const { width } = useWindowDimensions();
  if (!mock) return null;

  if (Platform.OS === "web") {
    return (
      <View accessibilityRole="text" style={{ backgroundColor: colors.paypal, paddingVertical: 5, paddingHorizontal: 12, alignItems: "center" }}>
        <Text style={{ color: colors.paypalInk, fontFamily: fonts.bodyBold, fontSize: 13, textAlign: "center" }}>{width < 600 ? t("mockShort") : t("mockBanner")}</Text>
      </View>
    );
  }
  return (
    <View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, top: insets.top + 4, alignItems: "center" }}>
      <View style={{ backgroundColor: colors.paypal, borderRadius: 99, paddingVertical: 3, paddingHorizontal: 10 }}>
        <Text style={{ color: colors.paypalInk, fontFamily: fonts.bodyBold, fontSize: 11 }}>{t("mockShort")}</Text>
      </View>
    </View>
  );
}
