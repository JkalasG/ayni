import { useCallback, useState } from "react";
import { useScheme } from "@/lib/scheme";
import { Pressable, Text, View } from "react-native";
import { Stack, router, useFocusEffect } from "expo-router";
import { Button, Chips, H1, Notice, P, Screen } from "@/components/ui";
import { Guide, TwoCol } from "@/components/guide";
import { Icon, type IconName } from "@/components/icons";
import { SteppedBox } from "@/components/stepped";
import { useI18n, type Key } from "@/lib/i18n";
import { useLayout } from "@/lib/layout";
import { api } from "@/lib/api";
import { colors, fonts, space } from "@/lib/theme";

type N = { id: string; kind: string; title: string; body: string; read: boolean; createdAt: string; groupId?: string | null };
type Show = "all" | "new" | "reminder" | "pot" | "action" | "mediation";

/** One color and icon per kind of notice, always next to its title. */
const KIND: Record<string, { color: () => string; icon: IconName }> = {
  reminder: { color: () => colors.pending, icon: "avisos" },
  pot: { color: () => colors.corn, icon: "pozo" },
  action: { color: () => colors.covered, icon: "turno" },
  mediation: { color: () => colors.magenta, icon: "chat" },
};

/** A long history must not bury the newest notices: show this many, the rest on request. */
const PAGE = 20;

export default function Notifications() {
  useScheme(); // re-render when the color mode changes
  const { t, lang } = useI18n();
  const { wide } = useLayout();
  const [items, setItems] = useState<N[]>([]);
  const [shown, setShown] = useState(PAGE);
  const [show, setShow] = useState<Show>("all");

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

  const list = items.filter((n) => (show === "all" ? true : show === "new" ? !n.read : n.kind === show));
  const fresh = items.filter((n) => !n.read).length;
  return (
    <Screen width={wide ? 1240 : 640}>
      <Stack.Screen options={{ title: t("notifications"), headerShown: !wide }} />
      {wide && <H1>{t("notifications")}</H1>}
      <P muted>{t("ntHint")}</P>
      <TwoCol
        side={
          <Guide
            icon="avisos"
            title={t("ntGuide")}
            steps={[
              { title: t("nk_reminder"), body: t("ntG1") },
              { title: t("nk_action"), body: t("ntG2") },
              { title: t("nk_pot"), body: t("ntG3") },
              { title: t("nk_mediation"), body: t("ntG4") },
            ]}
          />
        }
      >
      {items.length === 0 ? (
        <Notice>{t("noNotifications")}</Notice>
      ) : (
        <Chips
          value={show}
          onChange={(v) => {
            setShow(v);
            setShown(PAGE);
          }}
          options={[
            { value: "all", label: `${t("lgAll")} (${items.length})` },
            { value: "new", label: `${t("ntNew")} (${fresh})` },
            { value: "reminder", label: t("nk_reminder") },
            { value: "action", label: t("nk_action") },
            { value: "pot", label: t("nk_pot") },
            { value: "mediation", label: t("nk_mediation") },
          ]}
        />
      )}
      {items.length > 0 && list.length === 0 ? <Notice>{t("ntNone")}</Notice> : null}
      <View style={{ gap: space(3) }}>
        {list.slice(0, shown).map((n) => {
          const k = KIND[n.kind];
          const col = k?.color() ?? colors.inkSoft;
          return (
            <SteppedBox key={n.id} fill={colors.surface} stroke={!n.read ? colors.magenta : colors.line} step={4} style={{ flexDirection: "row", gap: space(3), padding: space(4) }}>
              <View style={{ width: 4, backgroundColor: col, alignSelf: "stretch" }} />
              <View style={{ flex: 1, gap: 4 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Icon name={k?.icon ?? "avisos"} size={18} color={col} />
                  <Text style={{ flex: 1, fontFamily: fonts.bodyBold, fontSize: 13.5, color: col }}>
                    {t(`nk_${n.kind}` as Key)}
                    {!n.read ? `  ·  ${t("newWord")}` : ""}
                  </Text>
                  <Text style={{ fontFamily: fonts.body, fontSize: 13, color: colors.muted }}>
                    {new Date(n.createdAt).toLocaleString(lang === "en" ? "en-US" : "es-BO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </Text>
                </View>
                <Text style={{ fontFamily: fonts.bodyBold, fontSize: 16, color: colors.ink }}>{n.title}</Text>
                <Text style={{ fontFamily: fonts.body, fontSize: 15.5, lineHeight: 23, color: colors.inkSoft }}>{n.body}</Text>
                {n.groupId ? (
                  <Pressable accessibilityRole="link" onPress={() => router.push(`/groups/${n.groupId}` as any)} style={{ alignSelf: "flex-start", minHeight: 32, justifyContent: "center" }}>
                    <Text style={{ fontFamily: fonts.bodyBold, fontSize: 14, color: colors.magenta }}>{t("ntOpen")}</Text>
                  </Pressable>
                ) : null}
              </View>
            </SteppedBox>
          );
        })}
      </View>
      {list.length > shown && <Button kind="secondary" title={`${t("showOlder")} (${list.length - shown})`} onPress={() => setShown((n) => n + PAGE)} />}
      </TwoCol>
    </Screen>
  );
}
