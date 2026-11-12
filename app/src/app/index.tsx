import { useEffect, useState } from "react";
import { Platform, Pressable, ScrollView, Share, Text, useWindowDimensions, View } from "react-native";
import { Redirect, router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { Loading } from "@/components/ui";
import { AguayoBand, AguayoUnfold } from "@/components/aguayo";
import { Altiplano } from "@/components/altiplano";
import { Icon } from "@/components/icons";
import { Emblem } from "@/components/brand";
import { Controls } from "@/components/controls";
import { StepButton, SteppedBox } from "@/components/stepped";
import { WovenAvatar } from "@/components/woven-avatar";
import { PayPalChip, PayPalWordmark } from "@/components/paypal";
import { useAuth } from "@/lib/auth";
import { useI18n, type Key } from "@/lib/i18n";
import { useLayout } from "@/lib/layout";
import { useScheme } from "@/lib/scheme";
import { api, ApiError } from "@/lib/api";
import { fonts, space } from "@/lib/theme";

type DemoUser = { id: string; name: string; email: string };

/** What each seeded demo member is good for, so a judge knows whom to pick. */
const DEMO_HINT: Record<string, Key> = {
  "Doña Rosa": "hintRosa",
  Marisol: "hintMarisol",
  "Juan Carlos": "hintJuan",
  "Don Efraín": "hintEfrain",
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
  const [error, setError] = useState<Key | null>(null);
  const [attempt, setAttempt] = useState(0);
  const { height } = useWindowDimensions();
  const [showSandbox, setShowSandbox] = useState(false);
  const [sandboxPassword, setSandboxPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    api<DemoUser[]>("/auth/demo/users")
      .then((u) => {
        setDemoUsers(u);
        setError(null);
      })
      .catch((e) => {
        setDemoUsers([]);
        // a 404 only means demo login is switched off; anything else is a connection problem
        if (!(e instanceof ApiError)) setError("serverDown");
      });
  }, [attempt]);

  // the shared password of the sandbox accounts, when whoever runs this set one (only while demo login is on)
  useEffect(() => {
    api<{ password: string | null }>("/auth/demo/sandbox")
      .then((r) => setSandboxPassword(r.password))
      .catch(() => setSandboxPassword(null));
  }, [attempt]);
  const copy = async (key: string, text: string) => {
    try {
      if (Platform.OS === "web") await navigator.clipboard.writeText(text);
      else await Share.share({ message: text });
      setCopied(key);
      setTimeout(() => setCopied((k) => (k === key ? null : k)), 1800);
    } catch {
      /* the text is on screen and selectable */
    }
  };

  if (loading) return <Loading />;
  if (me) return <Redirect href="/groups" />;

  const login = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof ApiError ? "loginFailed" : "serverDown");
    } finally {
      setBusy(null);
    }
  };

  // On a computer the left side is the sky with the people at the bottom: what goes on top is sized from the height of
  // the window, so the words always end above the people instead of running over them.
  const peopleH = Math.max(170, Math.min(290, Math.round(height * 0.3)));
  const word = height < 720 ? 96 : height < 880 ? 128 : 160;
  const brand = (big: boolean) => (
    <View style={{ gap: big ? Math.round(word / 8) : 10 }}>
      <Emblem size={big ? Math.round(word * 0.5) : 64} />
      <Text
        accessibilityRole="header"
        style={{ fontFamily: fonts.displayHeavy, fontSize: big ? word : 92, lineHeight: big ? word + 4 : 98, color: c.ink, letterSpacing: big ? -word / 21 : -4, marginLeft: big ? -word / 21 : -4 }}
      >
        ayni
      </Text>
      <View style={{ width: big ? word * 1.6 : 150 }}>
        <AguayoBand motif="zigzag" colors={[c.threads[0], c.threads[2]]} cell={big ? 4 : 3} />
      </View>
      <Text style={{ fontFamily: fonts.display, fontSize: big ? (height < 720 ? 24 : 30) : 21, lineHeight: big ? (height < 720 ? 30 : 38) : 28, color: c.ink, maxWidth: big ? 520 : 320 }}>{t("ayniMotto").replace(", ", ",\n")}</Text>
      {big && height < 700 ? null : <Text style={{ fontFamily: fonts.body, fontSize: big ? 17 : 15, lineHeight: big ? 25 : 22, color: c.ink, maxWidth: 360 }}>{t("ayniWord")}</Text>}
    </View>
  );

  const panel = (
    <View style={{ gap: space(5), width: "100%", maxWidth: 440, alignSelf: "center" }}>
      <Animated.View entering={FadeInDown.duration(380)} style={{ gap: space(3) }}>
        <Text style={{ fontFamily: fonts.displayHeavy, fontSize: wide ? 38 : 28, lineHeight: wide ? 44 : 34, color: c.ink, letterSpacing: -0.6 }}>{t("welcomeTitle")}</Text>
        <Text style={{ fontFamily: fonts.body, fontSize: 17, lineHeight: 26, color: c.muted }}>{t("howItWorks")}</Text>
      </Animated.View>
      <Animated.View entering={FadeInDown.delay(120).duration(380)} style={{ gap: 10 }}>
        {[
          { icon: "paypal" as const, hue: c.amarillo, title: t("lgFeat1"), body: t("lgFeat1b") },
          { icon: "rayo" as const, hue: c.turquesa, title: t("lgFeat2"), body: t("lgFeat2b") },
          { icon: "garantia" as const, hue: c.verde, title: t("lgFeat3"), body: t("lgFeat3b") },
        ].map((f) => (
          <View key={f.title} style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <View style={{ width: 38, height: 38, alignItems: "center", justifyContent: "center", backgroundColor: f.hue.fill + "33" }}>
              <Icon name={f.icon} size={20} color={f.hue.text} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: fonts.bodyBold, fontSize: 15.5, color: c.ink }}>{f.title}</Text>
              <Text style={{ fontFamily: fonts.body, fontSize: 14, lineHeight: 19, color: c.muted }}>{f.body}</Text>
            </View>
          </View>
        ))}
      </Animated.View>
      <View style={{ gap: space(3) }}>
        <StepButton
          title={t("loginWith")}
          accessibilityLabel={t("loginPaypal")}
          fill={c.paypal}
          ink={c.paypalInk}
          loading={busy === "pp"}
          right={<PayPalWordmark size={22} />}
          onPress={() => login("pp", loginWithPayPal)}
        />
        <StepButton
          title={t("demoSeeIt")}
          fill={c.surface}
          stroke={c.line}
          ink={c.ink}
          left={<Icon name="rayo" size={20} color={c.ink} />}
          onPress={() => router.push("/demo" as any)}
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
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <PayPalChip />
        <Text style={{ flex: 1, minWidth: 180, fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: c.muted }}>{t("ppFlow")}</Text>
      </View>
      {error && (
        <View accessibilityRole="alert" style={{ gap: space(2), borderLeftWidth: 4, borderColor: c.rojo.fill, backgroundColor: c.surface, padding: space(4) }}>
          <Text style={{ fontFamily: fonts.bodyBold, fontSize: 15.5, lineHeight: 22, color: c.rojo.text }}>{t(error)}</Text>
          <Pressable accessibilityRole="button" onPress={() => { setError(null); setAttempt((n) => n + 1); }} style={{ minHeight: 44, justifyContent: "center" }}>
            <Text style={{ fontFamily: fonts.bodyBold, fontSize: 15.5, color: c.ink, textDecorationLine: "underline" }}>{t("retry")}</Text>
          </Pressable>
        </View>
      )}
      {demoUsers.length > 0 && (
        <View style={{ gap: space(3) }}>
          <Pressable accessibilityRole="button" accessibilityState={{ expanded: showSandbox }} onPress={() => setShowSandbox((v) => !v)} style={{ minHeight: 48, flexDirection: "row", alignItems: "center", gap: 10 }}>
            <PayPalChip />
            <Text style={{ flex: 1, fontFamily: fonts.bodyBold, fontSize: 15, color: c.ink, textDecorationLine: "underline" }}>{t("sbxButton")}</Text>
            <Text style={{ fontFamily: fonts.bodyBold, fontSize: 18, color: c.muted }}>{showSandbox ? "−" : "+"}</Text>
          </Pressable>
          {showSandbox && (
            <Animated.View entering={FadeIn.duration(260)}>
              <SteppedBox fill={c.surface} stroke={c.paypal} step={5} style={{ padding: space(4), gap: space(3) }}>
                <Text style={{ fontFamily: fonts.display, fontSize: 17, color: c.ink }}>{t("sbxTitle")}</Text>
                <Text style={{ fontFamily: fonts.body, fontSize: 14.5, lineHeight: 21, color: c.muted }}>{t("sbxHow")}</Text>
                <View style={{ gap: 2, padding: space(3), backgroundColor: c.surfaceAlt }}>
                  <Text style={{ fontFamily: fonts.bodyBold, fontSize: 13, color: c.muted }}>{t("sbxPassword")}</Text>
                  {sandboxPassword ? (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                      <Text selectable style={{ flex: 1, fontFamily: fonts.displayHeavy, fontSize: 18, color: c.ink }}>{sandboxPassword}</Text>
                      <Pressable accessibilityRole="button" onPress={() => copy("pw", sandboxPassword)} style={{ minHeight: 36, paddingHorizontal: 10, justifyContent: "center", borderWidth: 2, borderColor: c.line }}>
                        <Text style={{ fontFamily: fonts.bodyBold, fontSize: 13.5, color: c.ink }}>{copied === "pw" ? t("sbxCopied") : t("sbxCopy")}</Text>
                      </Pressable>
                    </View>
                  ) : (
                    <Text style={{ fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: c.muted }}>{t("sbxNoPassword")}</Text>
                  )}
                </View>
                <View style={{ borderTopWidth: 1, borderColor: c.line }}>
                  {demoUsers.map((u) => (
                    <View key={u.id} style={{ flexDirection: "row", alignItems: "center", gap: 10, minHeight: 56, paddingVertical: 8, borderBottomWidth: 1, borderColor: c.line }}>
                      <WovenAvatar id={u.id} name={u.name} size={36} />
                      <View style={{ flex: 1, gap: 1 }}>
                        <Text style={{ fontFamily: fonts.bodyBold, fontSize: 15, color: c.ink }}>{u.name}</Text>
                        <Text selectable numberOfLines={1} style={{ fontFamily: fonts.body, fontSize: 13.5, color: c.muted }}>{u.email}</Text>
                      </View>
                      <Pressable accessibilityRole="button" accessibilityLabel={`${t("sbxCopy")} ${u.email}`} onPress={() => copy(u.id, u.email)} style={{ minHeight: 36, paddingHorizontal: 10, justifyContent: "center", borderWidth: 2, borderColor: c.line }}>
                        <Text style={{ fontFamily: fonts.bodyBold, fontSize: 13.5, color: c.ink }}>{copied === u.id ? t("sbxCopied") : t("sbxCopy")}</Text>
                      </Pressable>
                    </View>
                  ))}
                </View>
                <StepButton title={t("loginWith")} accessibilityLabel={t("loginPaypal")} fill={c.paypal} ink={c.paypalInk} loading={busy === "pp"} right={<PayPalWordmark size={20} />} onPress={() => login("pp", loginWithPayPal)} />
              </SteppedBox>
            </Animated.View>
          )}
        </View>
      )}
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
        <Altiplano c={c} peopleHeight={peopleH} mountainHeight={Math.round(peopleH * 0.78)} groundHeight={36} celestial={Math.round(peopleH * 0.58)} peopleInset={space(12)} style={{ flex: 1.3 }}>
          <View style={{ padding: space(14), paddingTop: space(9) }}>{brand(true)}</View>
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
      <Altiplano c={c} peopleHeight={200} mountainHeight={120} groundHeight={16} celestial={64} style={{ height: 620 }}>
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
