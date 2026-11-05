import { useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { Redirect } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, { FadeIn } from "react-native-reanimated";
import { Loading } from "@/components/ui";
import { AguayoUnfold } from "@/components/aguayo";
import { Altiplano } from "@/components/altiplano";
import { Icon } from "@/components/icons";
import { Controls } from "@/components/controls";
import { StepButton } from "@/components/stepped";
import { WovenAvatar } from "@/components/woven-avatar";
import { useAuth } from "@/lib/auth";
import { useI18n, type Key } from "@/lib/i18n";
import { useLayout } from "@/lib/layout";
import { useScheme } from "@/lib/scheme";
import { api } from "@/lib/api";
import { fonts, space } from "@/lib/theme";

type DemoUser = { id: string; name: string; email: string };

/** What each seeded demo member is good for, so a judge knows whom to pick. */
const DEMO_HINT: Record<string, Key> = {
  "Doña Rosa": "hintRosa",
  Marisol: "hintMarisol",
  "Tomás": "hintTomas",
  Kusi: "hintKusi",
};

export default function Welcome() {
  const { me, loading, loginWithPayPal, loginAsDemo } = useAuth();
  const { t } = useI18n();
  const { c } = useScheme();
  const { wide } = useLayout();
  const [demoUsers, setDemoUsers] = useState<DemoUser[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [showDemo, setShowDemo] = useState(false);

  useEffect(() => {
    api<DemoUser[]>("/auth/demo/users").then(setDemoUsers).catch(() => setDemoUsers([]));
  }, []);

  if (loading) return <Loading />;
  if (me) return <Redirect href="/groups" />;

  const login = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
    } finally {
      setBusy(null);
    }
  };

  const brand = (big: boolean) => (
    <View style={{ gap: big ? 18 : 10 }}>
      <Text
        accessibilityRole="header"
        style={{ fontFamily: fonts.displayHeavy, fontSize: big ? 168 : 92, lineHeight: big ? 172 : 98, color: c.ink, letterSpacing: big ? -8 : -4, marginLeft: big ? -8 : -4 }}
      >
        ayni
      </Text>
      <Text style={{ fontFamily: fonts.display, fontSize: big ? 30 : 21, lineHeight: big ? 38 : 28, color: c.ink, maxWidth: big ? 520 : 300 }}>{t("ayniMotto")}</Text>
      <Text style={{ fontFamily: fonts.body, fontSize: big ? 17 : 15, lineHeight: big ? 25 : 22, color: c.ink, maxWidth: 360 }}>{t("ayniWord")}</Text>
    </View>
  );

  const panel = (
    <View style={{ gap: space(5), width: "100%", maxWidth: 440, alignSelf: "center" }}>
      <View style={{ gap: space(3) }}>
        <Text style={{ fontFamily: fonts.display, fontSize: wide ? 30 : 24, lineHeight: wide ? 38 : 31, color: c.ink }}>{t("welcomeTitle")}</Text>
        <Text style={{ fontFamily: fonts.body, fontSize: 17, lineHeight: 26, color: c.muted }}>{t("howItWorks")}</Text>
      </View>
      <View style={{ gap: space(3) }}>
        <StepButton
          title={t("loginPaypal")}
          fill={c.paypal}
          ink={c.paypalInk}
          loading={busy === "pp"}
          left={<Icon name="pagar" size={20} color={c.paypalInk} />}
          onPress={() => login("pp", loginWithPayPal)}
        />
        {demoUsers.length > 0 && (
          <StepButton
            title={t("enterDemo")}
            fill={c.fucsia.fill}
            ink={c.onAction}
            expanded={showDemo}
            left={<Icon name="grupos" size={20} color={c.onAction} />}
            onPress={() => setShowDemo((v) => !v)}
          />
        )}
      </View>
      {showDemo && demoUsers.length > 0 && (
        <Animated.View entering={FadeIn.duration(260)} style={{ gap: space(2) }}>
          <Text style={{ fontFamily: fonts.bodyBold, fontSize: 15, color: c.muted }}>{t("demoPick")}</Text>
          <View style={{ borderTopWidth: 1, borderColor: c.line }}>
            {demoUsers.map((u) => (
              <Pressable
                key={u.id}
                accessibilityRole="button"
                accessibilityLabel={`${t("enterAs")} ${u.name}`}
                accessibilityState={{ busy: busy === u.id }}
                onPress={() => login(u.id, () => loginAsDemo(u.id))}
                style={({ hovered, pressed }: any) => ({
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 14,
                  minHeight: 64,
                  paddingVertical: 10,
                  paddingHorizontal: 6,
                  borderBottomWidth: 1,
                  borderColor: c.line,
                  backgroundColor: hovered || pressed ? c.surfaceAlt : "transparent",
                })}
              >
                <WovenAvatar id={u.id} name={u.name} size={44} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ fontFamily: fonts.bodyBold, fontSize: 16.5, color: c.ink }}>{u.name}</Text>
                  {DEMO_HINT[u.name] ? <Text style={{ fontFamily: fonts.body, fontSize: 14.5, color: c.muted }}>{t(DEMO_HINT[u.name])}</Text> : null}
                </View>
                {busy === u.id ? <Text style={{ color: c.muted, fontFamily: fonts.bodyBold }}>…</Text> : null}
              </Pressable>
            ))}
          </View>
        </Animated.View>
      )}
    </View>
  );

  const status = <StatusBar style={c.scheme === "dark" ? "light" : "dark"} />;

  if (wide) {
    return (
      <View style={{ flex: 1, flexDirection: "row", backgroundColor: c.bg }}>
        {status}
        <Altiplano c={c} peopleHeight={300} mountainHeight={230} groundHeight={40} celestial={170} peopleInset={space(12)} style={{ flex: 1.3 }}>
          <View style={{ padding: space(14), paddingTop: space(12) }}>{brand(true)}</View>
        </Altiplano>
        <AguayoUnfold threads={c.threads} cell={4} vertical ground={c.bg} />
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1, padding: space(12), gap: space(10) }}>
          <View style={{ alignItems: "flex-end" }}>
            <Controls />
          </View>
          <View style={{ flex: 1, justifyContent: "center" }}>{panel}</View>
        </ScrollView>
      </View>
    );
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ flexGrow: 1 }}>
      {status}
      <Altiplano c={c} peopleHeight={150} mountainHeight={110} groundHeight={16} celestial={64} style={{ height: 480 }}>
        <SafeAreaView edges={["top"]} style={{ paddingHorizontal: space(5), paddingTop: space(4), gap: space(6) }}>
          <View style={{ alignItems: "flex-end" }}>
            <Controls />
          </View>
          {brand(false)}
        </SafeAreaView>
      </Altiplano>
      <AguayoUnfold threads={c.threads} cell={4} ground={c.bg} />
      <SafeAreaView edges={["bottom"]} style={{ flex: 1, paddingHorizontal: space(5), paddingTop: space(8), paddingBottom: space(12) }}>
        {panel}
      </SafeAreaView>
    </ScrollView>
  );
}
