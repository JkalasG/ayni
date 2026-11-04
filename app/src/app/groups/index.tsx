import { useCallback, useState } from "react";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { Redirect, Stack, router, useFocusEffect } from "expo-router";
import { Badge, Button, Card, H2, P, Stripe } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { useI18n, type Key } from "@/lib/i18n";
import { api, money } from "@/lib/api";
import { colors } from "@/lib/theme";

type GroupRow = {
  id: string;
  name: string;
  status: string;
  contributionCents: number;
  frequency: string;
  _count: { memberships: number };
};

export default function Groups() {
  const { me, logout } = useAuth();
  const { t } = useI18n();
  const [groups, setGroups] = useState<GroupRow[] | null>(null);
  const [unread, setUnread] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const [g, n] = await Promise.all([api<GroupRow[]>("/groups"), api<{ read: boolean }[]>("/notifications")]);
    setGroups(g);
    setUnread(n.filter((x) => !x.read).length);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load().catch(() => {});
    }, [load])
  );

  if (!me) return <Redirect href="/" />;

  return (
    <>
      <Stack.Screen
        options={{
          title: t("myGroups"),
          headerRight: () => (
            <Pressable onPress={() => router.push("/notifications")} style={{ padding: 8 }} accessibilityLabel={t("notifications")}>
              <Text style={{ fontSize: 20 }}>
                🔔{unread > 0 ? <Text style={{ color: colors.primary, fontSize: 14, fontWeight: "800" }}> {unread}</Text> : null}
              </Text>
            </Pressable>
          ),
        }}
      />
      <ScrollView
        style={{ backgroundColor: colors.bg }}
        contentContainerStyle={{ padding: 16, gap: 16, maxWidth: 560, width: "100%", alignSelf: "center" }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await load().catch(() => {});
              setRefreshing(false);
            }}
          />
        }
      >
        <P muted>
          {me.name} · {me.email}
        </P>
        {groups?.length === 0 && <P muted>{t("noGroups")}</P>}
        {groups?.map((g) => (
          <Pressable key={g.id} onPress={() => router.push(`/groups/${g.id}`)}>
            <Card>
              <Stripe height={4} />
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <H2>{g.name}</H2>
                <Badge text={t(`status_${g.status}` as Key)} color={g.status === "ACTIVE" ? colors.leaf : colors.corn} />
              </View>
              <P muted>
                {money(g.contributionCents)} · {t(g.frequency as Key)} · {g._count.memberships} {t("members").toLowerCase()}
              </P>
            </Card>
          </Pressable>
        ))}
        <Button title={t("create")} onPress={() => router.push("/groups/new")} />
        <Button kind="secondary" title={t("join")} onPress={() => router.push("/join")} />
        <Button kind="ghost" title={t("logout")} onPress={logout} />
      </ScrollView>
    </>
  );
}
