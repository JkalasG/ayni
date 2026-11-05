import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { router, usePathname } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AguayoBand } from "@/components/aguayo";
import { Icon, type IconName } from "@/components/icons";
import { useAuth } from "@/lib/auth";
import { useI18n, type Key } from "@/lib/i18n";
import { useLayout } from "@/lib/layout";
import { useScheme, type SchemePref } from "@/lib/scheme";
import { api } from "@/lib/api";
import { fonts, space } from "@/lib/theme";

type GroupRow = { id: string; name: string; status: string };

const TABS: { key: string; href: string; icon: IconName; label: Key; match: (p: string) => boolean }[] = [
  { key: "groups", href: "/groups", icon: "grupos", label: "tabGroups", match: (p) => p.startsWith("/groups") },
  { key: "explore", href: "/explore", icon: "explorar", label: "tabExplore", match: (p) => p.startsWith("/explore") },
  { key: "passport", href: "/profile", icon: "pasaporte", label: "tabPassport", match: (p) => p.startsWith("/profile") },
  { key: "alerts", href: "/notifications", icon: "avisos", label: "tabAlerts", match: (p) => p.startsWith("/notifications") },
];

/** Screens that own the whole viewport (welcome, PayPal return, chat with its composer). */
const NO_NAV = (p: string) => p === "/" || p.startsWith("/auth") || p.endsWith("/chat");

function useUnread() {
  const path = usePathname();
  const [unread, setUnread] = useState(0);
  const load = useCallback(() => {
    api<{ read: boolean }[]>("/notifications")
      .then((n) => setUnread(n.filter((x) => !x.read).length))
      .catch(() => {});
  }, []);
  useEffect(() => {
    load();
    const timer = setInterval(load, 20000);
    return () => clearInterval(timer);
  }, [load, path]);
  return unread;
}

/**
 * Computer: a woven sidebar beside the content. Phone: a tab bar at the bottom.
 * Same tree in every case, so the screens never remount when the nav appears.
 */
export function Shell({ children }: { children: ReactNode }) {
  const { wide } = useLayout();
  const { me } = useAuth();
  const { c } = useScheme();
  const path = usePathname();
  const nav = !!me && !NO_NAV(path);
  return (
    <View style={{ flex: 1, flexDirection: "row", backgroundColor: c.bg }}>
      {wide && nav ? <Sidebar /> : null}
      <View style={{ flex: 1 }}>
        <View style={{ flex: 1 }}>{children}</View>
        {!wide && nav ? <TabBar /> : null}
      </View>
    </View>
  );
}

function TabBar() {
  const { c } = useScheme();
  const { t } = useI18n();
  const path = usePathname();
  const insets = useSafeAreaInsets();
  const unread = useUnread();
  const [fu, , am] = c.threads;
  return (
    <View style={{ backgroundColor: c.surface }} accessibilityRole="tablist">
      <AguayoBand motif="franjas" colors={[fu, am]} cell={2} />
      <View style={{ flexDirection: "row", paddingBottom: insets.bottom }}>
        {TABS.map((tab) => {
          const on = tab.match(path);
          const color = on ? c.fucsia.text : c.muted;
          const count = tab.key === "alerts" ? unread : 0;
          return (
            <Pressable
              key={tab.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              accessibilityLabel={count ? `${t(tab.label)}, ${count}` : t(tab.label)}
              onPress={() => router.navigate(tab.href as any)}
              style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 10, paddingBottom: 8, gap: 4, minHeight: 60 }}
            >
              <View>
                <Icon name={tab.icon} size={22} color={color} />
                {count ? (
                  <View style={{ position: "absolute", right: -10, top: -6, minWidth: 18, height: 18, paddingHorizontal: 4, backgroundColor: c.fucsia.fill, alignItems: "center", justifyContent: "center" }}>
                    <Text style={{ color: c.onAction, fontFamily: fonts.bodyBold, fontSize: 11 }}>{count}</Text>
                  </View>
                ) : null}
              </View>
              <Text style={{ fontFamily: on ? fonts.bodyBold : fonts.body, fontSize: 12.5, color }}>{t(tab.label)}</Text>
              {on ? <View style={{ position: "absolute", top: 0, width: 28, height: 3, backgroundColor: c.fucsia.fill }} /> : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const SCHEMES: { pref: SchemePref; icon: IconName; label: Key }[] = [
  { pref: "system", icon: "sistema", label: "schemeSystem" },
  { pref: "light", icon: "claro", label: "schemeLight" },
  { pref: "dark", icon: "oscuro", label: "schemeDark" },
];

function Sidebar() {
  const { me, logout } = useAuth();
  const { t, lang, setLang } = useI18n();
  const { c, pref, setPref } = useScheme();
  const path = usePathname();
  const unread = useUnread();
  const [groups, setGroups] = useState<GroupRow[]>([]);

  // refresh on navigation and every 30 s; a failed request retries once shortly after
  useEffect(() => {
    let alive = true;
    const load = (retry: boolean) =>
      api<GroupRow[]>("/groups")
        .then((g) => alive && setGroups(g.filter((x) => x.status !== "FINISHED")))
        .catch(() => {
          if (retry && alive) setTimeout(() => load(false), 2000);
        });
    load(true);
    const timer = setInterval(() => load(false), 30000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [path]);

  // The loom: always deep indigo, in both skies, with light thread on top.
  const loom = c.scheme === "dark" ? "#070A1F" : "#1A1A3A";
  const light = "#F7F3EA";
  const soft = "rgba(247,243,234,0.72)";
  const [fu, na, am, , tu] = c.threads;

  const Item = ({ label, href, icon, active, count }: { label: string; href: string; icon: IconName; active: boolean; count?: number }) => (
    <Pressable
      accessibilityRole="link"
      accessibilityState={{ selected: active }}
      onPress={() => router.navigate(href as any)}
      style={({ hovered }: any) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        minHeight: 46,
        paddingHorizontal: 14,
        backgroundColor: active ? "rgba(255,255,255,0.10)" : hovered ? "rgba(255,255,255,0.05)" : "transparent",
        borderLeftWidth: 3,
        borderColor: active ? "#FF4A97" : "transparent",
      })}
    >
      <Icon name={icon} size={20} color={active ? "#FF4A97" : soft} />
      <Text style={{ flex: 1, color: active ? light : soft, fontFamily: active ? fonts.bodyBold : fonts.body, fontSize: 15.5 }}>{label}</Text>
      {count ? (
        <View style={{ backgroundColor: "#FF4A97", minWidth: 22, paddingHorizontal: 6, height: 22, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: "#0B0E27", fontFamily: fonts.bodyBold, fontSize: 12 }}>{count}</Text>
        </View>
      ) : null}
    </Pressable>
  );

  return (
    <View style={{ width: 280, flexDirection: "row", backgroundColor: loom }}>
      <View style={{ flex: 1, paddingVertical: space(7), paddingHorizontal: space(3), gap: space(6) }}>
        <Pressable onPress={() => router.navigate("/groups")} accessibilityRole="link" accessibilityLabel="Ayni" style={{ paddingHorizontal: 14 }}>
          <Text style={{ fontFamily: fonts.displayHeavy, fontSize: 40, color: light, letterSpacing: -2 }}>ayni</Text>
          <Text style={{ fontFamily: fonts.body, fontSize: 13.5, color: soft }}>{t("ayniMotto")}</Text>
        </Pressable>

        <View style={{ gap: 2 }}>
          {TABS.map((tab) => (
            <Item key={tab.key} label={t(tab.label)} href={tab.href} icon={tab.icon} active={tab.match(path) && !(tab.key === "groups" && /^\/groups\/(?!new)/.test(path))} count={tab.key === "alerts" ? unread : 0} />
          ))}
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 2 }}>
          <Text style={{ color: "rgba(247,243,234,0.55)", fontFamily: fonts.bodyBold, fontSize: 13, paddingHorizontal: 14, marginBottom: 6 }}>{t("activeCircles")}</Text>
          {groups.map((g) => {
            const active = path.startsWith(`/groups/${g.id}`);
            return (
              <Pressable
                key={g.id}
                accessibilityRole="link"
                accessibilityState={{ selected: active }}
                onPress={() => router.navigate(`/groups/${g.id}`)}
                style={({ hovered }: any) => ({
                  minHeight: 42,
                  paddingHorizontal: 14,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 10,
                  backgroundColor: active ? "rgba(255,255,255,0.10)" : hovered ? "rgba(255,255,255,0.05)" : "transparent",
                })}
              >
                <View style={{ width: 8, height: 8, transform: [{ rotate: "45deg" }], backgroundColor: g.status === "ACTIVE" ? "#2FD49A" : "#FF8A1F" }} />
                <Text numberOfLines={1} style={{ flex: 1, color: active ? light : soft, fontFamily: active ? fonts.bodyBold : fonts.body, fontSize: 14.5 }}>
                  {g.name}
                </Text>
              </Pressable>
            );
          })}
          <Pressable onPress={() => router.navigate("/groups/new")} style={{ minHeight: 42, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 10 }} accessibilityRole="link">
            <Icon name="mas" size={16} color="#FFD23F" />
            <Text style={{ color: "#FFD23F", fontFamily: fonts.bodyBold, fontSize: 14.5 }}>{t("create")}</Text>
          </Pressable>
        </ScrollView>

        <View style={{ borderTopWidth: 1, borderColor: "rgba(247,243,234,0.14)", paddingTop: space(4), paddingHorizontal: 14, gap: 12 }}>
          <Text style={{ color: light, fontFamily: fonts.bodyBold, fontSize: 15 }}>{me?.name}</Text>
          <View accessibilityRole="radiogroup" accessibilityLabel={t("schemeLabel")} style={{ flexDirection: "row", gap: 4 }}>
            {SCHEMES.map((s) => {
              const on = pref === s.pref;
              return (
                <Pressable
                  key={s.pref}
                  accessibilityRole="radio"
                  accessibilityLabel={t(s.label)}
                  accessibilityState={{ checked: on }}
                  onPress={() => setPref(s.pref)}
                  style={{ width: 44, height: 40, alignItems: "center", justifyContent: "center", backgroundColor: on ? "#FF4A97" : "rgba(255,255,255,0.06)" }}
                >
                  <Icon name={s.icon} size={18} color={on ? "#0B0E27" : soft} />
                </Pressable>
              );
            })}
          </View>
          <View style={{ flexDirection: "row", gap: 18 }}>
            <Pressable onPress={() => setLang(lang === "es" ? "en" : "es")} accessibilityRole="button" accessibilityLabel={t("languageLabel")} style={{ minHeight: 44, flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Icon name="idioma" size={16} color={soft} />
              <Text style={{ color: soft, fontFamily: fonts.body, fontSize: 14 }}>{t("language")}</Text>
            </Pressable>
            <Pressable onPress={logout} accessibilityRole="button" style={{ minHeight: 44, justifyContent: "center" }}>
              <Text style={{ color: soft, fontFamily: fonts.body, fontSize: 14 }}>{t("logout")}</Text>
            </Pressable>
          </View>
        </View>
      </View>
      <AguayoBand motif="zigzag" colors={[tu, na]} cell={3} vertical ground={loom} />
      <AguayoBand motif="franjas" colors={[fu, am]} cell={3} vertical />
    </View>
  );
}
