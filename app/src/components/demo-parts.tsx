/**
 * The simulated screens of the demo. Each one mirrors a real screen of the app (the sentence that fills the creation
 * form, the PayPal window, the payment schedule, the assistant's steps, the translated chat, the payments table, the
 * personal calendar) with fixed data, so the story can be played without a server and without moving money.
 */
import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { Icon } from "@/components/icons";
import { PayPalWordmark } from "@/components/paypal";
import { SteppedBox } from "@/components/stepped";
import { WovenAvatar } from "@/components/woven-avatar";
import { money } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useScheme } from "@/lib/scheme";
import { hueOf, type SchedHue } from "@/lib/sched-colors";
import { fonts, space } from "@/lib/theme";

const MEMBERS = [
  { id: "demo-wara", name: "Wara", turn: 1 },
  { id: "demo-marisol", name: "Marisol", turn: 2 },
  { id: "demo-tomas", name: "Tomás", turn: 3 },
  { id: "demo-efrain", name: "Don Efraín", turn: 4 },
];

// ------------------------------------------------------------------------------------------------- the PayPal window

/** The small window PayPal opens over the app: the person approves there and never leaves Ayni. */
export function PayPalWindow({ amount, label, done }: { amount: number; label: string; done: boolean }) {
  const { c } = useScheme();
  const { t } = useI18n();
  return (
    <Animated.View entering={FadeInDown.duration(350)} style={{ position: "absolute", top: 70, right: 10, width: "84%", zIndex: 5, shadowColor: "#000", shadowOpacity: 0.35, shadowRadius: 18, shadowOffset: { width: 0, height: 8 } }}>
      <SteppedBox fill="#FFFFFF" stroke={c.ink} step={6} style={{ overflow: "hidden" }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: "#F1F1F1" }}>
          <Icon name="garantia" size={14} color="#444" />
          <Text style={{ flex: 1, fontFamily: fonts.body, fontSize: 12.5, color: "#444" }}>paypal.com</Text>
          <Text style={{ fontFamily: fonts.bodyBold, fontSize: 12, color: "#777" }}>×</Text>
        </View>
        <View style={{ alignItems: "center", gap: 8, padding: space(4) }}>
          <PayPalWordmark size={26} />
          <Text style={{ fontFamily: fonts.body, fontSize: 13.5, color: "#444", textAlign: "center" }}>{label}</Text>
          <Text style={{ fontFamily: fonts.displayHeavy, fontSize: 28, color: "#111", fontVariant: ["tabular-nums"] }}>{money(amount)}</Text>
          {done ? (
            <Animated.View entering={FadeIn.delay(1400).duration(300)} style={{ flexDirection: "row", gap: 8, alignItems: "center", backgroundColor: "#E4F4EC", paddingHorizontal: 12, paddingVertical: 8 }}>
              <Icon name="aprobar" size={16} color="#0B7A4B" />
              <Text style={{ fontFamily: fonts.bodyBold, fontSize: 13.5, color: "#0B7A4B" }}>{t("dWinDone")}</Text>
            </Animated.View>
          ) : (
            <View style={{ backgroundColor: "#FFC439", paddingHorizontal: 22, paddingVertical: 9 }}>
              <Text style={{ fontFamily: fonts.bodyBold, fontSize: 14.5, color: "#111" }}>{t("dWinApprove")}</Text>
            </View>
          )}
        </View>
      </SteppedBox>
    </Animated.View>
  );
}

// ------------------------------------------------------------------------------------------------- create with a sentence

/** "Create with a sentence": the sentence is typed, the form fills itself, the summary says what the pot will be. */
export function CreateMock() {
  const { c } = useScheme();
  const { t } = useI18n();
  const text = t("dCreateText");
  const [n, setN] = useState(0);
  useEffect(() => {
    setN(0);
    const timer = setInterval(() => setN((x) => (x >= text.length ? x : x + 2)), 45);
    return () => clearInterval(timer);
  }, [text]);
  const done = n >= text.length;
  const chip = (label: string, value: string) => (
    <View style={{ flexDirection: "row", gap: 6, backgroundColor: c.turquesa.fill + "1F", paddingHorizontal: 10, paddingVertical: 6 }}>
      <Text style={{ fontFamily: fonts.body, fontSize: 13, color: c.muted }}>{label}</Text>
      <Text style={{ fontFamily: fonts.bodyBold, fontSize: 13, color: c.ink }}>{value}</Text>
    </View>
  );
  return (
    <View style={{ gap: space(3) }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <View style={{ width: 28, height: 28, alignItems: "center", justifyContent: "center", backgroundColor: c.turquesa.fill }}>
          <Icon name="rayo" size={15} color={c.onAction} />
        </View>
        <Text style={{ fontFamily: fonts.display, fontSize: 16, color: c.ink }}>{t("drTitle")}</Text>
      </View>
      <View style={{ minHeight: 78, padding: space(3), borderWidth: 2, borderColor: c.line, backgroundColor: c.bg }}>
        <Text style={{ fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: c.ink }}>
          {text.slice(0, n)}
          {!done ? "▌" : ""}
        </Text>
      </View>
      {done ? (
        <Animated.View entering={FadeInDown.duration(350)} style={{ gap: space(3) }}>
          <Text style={{ fontFamily: fonts.bodyBold, fontSize: 14, color: c.turquesa.text }}>{t("dCreateFilled")}</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {chip(t("name"), "Pasanaku de la feria")}
            {chip(t("contribution"), "$15.00")}
            {chip(t("maxMembers"), "4")}
            {chip(t("frequency"), t("WEEKLY"))}
          </View>
          <SteppedBox fill={c.amarillo.fill + "2E"} stroke={c.amarillo.fill} step={5} style={{ padding: space(4), gap: 4 }}>
            <Text style={{ fontFamily: fonts.bodyBold, fontSize: 13.5, color: c.amarillo.text }}>{t("nwSummary")}</Text>
            <Text style={{ fontFamily: fonts.displayHeavy, fontSize: 30, color: c.ink, fontVariant: ["tabular-nums"] }}>{money(6000)}</Text>
            <Text style={{ fontFamily: fonts.body, fontSize: 13.5, color: c.muted }}>{t("nwPot")} · {t("nwRounds")}: 4</Text>
          </SteppedBox>
        </Animated.View>
      ) : null}
    </View>
  );
}

// ------------------------------------------------------------------------------------------------- the payment schedule

type Cell = "paid" | "pending" | "covered" | "upcoming";
const CELL_HUE: Record<Cell, SchedHue> = { paid: "verde", pending: "naranja", covered: "turquesa", upcoming: "muted" };

/** The payment schedule of the group: a row per member, a column per round; round 1 fills as the money arrives. */
export function MiniSchedule({ step }: { step: number }) {
  const { c } = useScheme();
  const { t } = useI18n();
  const state = (id: string): Cell => {
    if (id === "demo-efrain") return step >= 8 ? "covered" : "pending";
    if (id === "demo-tomas" && step < 5) return "pending";
    return step >= 5 ? "paid" : "pending";
  };
  const whole = (cents: number) => `$${Math.round(cents / 100)}`;
  const plate = (key: string, label: string, amount: string, hue: SchedHue, dashed = false, star = false) => {
    const h = hueOf(c, hue);
    return (
      <View key={key} style={{ flex: 1, minHeight: 40, backgroundColor: dashed ? h.fill + "33" : h.fill, borderWidth: dashed ? 1.5 : 0, borderStyle: "dashed", borderColor: h.fill, padding: 3, justifyContent: "center" }}>
        <View style={{ backgroundColor: c.surface, paddingHorizontal: 6, paddingVertical: 2, flexDirection: "row", alignItems: "center", gap: 4 }}>
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} style={{ fontFamily: fonts.bodyBold, fontSize: 9, letterSpacing: 0.2, color: h.text, textTransform: "uppercase" }}>{label}</Text>
            <Text numberOfLines={1} style={{ fontFamily: fonts.displayHeavy, fontSize: 13, color: c.ink, fontVariant: ["tabular-nums"] }}>{amount}</Text>
          </View>
          {star ? <Icon name="pozo" size={10} color={c.amarillo.text} /> : null}
        </View>
      </View>
    );
  };
  const word: Record<Cell, string> = { paid: t("calPaid"), pending: t("calPending"), covered: t("calCoveredShort"), upcoming: t("tlUpcoming") };
  return (
    <View style={{ gap: 4 }}>
      <View style={{ flexDirection: "row", gap: 4 }}>
        <View style={{ width: 84 }} />
        {[1, 2, 3, 4].map((n) => (
          <Text key={n} style={{ flex: 1, fontFamily: fonts.bodyBold, fontSize: 11.5, color: n === 1 ? c.fucsia.text : c.muted, textAlign: "center" }}>
            {t("round")} {n}
          </Text>
        ))}
      </View>
      <View style={{ flexDirection: "row", gap: 4, alignItems: "stretch" }}>
        <View style={{ width: 84, flexDirection: "row", alignItems: "center", gap: 6 }}>
          <View style={{ width: 22, height: 22, backgroundColor: c.amarillo.fill, alignItems: "center", justifyContent: "center" }}>
            <Icon name="pozo" size={13} color="#1A1A3A" />
          </View>
          <Text style={{ fontFamily: fonts.bodyBold, fontSize: 12, color: c.ink }}>{t("pot")}</Text>
        </View>
        {MEMBERS.map((m) => plate(`pot-${m.id}`, `→ ${m.name.replace("Don ", "").slice(0, 5)}`, whole(6000), "amarillo", m.turn !== 1))}
      </View>
      {MEMBERS.map((m) => (
        <View key={m.id} style={{ flexDirection: "row", gap: 4, alignItems: "stretch" }}>
          <View style={{ width: 84, flexDirection: "row", alignItems: "center", gap: 6 }}>
            <WovenAvatar id={m.id} name={m.name} size={22} />
            <Text numberOfLines={1} style={{ flex: 1, fontFamily: fonts.bodyBold, fontSize: 12, color: c.ink }}>{m.name.replace("Don ", "")}</Text>
          </View>
          {plate(`r1-${m.id}`, word[state(m.id)], whole(1500), CELL_HUE[state(m.id)], false, false)}
          {[2, 3, 4].map((n) => (
            <View key={n} style={{ flex: 1 }}>
              {plate(`r${n}-${m.id}`, word.upcoming, whole(1500), "muted", true)}
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

// ------------------------------------------------------------------------------------------------- the assistant's steps

/** The assistant reads the group and recommends the gentlest step; the organizer taps it and the reminder goes out. */
export function AssistantMock({ step }: { step: number }) {
  const { c } = useScheme();
  const { t } = useI18n();
  const tone = c.naranja;
  return (
    <SteppedBox fill={c.surface} stroke={c.turquesa.fill} step={5} style={{ padding: space(4), gap: space(3) }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <View style={{ width: 26, height: 26, alignItems: "center", justifyContent: "center", backgroundColor: c.turquesa.fill }}>
          <Icon name="rayo" size={14} color={c.onAction} />
        </View>
        <Text style={{ flex: 1, fontFamily: fonts.display, fontSize: 15.5, color: c.ink }}>{t("asTitle")}</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: tone.fill + "22", paddingHorizontal: 8, paddingVertical: 3 }}>
          <View style={{ width: 7, height: 7, transform: [{ rotate: "45deg" }], backgroundColor: tone.text }} />
          <Text style={{ fontFamily: fonts.bodyBold, fontSize: 12.5, color: tone.text }}>{t("asHealth_watch")}</Text>
        </View>
      </View>
      <Text style={{ fontFamily: fonts.body, fontSize: 14.5, lineHeight: 21, color: c.ink }}>{t("dAsHead")}</Text>
      <View style={{ gap: 6, padding: space(3), backgroundColor: c.surfaceAlt, borderLeftWidth: 4, borderColor: c.turquesa.fill }}>
        <Text style={{ fontFamily: fonts.bodyBold, fontSize: 14, color: c.ink }}>1  {t("dAsStep")}</Text>
        <Text style={{ fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: c.muted }}>
          <Text style={{ fontFamily: fonts.bodyBold }}>{t("asWhy")}: </Text>
          {t("dAsWhy")}
        </Text>
        <View style={{ alignSelf: "flex-start", backgroundColor: c.fucsia.fill, paddingHorizontal: 14, paddingVertical: 7, opacity: step >= 7 ? 1 : 0.6 }}>
          <Text style={{ fontFamily: fonts.bodyBold, fontSize: 13.5, color: c.onAction }}>{t("asDo_nudge")}</Text>
        </View>
      </View>
      <Animated.View entering={FadeInDown.delay(2200).duration(350)} style={{ gap: 4 }}>
        <Text style={{ fontFamily: fonts.bodyBold, fontSize: 13.5, color: c.verde.text }}>{t("asDone_nudge")}</Text>
        <Text style={{ fontFamily: fonts.body, fontSize: 13.5, lineHeight: 19, color: c.ink, fontStyle: "italic" }}>“{t("dAsReminder")}”</Text>
      </Animated.View>
      <Text style={{ fontFamily: fonts.body, fontSize: 12.5, color: c.muted }}>{t("asYouDecide")}</Text>
    </SteppedBox>
  );
}

// ------------------------------------------------------------------------------------------------- the translated chat

/** A message written in another language, read in the language of the app, with the original one tap away. */
export function ChatMock() {
  const { c } = useScheme();
  const { t } = useI18n();
  return (
    <View style={{ gap: space(3) }}>
      <Text style={{ fontFamily: fonts.display, fontSize: 18, color: c.ink }}>{t("chat")}</Text>
      <View style={{ gap: 2, maxWidth: "88%" }}>
        <Text style={{ fontFamily: fonts.bodyBold, fontSize: 12.5, color: c.muted }}>Tomás · 10:42</Text>
        <View style={{ backgroundColor: c.surfaceAlt, padding: space(3) }}>
          <Text style={{ fontFamily: fonts.body, fontSize: 15, lineHeight: 21, color: c.ink }}>{t("dChatTrans")}</Text>
        </View>
        <Text style={{ fontFamily: fonts.body, fontSize: 12.5, color: c.muted }}>{t("chTranslated")} · {t("chOriginal")}</Text>
      </View>
      <Animated.View entering={FadeInDown.delay(1500).duration(350)} style={{ gap: 2, maxWidth: "88%", paddingLeft: space(3), borderLeftWidth: 2, borderColor: c.line }}>
        <Text style={{ fontFamily: fonts.bodyBold, fontSize: 12.5, color: c.muted }}>{t("chOriginal")}</Text>
        <Text style={{ fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: c.muted, fontStyle: "italic" }}>{t("dChatOrig")}</Text>
      </Animated.View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: space(3), backgroundColor: c.surface, borderWidth: 1, borderColor: c.line }}>
        <View style={{ width: 34, height: 18, backgroundColor: c.fucsia.fill, justifyContent: "center", alignItems: "flex-end", paddingRight: 2 }}>
          <View style={{ width: 14, height: 14, backgroundColor: "#fff" }} />
        </View>
        <Text style={{ flex: 1, fontFamily: fonts.bodyBold, fontSize: 13.5, color: c.ink }}>{t("chTranslate")}</Text>
      </View>
    </View>
  );
}

// ------------------------------------------------------------------------------------------------- payments table

/** The payments table: every PayPal movement with its reference, as the group's record. */
export function PaymentsMock() {
  const { c } = useScheme();
  const { t } = useI18n();
  const rows = [
    { what: t("lg_POT"), who: "Wara", status: t("lgStDone"), ref: "BATCH9", amount: "$60.00", tone: c.amarillo },
    { what: t("lg_CONTRIBUTION"), who: "Marisol", status: t("lgStDone"), ref: "7D20B1", amount: "$15.00", tone: c.verde },
    { what: t("lg_CONTRIBUTION"), who: "Tomás", status: t("lgStDone"), ref: "C44E09", amount: "$15.00", tone: c.verde },
    { what: t("lg_GUARANTEE_COVER"), who: "Don Efraín", status: t("lgStDone"), ref: "—", amount: "$15.00", tone: c.turquesa },
  ];
  const col = (w: number | undefined, node: string, bold = false, right = false, color?: string) => (
    <Text numberOfLines={1} style={{ width: w, flex: w ? undefined : 1, fontFamily: bold ? fonts.bodyBold : fonts.body, fontSize: 12.5, color: color ?? c.ink, textAlign: right ? "right" : "left" }}>{node}</Text>
  );
  return (
    <SteppedBox fill={c.surface} stroke={c.line} step={5} style={{ overflow: "hidden" }}>
      <View style={{ flexDirection: "row", gap: 8, padding: space(2.5), backgroundColor: c.surfaceAlt }}>
        {col(undefined, t("lgColConcept").toUpperCase(), true, false, c.muted)}
        {col(70, t("lgColMember").toUpperCase(), true, false, c.muted)}
        {col(62, t("lgColRef").split(" ")[0].toUpperCase(), true, false, c.muted)}
        {col(58, t("lgColAmount").toUpperCase(), true, true, c.muted)}
      </View>
      {rows.map((r, i) => (
        <Animated.View key={i} entering={FadeInDown.delay(i * 250).duration(300)} style={{ flexDirection: "row", gap: 8, padding: space(2.5), borderTopWidth: 1, borderColor: c.line, alignItems: "center" }}>
          <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 6 }}>
            <View style={{ width: 8, height: 8, transform: [{ rotate: "45deg" }], backgroundColor: r.tone.fill }} />
            <Text numberOfLines={1} style={{ flex: 1, fontFamily: fonts.bodyBold, fontSize: 12.5, color: c.ink }}>{r.what}</Text>
          </View>
          {col(70, r.who)}
          {col(62, r.ref, false, false, c.muted)}
          {col(58, r.amount, true, true)}
        </Animated.View>
      ))}
    </SteppedBox>
  );
}

// ------------------------------------------------------------------------------------------------- the personal calendar

/** "My calendar": a month with what the person pays and receives each day, and what they will have on a chosen date. */
export function CalendarMock() {
  const { c } = useScheme();
  const { t, lang } = useI18n();
  const locale = lang === "en" ? "en-US" : "es-BO";
  // fixed days of a fixed month: what Wara contributes (−) and receives (+) in the four rounds
  const marks: Record<number, { sign: "−" | "+"; hue: SchedHue; cents: number }[]> = {
    3: [{ sign: "−", hue: "verde", cents: 1500 }],
    4: [{ sign: "+", hue: "amarillo", cents: 4500 }],
    11: [{ sign: "−", hue: "naranja", cents: 1500 }],
    18: [{ sign: "−", hue: "naranja", cents: 1500 }],
    25: [{ sign: "−", hue: "naranja", cents: 1500 }, { sign: "+", hue: "turquesa", cents: 1500 }],
  };
  const first = new Date(2026, 10, 1);
  const lead = (first.getDay() + 6) % 7;
  const cells = Array.from({ length: 35 }, (_, i) => i - lead + 1);
  const dayNames = Array.from({ length: 7 }, (_, i) => new Date(2026, 10, 2 + i).toLocaleDateString(locale, { weekday: "narrow" }));
  return (
    <View style={{ gap: space(3) }}>
      <Text style={{ fontFamily: fonts.display, fontSize: 18, color: c.ink }}>{t("pcTitle")}</Text>
      <Text style={{ fontFamily: fonts.bodyBold, fontSize: 14, color: c.ink }}>{first.toLocaleDateString(locale, { month: "long", year: "numeric" }).replace(/^./, (x) => x.toUpperCase()).replace(" De ", " de ")}</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
        {dayNames.map((d, i) => (
          <Text key={i} style={{ width: `${100 / 7}%`, textAlign: "center", fontFamily: fonts.bodyBold, fontSize: 11.5, color: c.muted, paddingBottom: 4 }}>{d.toUpperCase()}</Text>
        ))}
        {cells.map((d, i) => {
          const m = d >= 1 && d <= 30 ? marks[d] : undefined;
          const sel = d === 25;
          return (
            <View key={i} style={{ width: `${100 / 7}%`, height: 40, alignItems: "center", justifyContent: "center", borderWidth: sel ? 2 : 0, borderColor: c.fucsia.fill }}>
              <Text style={{ fontFamily: sel ? fonts.bodyBold : fonts.body, fontSize: 12.5, color: d < 1 || d > 30 ? c.line : c.ink }}>{d >= 1 && d <= 30 ? d : ""}</Text>
              <View style={{ flexDirection: "row", gap: 2, height: 6 }}>
                {m?.map((x, k) => <View key={k} style={{ width: 6, height: 6, backgroundColor: hueOf(c, x.hue).fill }} />)}
              </View>
            </View>
          );
        })}
      </View>
      <Animated.View entering={FadeInDown.delay(900).duration(350)}>
        <SteppedBox fill={c.amarillo.fill + "2E"} stroke={c.amarillo.fill} step={5} style={{ padding: space(3), gap: 3 }}>
          <Text style={{ fontFamily: fonts.bodyBold, fontSize: 13.5, color: c.ink }}>{t("pcUntil")} · {new Date(2026, 10, 25).toLocaleDateString(locale, { day: "numeric", month: "long" })}</Text>
          <Text style={{ fontFamily: fonts.body, fontSize: 13.5, color: c.muted }}>{t("pcOwe")}: −$45.00 · {t("pcWill")}: +$15.00</Text>
          <Text style={{ fontFamily: fonts.body, fontSize: 13.5, color: c.muted }}>{t("pcPaid")}: −$15.00 · {t("pcGot")}: +$45.00</Text>
          <Text style={{ fontFamily: fonts.displayHeavy, fontSize: 18, color: c.ink }}>{t("pcAhead")}: −$30.00</Text>
        </SteppedBox>
      </Animated.View>
    </View>
  );
}

