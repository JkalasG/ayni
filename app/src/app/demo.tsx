import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AccessibilityInfo, Pressable, ScrollView, Text, View } from "react-native";
import { router, Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { AguayoBand } from "@/components/aguayo";
import { Icon } from "@/components/icons";
import { Controls } from "@/components/controls";
import { EventRow, PayPalChip, type PPEvent } from "@/components/paypal";
import { SteppedBox, StepButton } from "@/components/stepped";
import { Tejido } from "@/components/tejido";
import { WovenAvatar, WovenEmblem } from "@/components/woven-avatar";
import { Vasija } from "@/components/vasija";
import { money } from "@/lib/api";
import { useI18n, type Key } from "@/lib/i18n";
import { useLayout } from "@/lib/layout";
import { LEVELS } from "@/lib/levels";
import { useScheme } from "@/lib/scheme";
import { fonts, space, type ContributionState } from "@/lib/theme";

/** One beat of the story lasts this long. Nine beats, about 40 seconds. */
const BEAT_MS = 4500;
const LAST = 8;

const MEMBERS = [
  { id: "m-wara", turn: 1, user: { id: "demo-wara", name: "Wara" } },
  { id: "m-mari", turn: 2, user: { id: "demo-marisol", name: "Marisol" } },
  { id: "m-tomas", turn: 3, user: { id: "demo-tomas", name: "Tomás" } },
  { id: "m-efra", turn: 4, user: { id: "demo-efrain", name: "Don Efraín" } },
];

/** What the group sees in each beat (the guarantee is masked as "paid" for everyone but Marisol). */
function roundsAt(step: number, forOrganizer: boolean) {
  const efra: ContributionState = step < 6 ? "PENDING" : forOrganizer ? "COVERED" : "PAID";
  const paid = (n: number): ContributionState => (step >= n ? "PAID" : "PENDING");
  const status = step >= 7 ? "PAID_OUT" : step >= 4 ? "COLLECTING" : "UPCOMING";
  return [
    {
      number: 1,
      status,
      recipientId: "m-wara",
      contributions: [
        { membershipId: "m-mari", status: paid(4) },
        { membershipId: "m-tomas", status: paid(4) },
        { membershipId: "m-wara", status: paid(4) },
        { membershipId: "m-efra", status: efra },
      ],
    },
    ...[2, 3, 4].map((n) => ({ number: n, status: "UPCOMING", recipientId: MEMBERS[n - 1].id, contributions: [] as { membershipId: string; status: ContributionState }[] })),
  ];
}

function Panel({ title, children, sim = true }: { title: string; children: ReactNode; sim?: boolean }) {
  const { c } = useScheme();
  const { t } = useI18n();
  return (
    <View style={{ flex: 1, minWidth: 0, gap: space(3) }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <Text accessibilityRole="header" style={{ fontFamily: fonts.display, fontSize: 15, color: c.ink, flexShrink: 1 }}>
          {title}
        </Text>
        {sim && (
          <View style={{ borderWidth: 1.5, borderColor: c.muted, paddingHorizontal: 8, paddingVertical: 2 }}>
            <Text style={{ fontFamily: fonts.bodyBold, fontSize: 12, color: c.muted }}>{t("demoSim")}</Text>
          </View>
        )}
      </View>
      {children}
    </View>
  );
}

function Note({ icon, text, tone }: { icon: "aprobar" | "garantia" | "pagar" | "rechazar" | "pozo" | "lugar"; text: string; tone: "verde" | "turquesa" | "naranja" | "rojo" | "amarillo" }) {
  const { c } = useScheme();
  return (
    <View style={{ flexDirection: "row", gap: 10, alignItems: "flex-start", backgroundColor: c[tone].fill + "1F", padding: space(3) }}>
      <Icon name={icon} size={18} color={c[tone].text} />
      <Text style={{ flex: 1, fontFamily: fonts.bodyBold, fontSize: 14.5, lineHeight: 20, color: c[tone].text }}>{text}</Text>
    </View>
  );
}

function PhoneScreen({ step }: { step: number }) {
  const { c } = useScheme();
  const { t, lang } = useI18n();
  const [fu, , am, ve, tu] = c.threads;
  const body = (() => {
    if (step < 0)
      return <Text style={{ fontFamily: fonts.body, fontSize: 16, lineHeight: 23, color: c.muted }}>{t("demoWait")}</Text>;
    if (step === 0)
      return (
        <View style={{ gap: space(3) }}>
          <Text style={{ fontFamily: fonts.display, fontSize: 18, color: c.ink }}>{t("dPassport")}</Text>
          <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
            <WovenAvatar id="demo-wara" name="Wara" size={56} />
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={{ fontFamily: fonts.displayHeavy, fontSize: 22, color: c.ink }}>Wara</Text>
              <Text style={{ fontFamily: fonts.bodyBold, fontSize: 14, color: c.turquesa.text }}>{t("dVerified")}</Text>
            </View>
          </View>
          <View style={{ flexDirection: "row", gap: 16 }}>
            <View style={{ gap: 2 }}>
              <Text style={{ fontFamily: fonts.displayHeavy, fontSize: 30, color: c.verde.text }}>2</Text>
              <Text style={{ fontFamily: fonts.body, fontSize: 13.5, color: c.muted, maxWidth: 110 }}>{t("dDoneLabel")}</Text>
            </View>
            <View style={{ gap: 2 }}>
              <Text style={{ fontFamily: fonts.displayHeavy, fontSize: 30, color: c.verde.text }}>100%</Text>
              <Text style={{ fontFamily: fonts.body, fontSize: 13.5, color: c.muted, maxWidth: 110 }}>{t("dOnTimeLabel")}</Text>
            </View>
          </View>
          <Note icon="rechazar" tone="naranja" text={t("dNoBank")} />
        </View>
      );
    if (step <= 2)
      return (
        <View style={{ gap: space(3) }}>
          <Text style={{ fontFamily: fonts.display, fontSize: 18, color: c.ink }}>{t("dReqSent")}</Text>
          <Note icon="pagar" tone="amarillo" text={t("dDeposit")} />
          <Text style={{ fontFamily: fonts.body, fontSize: 15, color: c.muted }}>{t("dReqWait")}</Text>
        </View>
      );
    if (step === 3)
      return (
        <Animated.View entering={FadeIn.duration(300)} style={{ gap: space(3) }}>
          <Note icon="aprobar" tone="verde" text={t("dJoined")} />
          <Text style={{ fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: c.muted }}>{t("dJoinedHint")}</Text>
        </Animated.View>
      );
    if (step <= 6)
      return (
        <View style={{ gap: space(3) }}>
          <Text style={{ fontFamily: fonts.body, fontSize: 14, color: c.muted }}>{t("dRoundOne")}</Text>
          <Text style={{ fontFamily: fonts.displayHeavy, fontSize: 40, color: c.amarillo.text, fontVariant: ["tabular-nums"] }}>{money(6000)}</Text>
          <Tejido rounds={roundsAt(step, false)} members={MEMBERS} me="m-wara" cell={34} />
          <Text style={{ fontFamily: fonts.body, fontSize: 13.5, color: c.muted }}>{t("dGroupSees")}</Text>
        </View>
      );
    if (step === 7)
      return (
        <Animated.View entering={FadeInDown.duration(400)} style={{ gap: space(3), alignItems: "center", paddingVertical: space(4) }}>
          <PayPalChip label="PayPal" mode="mock" />
          <Text style={{ fontFamily: fonts.displayHeavy, fontSize: 26, color: c.ink, textAlign: "center" }}>{t("dReceived")}</Text>
          <Text style={{ fontFamily: fonts.displayHeavy, fontSize: 52, color: c.amarillo.text, fontVariant: ["tabular-nums"] }}>{money(6000)}</Text>
          <Text style={{ fontFamily: fonts.body, fontSize: 15, color: c.muted, textAlign: "center" }}>{t("dArrived")}</Text>
          <View style={{ flexDirection: "row", gap: 6 }}>
            {[fu, am, ve, tu, fu].map((col, i) => (
              <View key={i} style={{ width: 12, height: 12, backgroundColor: col, transform: [{ rotate: "45deg" }] }} />
            ))}
          </View>
        </Animated.View>
      );
    return (
      <Animated.View entering={FadeInDown.duration(400)} style={{ gap: space(3), alignItems: "center", paddingVertical: space(3) }}>
        <Text style={{ fontFamily: fonts.bodyBold, fontSize: 14, color: c.fucsia.text }}>{t("dLevelUp")}</Text>
        <WovenEmblem motif={LEVELS[2].motif} size={96} colors={c.threads as unknown as string[]} lockedColor={c.line} />
        <Text style={{ fontFamily: fonts.displayHeavy, fontSize: 30, color: c.ink }}>{t(LEVELS[2].key)}</Text>
        <Text style={{ fontFamily: fonts.body, fontSize: 14.5, color: c.muted }}>{t("dLevelFrom")}</Text>
      </Animated.View>
    );
  })();
  void lang;
  return (
    <SteppedBox fill={c.surface} stroke={c.ink} step={8} style={{ padding: space(5), paddingTop: space(6), minHeight: 440, gap: space(3) }}>
      <View style={{ alignSelf: "center", width: 56, height: 5, backgroundColor: c.line }} />
      {body}
    </SteppedBox>
  );
}

function OrganizerScreen({ step }: { step: number }) {
  const { c } = useScheme();
  const { t } = useI18n();
  const settled = step >= 6 ? 4 : step >= 4 ? 3 : 0;
  return (
    <SteppedBox fill={c.surface} stroke={c.line} step={6} style={{ padding: space(5), minHeight: 440, gap: space(3) }}>
      {step < 1 && <Text style={{ fontFamily: fonts.body, fontSize: 15, color: c.muted }}>{t("dOrgIdle")}</Text>}
      {step >= 1 && step < 4 && (
        <Animated.View key={step} entering={FadeIn.duration(300)} style={{ gap: space(3) }}>
          <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
            <WovenAvatar id="demo-wara" name="Wara" size={40} />
            <Text style={{ flex: 1, fontFamily: fonts.bodyBold, fontSize: 16, color: c.ink }}>{t("dOrgReq")}</Text>
          </View>
          {step >= 2 && (
            <Animated.View entering={FadeInDown.duration(350)} style={{ borderLeftWidth: 4, borderColor: c.turquesa.fill, backgroundColor: c.turquesa.fill + "1A", padding: space(4), gap: 6 }}>
              <Text style={{ fontFamily: fonts.bodyBold, fontSize: 13.5, color: c.turquesa.text }}>{t("dAiTitle")}</Text>
              <Text style={{ fontFamily: fonts.display, fontSize: 18, color: c.ink }}>{t("dAiRec")}</Text>
              <Text style={{ fontFamily: fonts.body, fontSize: 14.5, lineHeight: 21, color: c.ink }}>{t("dAiReason")}</Text>
              <Text style={{ fontFamily: fonts.bodyBold, fontSize: 13.5, color: c.muted }}>{t("dFinal")}</Text>
            </Animated.View>
          )}
          {step === 3 && <Note icon="aprobar" tone="verde" text={t("dApproved")} />}
        </Animated.View>
      )}
      {step >= 4 && (
        <View style={{ gap: space(3) }}>
          <Text style={{ fontFamily: fonts.body, fontSize: 14, color: c.muted }}>{t("dRoundOne")}</Text>
          <Text style={{ fontFamily: fonts.displayHeavy, fontSize: 38, color: c.amarillo.text, fontVariant: ["tabular-nums"] }}>{money(6000)}</Text>
          <View style={{ alignItems: "center" }}>
            <Vasija
              slots={[0, 1, 2, 3].map((i) => ({ id: `s${i}`, state: i < settled ? (i === 3 ? "COVERED" : "PAID") : "EMPTY" }))}
              size={120}
              animateFirst
              ink={c.ink}
              colors={{ paid: [c.verde.fill, c.fucsia.fill, c.naranja.fill], covered: c.turquesa.fill, late: c.rojo.fill, accent: c.surface, empty: c.line }}
              label={`${t("vasijaLabel")}: ${settled} ${t("of")} 4 ${t("dPaidOf")}`}
            />
          </View>
          <Text style={{ fontFamily: fonts.body, fontSize: 14.5, color: c.muted }}>
            {settled} {t("of")} 4 {t("dPaidOf")}
          </Text>
          {step === 4 && <Note icon="lugar" tone="turquesa" text={t("dCrossBorder")} />}
          {step === 5 && <Note icon="rechazar" tone="rojo" text={t("dMissing")} />}
          {step >= 6 && <Note icon="garantia" tone="turquesa" text={t("dGuarUsed")} />}
          {step >= 7 && <Note icon="pozo" tone="amarillo" text={t("dPotSent")} />}
          {step >= 8 && <Note icon="aprobar" tone="verde" text={t("dRoundDone")} />}
        </View>
      )}
    </SteppedBox>
  );
}

function useEvents(t: (k: Key) => string): PPEvent[] {
  return useMemo(
    () => [
      { id: "e0", at: 0, step: 0, icon: "paypal", tone: "turquesa", title: t("dEvVerified"), detail: t("dEvVerifiedDetail") },
      { id: "e1", at: 0, step: 1, icon: "pagar", tone: "amarillo", title: t("dEvAuth"), detail: t("dEvAuthDetail"), amount: 1500, ref: "A91F3C" },
      { id: "e4a", at: 0, step: 4, icon: "pagar", tone: "verde", title: t("ppCaptured"), detail: "Marisol, " + t("round").toLowerCase() + " 1", amount: 1500, ref: "7D20B1" },
      { id: "e4b", at: 0, step: 4, icon: "pagar", tone: "verde", title: t("ppCaptured"), detail: t("dEvFromSpain"), amount: 1500, ref: "C44E09" },
      { id: "e4c", at: 0, step: 4, icon: "pagar", tone: "verde", title: t("ppCaptured"), detail: "Wara, " + t("round").toLowerCase() + " 1", amount: 1500, ref: "A91F3C" },
      { id: "e5", at: 0, step: 5, icon: "rechazar", tone: "rojo", title: t("dEvDeclined"), detail: t("dEvDeclinedDetail"), amount: 1500 },
      { id: "e6", at: 0, step: 6, icon: "garantia", tone: "turquesa", title: t("ppGuarantee"), detail: "Don Efraín, " + t("round").toLowerCase() + " 1", amount: 1500 },
      { id: "e7", at: 0, step: 7, icon: "pozo", tone: "amarillo", title: t("ppPayoutSent"), detail: "Wara, " + t("round").toLowerCase() + " 1", amount: 6000, ref: "BATCH9" },
    ].map((e, i) => ({ ...e, at: i })) as (PPEvent & { step: number })[],
    [t]
  );
}

export default function Demo() {
  const { c } = useScheme();
  const { t, lang } = useI18n();
  const { wide } = useLayout();
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const all = useEvents(t) as (PPEvent & { step: number })[];
  const events = all.filter((e) => e.step <= step).reverse();
  const locale = lang === "en" ? "en-US" : "es-BO";
  const [fu, na, am, ve, tu] = c.threads;

  useEffect(() => {
    if (!playing) return;
    timer.current = setTimeout(() => {
      if (step >= LAST) setPlaying(false);
      else setStep((s) => s + 1);
    }, step < 0 ? 300 : BEAT_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [playing, step]);

  const caption = step >= 0 ? t(`demoS${step}` as Key) : t("demoWait");
  useEffect(() => {
    if (step >= 0) AccessibilityInfo.announceForAccessibility?.(caption);
  }, [step]);

  const finished = step >= LAST && !playing;
  const play = () => {
    if (finished) setStep(-1);
    setPlaying((p) => (finished ? true : !p));
  };

  const feed = (
    <Panel title={t("demoFeed")}>
      <SteppedBox fill={c.surface} stroke={c.paypal} step={6} style={{ padding: space(4), gap: space(2), minHeight: 440 }}>
        <PayPalChip mode="mock" label={t("ppConnected")} />
        {events.length === 0 ? (
          <Text style={{ fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: c.muted, paddingTop: space(2) }}>{t("ppEmpty")}</Text>
        ) : (
          events.map((e, i) => (
            <Animated.View key={e.id} entering={FadeInDown.duration(350)}>
              <EventRow e={e} locale={locale} last={i === events.length - 1} />
            </Animated.View>
          ))
        )}
      </SteppedBox>
    </Panel>
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar style={c.scheme === "dark" ? "light" : "dark"} />
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + space(4), paddingBottom: space(12) }}>
        <View style={{ width: "100%", maxWidth: 1240, alignSelf: "center", paddingHorizontal: wide ? space(10) : space(4), gap: space(6) }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <Pressable accessibilityRole="button" accessibilityLabel={t("demoBack")} onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}>
              <SteppedBox fill={c.surface} stroke={c.line} step={3} style={{ height: 44, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Icon name="atras" size={16} color={c.ink} />
                <Text style={{ fontFamily: fonts.bodyBold, fontSize: 15, color: c.ink }}>{t("demoBack")}</Text>
              </SteppedBox>
            </Pressable>
            <Controls compact />
          </View>

          <View style={{ gap: space(3) }}>
            <Text accessibilityRole="header" style={{ fontFamily: fonts.displayHeavy, fontSize: wide ? 44 : 30, lineHeight: wide ? 52 : 38, color: c.ink, letterSpacing: -0.8 }}>
              {t("demoTitle")}
            </Text>
            <Text style={{ fontFamily: fonts.body, fontSize: 17, lineHeight: 25, color: c.muted, maxWidth: 640 }}>{t("demoSub")}</Text>
          </View>

          <View style={{ gap: space(4) }}>
            <View style={{ maxWidth: 420 }}>
              <StepButton
                title={playing ? t("demoPause") : finished ? t("demoAgain") : t("demoPlay")}
                fill={c.fucsia.fill}
                ink={c.onAction}
                left={<Icon name={playing ? "rechazar" : "rayo"} size={20} color={c.onAction} />}
                onPress={play}
              />
            </View>
            <View accessible accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: LAST + 1, now: step + 1 }} style={{ flexDirection: "row", gap: 4 }}>
              {Array.from({ length: LAST + 1 }).map((_, i) => (
                <View key={i} style={{ flex: 1, height: 10, backgroundColor: i <= step ? [fu, na, am, ve, tu][i % 5] : "transparent", borderWidth: i <= step ? 0 : 1.5, borderColor: c.line }} />
              ))}
            </View>
            <View style={{ minHeight: 64, borderLeftWidth: 4, borderColor: c.fucsia.fill, paddingLeft: space(4), justifyContent: "center" }}>
              {step >= 0 && (
                <Text style={{ fontFamily: fonts.bodyBold, fontSize: 13.5, color: c.fucsia.text }}>
                  {t("demoStepWord")} {step + 1} / {LAST + 1}
                </Text>
              )}
              <Text style={{ fontFamily: fonts.display, fontSize: wide ? 19 : 16, lineHeight: wide ? 27 : 23, color: c.ink }}>{caption}</Text>
            </View>
          </View>

          <View style={{ flexDirection: wide ? "row" : "column", gap: space(6), alignItems: "stretch" }}>
            <Panel title={t("demoPhone")}>
              <PhoneScreen step={step} />
            </Panel>
            <Panel title={t("demoOrg")}>
              <OrganizerScreen step={step} />
            </Panel>
            {feed}
          </View>
        </View>
      </ScrollView>
      <AguayoBand motif="franjas" colors={[fu, am]} cell={3} />
    </View>
  );
}
