import { useCallback, useState } from "react";
import { useScheme } from "@/lib/scheme";
import { Text, View } from "react-native";
import { Stack, useFocusEffect } from "expo-router";
import { H1, Notice, Screen } from "@/components/ui";
import { Icon, type IconName } from "@/components/icons";
import { useI18n } from "@/lib/i18n";
import { useLayout } from "@/lib/layout";
import { api } from "@/lib/api";
import { colors, fonts, space } from "@/lib/theme";

type N = { id: string; kind: string; title: string; body: string; read: boolean; createdAt: string };

/** One color and icon per kind of notice, always next to its title. */
const KIND: Record<string, { color: () => string; icon: IconName }> = {
  reminder: { color: () => colors.pending, icon: "avisos" },
  pot: { color: () => colors.corn, icon: "pozo" },
  action: { color: () => colors.covered, icon: "aprobar" },
  mediation: { color: () => colors.magenta, icon: "chat" },
};

export default function Notifications() {
  useScheme(); // re-render when the color mode changes
  const { t, lang } = useI18n();
  const { wide } = useLayout();
  const [items, setItems] = useState<N[]>([]);

  useFocusEffect(
    useCallback(() => {
      api<N[]>("/notifications")
        .then((n) => {
          setItems(n);
          return api("/notifications/read", { body: {} });
        })
        .catch(() => {});
    }, [])
  );

  return (
    <Screen>
      <Stack.Screen options={{ title: t("notifications") }} />
      {wide && <H1>{t("notifications")}</H1>}
      {items.length === 0 && <Notice>{t("noNotifications")}</Notice>}
      <View>
        {items.map((n, i) => (
          <View
            key={n.id}
            style={{
              flexDirection: "row",
              gap: space(3),
              paddingVertical: space(4),
              borderBottomWidth: i < items.length - 1 ? 1 : 0,
              borderColor: colors.line,
              backgroundColor: !n.read ? colors.magenta + "0A" : "transparent",
              paddingHorizontal: !n.read ? space(2) : 0,
            }}
          >
            <View style={{ paddingTop: 2 }}>
              <Icon name={KIND[n.kind]?.icon ?? "avisos"} size={20} color={KIND[n.kind]?.color() ?? colors.inkSoft} />
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
                <Text style={{ flex: 1, fontFamily: fonts.bodyBold, fontSize: 16, color: colors.ink }}>{n.title}</Text>
                <Text style={{ fontFamily: fonts.body, fontSize: 13, color: colors.muted }}>
                  {new Date(n.createdAt).toLocaleString(lang === "en" ? "en-US" : "es-BO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                </Text>
              </View>
              <Text style={{ fontFamily: fonts.body, fontSize: 15.5, lineHeight: 23, color: colors.inkSoft }}>{n.body}</Text>
            </View>
          </View>
        ))}
      </View>
    </Screen>
  );
}
