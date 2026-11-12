/**
 * The top of every screen of a group: its name, state, and the menu to move between its views (summary, turns,
 * guarantee, payments, chat, claims...). It replaces the list of links that used to sit at the very bottom of the
 * summary: the views are one tap away from anywhere in the group.
 */
import { Pressable, ScrollView, Text, View } from "react-native";
import { router, usePathname } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Badge } from "@/components/ui";
import { Icon, type IconName } from "@/components/icons";
import { SteppedBox } from "@/components/stepped";
import { useGroup, type Group } from "@/lib/group";
import { useI18n, type Key } from "@/lib/i18n";
import { useLayout } from "@/lib/layout";
import { useScheme } from "@/lib/scheme";
import { money } from "@/lib/api";
import { fonts, space } from "@/lib/theme";

type Tab = { key: string; icon: IconName; label: Key; show: boolean; badge?: number };

export function GroupNav() {
  const { g } = useGroup();
  const { t } = useI18n();
  const { c } = useScheme();
  const { wide } = useLayout();
  const insets = useSafeAreaInsets();
  const path = usePathname();

  const base = `/groups/${g.id}`;
  const started = g.status === "ACTIVE" || g.status === "FINISHED";
  const tabs: Tab[] = [
    { key: "", icon: "inicio", label: "gnSummary", show: true },
    { key: "timeline", icon: "turno", label: "gnTurns", show: started },
    { key: "guarantee", icon: "garantia", label: "gnGuarantee", show: started },
    { key: "payments", icon: "pagar", label: "gnPayments", show: true },
    { key: "chat", icon: "chat", label: "gnChat", show: true, badge: g.unreadChat },
    { key: "claims", icon: "avisos", label: "gnClaims", show: g.status !== "FORMING" },
    { key: "ai-log", icon: "rayo", label: "gnAi", show: true },
    { key: "disputes", icon: "paypal", label: "gnDisputes", show: g.isOrganizer && g.status !== "FORMING" },
    { key: "admission", icon: "compartir", label: "gnPublish", show: g.isOrganizer && g.status === "FORMING" },
  ];
  const here = path.startsWith(base) ? path.slice(base.length).replace(/^\//, "").split("/")[0] : "";

  const status: Record<Group["status"], string> = { FORMING: c.naranja.text, ORDERING: c.turquesa.text, ACTIVE: c.verde.text, FINISHED: c.muted, CANCELLED: c.rojo.text };
  const sub = `${g.memberships.length} ${t("membersWord")} · ${t(g.frequency as Key).toLowerCase()} · ${money(g.contributionCents)} ${t("perRound")}`;

  return (
    <View style={{ backgroundColor: c.bg }}>
      <View style={{ paddingTop: wide ? space(8) : insets.top + space(3), paddingHorizontal: wide ? space(10) : space(4) }}>
        <View style={{ maxWidth: wide ? 1240 : 640, width: "100%", alignSelf: "center", gap: space(3) }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space(3) }}>
            {!wide && (
              <Pressable accessibilityRole="button" accessibilityLabel={t("myGroups")} onPress={() => router.navigate("/groups")}>
                <SteppedBox fill={c.surface} stroke={c.line} step={3} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
                  <Icon name="atras" size={18} color={c.ink} />
                </SteppedBox>
              </Pressable>
            )}
            <View style={{ flex: 1, gap: 2 }}>
              <Text accessibilityRole="header" numberOfLines={wide ? 1 : 2} style={{ fontFamily: fonts.display, fontSize: wide ? 28 : 19, lineHeight: wide ? 34 : 24, color: c.ink }}>
                {g.name}
              </Text>
              <Text numberOfLines={1} style={{ fontFamily: fonts.body, fontSize: wide ? 15.5 : 13.5, color: c.muted }}>
                {sub}
              </Text>
            </View>
            {wide && (
              <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap", justifyContent: "flex-end", maxWidth: 420 }}>
                <Badge text={t(`status_${g.status}` as Key)} color={status[g.status]} />
                {g.isOpen ? <Badge text={t("openBadge")} color={c.turquesa.text} /> : null}
                {g.demoMode ? <Badge text={t("demoBadge")} color={c.muted} /> : null}
                {g.isOrganizer ? <Badge text={t("organizer")} color={c.fucsia.text} /> : null}
              </View>
            )}
          </View>
          {!wide && (
            <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
              <Badge text={t(`status_${g.status}` as Key)} color={status[g.status]} />
              {g.isOpen ? <Badge text={t("openBadge")} color={c.turquesa.text} /> : null}
              {g.demoMode ? <Badge text={t("demoBadge")} color={c.muted} /> : null}
              {g.isOrganizer ? <Badge text={t("organizer")} color={c.fucsia.text} /> : null}
            </View>
          )}

          {/* the menu: one tap to any view of the group; scrolls sideways when it does not fit */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} accessibilityRole="tablist" style={{ borderBottomWidth: 2, borderColor: c.line, flexGrow: 0 }} contentContainerStyle={{ gap: 2 }}>
            {tabs
              .filter((x) => x.show)
              .map((x) => {
                const on = x.key === here;
                const color = on ? c.fucsia.text : c.muted;
                return (
                  <Pressable
                    key={x.key || "summary"}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={x.badge ? `${t(x.label)}, ${x.badge}` : t(x.label)}
                    onPress={() => router.navigate((x.key ? `${base}/${x.key}` : base) as any)}
                    style={({ hovered, pressed }: any) => ({
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 8,
                      minHeight: 48,
                      paddingHorizontal: 14,
                      borderBottomWidth: 3,
                      marginBottom: -2,
                      borderColor: on ? c.fucsia.fill : "transparent",
                      backgroundColor: hovered || pressed ? c.surfaceAlt : "transparent",
                    })}
                  >
                    <Icon name={x.icon} size={18} color={color} />
                    <Text style={{ fontFamily: on ? fonts.bodyBold : fonts.body, fontSize: 15, color }}>{t(x.label)}</Text>
                    {x.badge ? (
                      <View style={{ backgroundColor: c.fucsia.fill, minWidth: 20, height: 20, paddingHorizontal: 5, alignItems: "center", justifyContent: "center" }}>
                        <Text style={{ fontFamily: fonts.bodyBold, fontSize: 12, color: c.onAction }}>{x.badge}</Text>
                      </View>
                    ) : null}
                  </Pressable>
                );
              })}
          </ScrollView>
        </View>
      </View>
    </View>
  );
}

