import { useCallback, useState } from "react";
import { Stack, useFocusEffect } from "expo-router";
import { Card, H2, P, Screen } from "@/components/ui";
import { useI18n } from "@/lib/i18n";
import { api } from "@/lib/api";
import { colors } from "@/lib/theme";

type N = { id: string; kind: string; title: string; body: string; read: boolean; createdAt: string };

const ICON: Record<string, string> = { reminder: "⏰", pot: "🎉", action: "📋", mediation: "🤝" };

export default function Notifications() {
  const { t } = useI18n();
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
      {items.length === 0 && <P muted>{t("noNotifications")}</P>}
      {items.map((n) => (
        <Card key={n.id} style={!n.read ? { borderColor: colors.primary } : undefined}>
          <H2>
            {ICON[n.kind] ?? "•"} {n.title}
          </H2>
          <P>{n.body}</P>
          <P muted style={{ fontSize: 12 }}>
            {new Date(n.createdAt).toLocaleString()}
          </P>
        </Card>
      ))}
    </Screen>
  );
}
