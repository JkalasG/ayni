import { useCallback, useEffect, useState } from "react";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { Redirect, Stack, router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Badge, Button } from "@/components/ui";
import { AguayoBand, type Motif } from "@/components/aguayo";
import { Controls } from "@/components/controls";
import { Icon } from "@/components/icons";
import { People } from "@/components/altiplano";
import { useAuth } from "@/lib/auth";
import { useI18n, type Key } from "@/lib/i18n";
import { useLayout } from "@/lib/layout";
import { useScheme } from "@/lib/scheme";
import { api, money } from "@/lib/api";
import { fonts, space, type Palette } from "@/lib/theme";

type GroupRow = {
  id: string;
  name: string;
  status: "FORMING" | "ORDERING" | "ACTIVE" | "FINISHED";
  contributionCents: number;
  frequency: string;
  maxMembers: number;
  isOpen?: boolean;
  _count: { memberships: number };
};

/** What the tile needs from the group detail: my turn, my next date, whether I owe. */
type Mine = { turn: number | null; nextDue: string | null; mustPay: boolean; myRound: boolean };

const statusColor = (c: Palette, s: GroupRow["status"]) => ({ FORMING: c.naranja.text, ORDERING: c.turquesa.text, ACTIVE: c.verde.text, FINISHED: c.muted })[s];
const MOTIFS: Motif[] = ["zigzag", "escalonado", "franjas"];

function hash(s: string) {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

export default function Groups() {
  const { me, logout } = useAuth();
  const { t, lang } = useI18n();
  const { c } = useScheme();
  const { wide } = useLayout();
  const insets = useSafeAreaInsets();
  const [groups, setGroups] = useState<GroupRow[] | null>(null);
  const [mine, setMine] = useState<Record<string, Mine>>({});
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setGroups(await api<GroupRow[]>("/groups"));
  }, []);

  useFocusEffect(
    useCallback(() => {
      load().catch(() => {});
    }, [load])
  );

  // details for the tiles, one group at a time (read only, same endpoint as the group screen)
  useEffect(() => {
    for (const g of groups ?? []) {
      if (g.status === "FINISHED") continue;
      api<any>(`/groups/${g.id}`)
        .then((d) => {
          const meM = d.memberships.find((m: any) => m.id === d.myMembershipId);
          const cur = d.rounds.find((r: any) => r.status === "COLLECTING" || r.status === "READY");
          const myC = cur?.contributions.find((x: any) => x.membershipId === d.myMembershipId);
          const myRound = d.rounds.find((r: any) => r.recipientId === d.myMembershipId);
          setMine((prev) => ({
            ...prev,
            [g.id]: { turn: myRound?.number ?? meM?.turn ?? null, nextDue: cur?.dueAt ?? null, mustPay: myC?.status === "PENDING" && cur?.status === "COLLECTING", myRound: cur?.recipientId === d.myMembershipId },
          }));
        })
        .catch(() => {});
    }
  }, [groups]);

  if (!me) return <Redirect href="/" />;

  const active = (groups ?? []).filter((g) => g.status !== "FINISHED");
  const finished = (groups ?? []).filter((g) => g.status === "FINISHED");
  const firstName = me.name.replace(/^(Doña|Don)\s+/i, "").split(" ")[0];
  const locale = lang === "en" ? "en-US" : "es-BO";
  const day = (d: string) => new Date(d).toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "short" });
  const [fu, , am, ve, tu] = c.threads;

  const tile = (g: GroupRow) => {
    const h = hash(g.id);
    const m = mine[g.id];
    const band = [
      [fu, am, ve],
      [tu, fu],
      [am, tu],
      [ve, fu],
    ][h % 4];
    return (
      <Pressable
        key={g.id}
        onPress={() => router.push(`/groups/${g.id}`)}
        accessibilityRole="link"
        accessibilityLabel={`${g.name}, ${t(`status_${g.status}` as Key)}${m?.mustPay ? `, ${t("youOwe")}` : ""}`}
        style={({ hovered, pressed }: any) => ({
          backgroundColor: c.surface,
          borderRadius: 10,
          borderWidth: m?.mustPay ? 2 : 1,
          borderColor: m?.mustPay ? c.fucsia.fill : hovered ? c.muted : c.line,
          overflow: "hidden",
          flexBasis: wide ? "48%" : "100%",
          flexGrow: 1,
          opacity: pressed ? 0.88 : 1,
        })}
      >
        <AguayoBand motif={MOTIFS[h % 3]} colors={band} cell={3} />
        <View style={{ padding: space(4), gap: space(3) }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
            <Text style={{ flex: 1, fontFamily: fonts.display, fontSize: 18, lineHeight: 24, color: c.ink }}>{g.name}</Text>
            <Badge text={t(`status_${g.status}` as Key)} color={statusColor(c, g.status)} />
          </View>
          <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}>
            <Text style={{ fontFamily: fonts.displayHeavy, fontSize: 32, color: c.amarillo.text, fontVariant: ["tabular-nums"] }}>{money(g.contributionCents * g._count.memberships)}</Text>
            <Text style={{ fontFamily: fonts.body, fontSize: 14.5, color: c.muted }}>{t("potPer")}</Text>
          </View>
          <Text style={{ fontFamily: fonts.body, fontSize: 14.5, color: c.muted }}>
            {g._count.memberships} {t("of")} {g.maxMembers} {t("members").toLowerCase()}, {money(g.contributionCents)} {t(`per_${g.frequency}` as Key)}
          </Text>
          {m && (m.turn != null || m.nextDue) ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, borderTopWidth: 1, borderColor: c.line, paddingTop: space(3) }}>
              {m.turn != null && (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 8, paddingVertical: 5, backgroundColor: c.amarillo.fill + "26" }}>
                  <Icon name="turno" size={13} color={c.amarillo.text} />
                  <Text style={{ fontFamily: fonts.bodyBold, fontSize: 13, color: c.amarillo.text }}>{m.myRound ? t("youReceiveThisRound") : `${t("yourTurnShort")}: R${m.turn}`}</Text>
                </View>
              )}
              {m.nextDue && (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 8, paddingVertical: 5, backgroundColor: (m.mustPay ? c.naranja.fill : c.verde.fill) + "22" }}>
                  <Icon name={m.mustPay ? "pagar" : "aprobar"} size={13} color={m.mustPay ? c.naranja.text : c.verde.text} />
                  <Text style={{ fontFamily: fonts.bodyBold, fontSize: 13, color: m.mustPay ? c.naranja.text : c.verde.text }}>
                    {m.mustPay ? `${t("payBy")} ${day(m.nextDue)}` : t("youPaid")}
                  </Text>
                </View>
              )}
            </View>
          ) : null}
        </View>
      </Pressable>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: t("myGroups"), headerShown: false }} />
      <ScrollView
        contentContainerStyle={{ paddingTop: wide ? space(10) : insets.top + space(4), paddingHorizontal: wide ? space(10) : space(4), paddingBottom: space(12) }}
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
        <View style={{ maxWidth: wide ? 1100 : 640, width: "100%", alignSelf: "center", gap: space(6) }}>
          <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
            <View style={{ flex: 1, gap: 4 }}>
              <Text accessibilityRole="header" style={{ fontFamily: fonts.displayHeavy, fontSize: wide ? 40 : 28, lineHeight: wide ? 46 : 34, color: c.ink, letterSpacing: -0.6 }}>
                {t("hello")} {firstName}
              </Text>
              <Text style={{ fontFamily: fonts.body, fontSize: 16, color: c.muted }}>{t("myGroups")}</Text>
            </View>
            {!wide && <Controls compact />}
          </View>

          {groups?.length === 0 && (
            <View style={{ backgroundColor: c.surface, borderWidth: 1, borderColor: c.line, borderRadius: 10, padding: space(6), gap: space(3), alignItems: "center" }}>
              <People height={120} ink="#1A1A3A" />
              <Text style={{ fontFamily: fonts.display, fontSize: 19, color: c.ink, textAlign: "center" }}>{t("noGroupsTitle")}</Text>
              <Text style={{ fontFamily: fonts.body, fontSize: 16, lineHeight: 24, color: c.muted, textAlign: "center" }}>{t("noGroups")}</Text>
            </View>
          )}

          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space(4) }}>{active.map(tile)}</View>

          <View style={{ flexDirection: wide ? "row" : "column", gap: space(3) }}>
            <View style={{ flex: wide ? 1 : undefined }}>
              <Button title={t("create")} left={<Icon name="mas" size={18} color={c.onAction} />} onPress={() => router.push("/groups/new")} />
            </View>
            <View style={{ flex: wide ? 1 : undefined }}>
              <Button kind="secondary" title={t("join")} onPress={() => router.push("/join")} />
            </View>
            <View style={{ flex: wide ? 1 : undefined }}>
              <Button kind="secondary" title={t("explore")} left={<Icon name="explorar" size={18} color={c.ink} />} onPress={() => router.push("/explore")} />
            </View>
          </View>

          {finished.length > 0 && (
            <View style={{ gap: space(2) }}>
              <Text style={{ fontFamily: fonts.bodyBold, fontSize: 15, color: c.muted }}>{t("finishedCircles")}</Text>
              {finished.map((g) => (
                <Pressable key={g.id} onPress={() => router.push(`/groups/${g.id}`)} accessibilityRole="link" style={{ minHeight: 48, paddingVertical: 12, borderBottomWidth: 1, borderColor: c.line, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Text style={{ fontFamily: fonts.body, fontSize: 16, color: c.ink }}>{g.name}</Text>
                  <Text style={{ fontFamily: fonts.displayMedium, fontSize: 14, color: c.muted }}>{money(g.contributionCents * g._count.memberships)}</Text>
                </Pressable>
              ))}
            </View>
          )}

          {!wide && <Button kind="ghost" title={t("logout")} onPress={logout} />}
        </View>
      </ScrollView>
    </View>
  );
}
