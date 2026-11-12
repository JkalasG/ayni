/**
 * "Mi calendario": the person's money across ALL their pasanakus. What they contribute and what they receive each day,
 * what is already done and what is still to come, and how much they will have up to any date they pick.
 */
import { useCallback, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { Stack, router, useFocusEffect } from "expo-router";
import { Loading, Notice, P, Screen } from "@/components/ui";
import { Empty } from "@/components/empty";
import { Legend } from "@/components/legend";
import { PersonalCalendar } from "@/components/personal-calendar";
import { SteppedBox } from "@/components/stepped";
import { LedgerSummary } from "@/components/ledger";
import { useI18n, type Key } from "@/lib/i18n";
import { useLayout } from "@/lib/layout";
import { useScheme } from "@/lib/scheme";
import { api, money } from "@/lib/api";
import { byDay, dayKey, fromKey, signed, standing, upcoming, type CalData } from "@/lib/personal-calendar";
import { fonts, space } from "@/lib/theme";

export default function MyCalendar() {
  const { t, lang } = useI18n();
  const { c } = useScheme();
  const { wide } = useLayout();
  const [data, setData] = useState<CalData | null>(null);
  const [failed, setFailed] = useState(false);
  const [selected, setSelected] = useState(() => fromKey(dayKey(new Date())));
  const [group, setGroup] = useState("all");

  useFocusEffect(
    useCallback(() => {
      const load = () =>
        api<CalData>("/me/calendar")
          .then((d) => (setData(d), setFailed(false)))
          .catch(() => setFailed(true));
      load();
      const timer = setInterval(load, 30_000);
      return () => clearInterval(timer);
    }, [])
  );

  const now = useMemo(() => (data ? new Date(data.now) : new Date()), [data]);
  // one pasanaku or all of them: everything on the screen follows the choice
  const view = useMemo<CalData | null>(() => (data ? { ...data, events: group === "all" ? data.events : data.events.filter((e) => e.groupId === group) } : null), [data, group]);
  const pick = (d: Date) => setSelected((prev) => (dayKey(prev) === dayKey(d) ? prev : fromKey(dayKey(d))));
  const locale = lang === "en" ? "en-US" : "es-BO";

  const title = <Stack.Screen options={{ title: t("pcTitle") }} />;
  if (failed && !data) return <Screen>{title}<Notice tone="error">{t("loadFailed")}</Notice></Screen>;
  if (!data) return <>{title}<Loading /></>;
  if (data.events.length === 0) return <Screen>{title}<P muted>{t("pcHint")}</P><Empty icon="calendario" title={t("pcEmptyTitle")} body={t("pcEmptyBody")} action={{ label: t("explore"), onPress: () => router.navigate("/explore") }} /></Screen>;

  const shown = view!;
  const days = byDay(shown.events);
  const today = dayKey(now);
  const sel = dayKey(selected);
  const day = days.get(sel);
  const st = standing(shown.events, now, selected);
  const month = upcoming(shown.events, now, 30);
  const out30 = month.reduce((n, [, d]) => n + d.outCents, 0);
  const in30 = month.reduce((n, [, d]) => n + d.inCents, 0);
  const held = shown.events.filter((e) => e.kind === "return" && e.estimated).reduce((n, e) => n + e.amountCents, 0);
  const nextPayout = shown.events.filter((e) => e.kind === "receive" && e.status === "upcoming" && dayKey(e.at) >= today).sort((a, b) => (a.at < b.at ? -1 : 1))[0];

  const jump = (n: number) => pick(new Date(now.getFullYear(), now.getMonth(), now.getDate() + n));
  const rel = sel === today ? t("pcToday") : sel < today ? t("pcPast") : t("pcFuture");
  const sign = (cents: number) => (cents < 0 ? "−" : cents > 0 ? "+" : "") + money(Math.abs(cents));
  const row = (label: string, cents: number, tone?: "out" | "in", strong = false, hint?: string) => (
    <View style={{ paddingVertical: 7, borderBottomWidth: 1, borderColor: c.line }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
        <Text style={{ flex: 1, fontFamily: strong ? fonts.bodyBold : fonts.body, fontSize: 14.5, color: strong ? c.ink : c.muted }}>{label}</Text>
        <Text style={{ fontFamily: strong ? fonts.display : fonts.bodyBold, fontSize: strong ? 18 : 14.5, color: tone === "in" || (strong && cents > 0) ? c.verde.text : c.ink, fontVariant: ["tabular-nums"] }}>
          {tone === "out" ? "−" : tone === "in" ? "+" : ""}
          {tone ? money(Math.abs(cents)) : sign(cents)}
        </Text>
      </View>
      {hint ? <Text style={{ fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: c.muted, marginTop: 2 }}>{hint}</Text> : null}
    </View>
  );

  const labels = {
    pay: t("pcPay"),
    receive: t("pcReceive"),
    guarantee: t("pcGuarantee"),
    estimated: t("pcEstimated"),
    net: t("pcDayNet"),
    state: Object.fromEntries(["paid", "covered", "pending", "late", "unpaid", "received", "sending", "failed", "upcoming"].map((k) => [k, t(`pcSt_${k}` as Key)])),
    round: t("round"),
    held: t("pcHeldTip"),
    due: t("due"),
  };

  const side = (
    <View style={{ gap: space(4), width: wide ? 400 : "100%" }}>
      <SteppedBox fill={c.surface} stroke={c.fucsia.fill} step={5} style={{ padding: space(5), gap: space(2) }}>
        <Text style={{ fontFamily: fonts.bodyBold, fontSize: 13, color: c.fucsia.text, textTransform: "uppercase", letterSpacing: 0.4 }}>{rel}</Text>
        <Text accessibilityRole="header" style={{ fontFamily: fonts.display, fontSize: 20, lineHeight: 26, color: c.ink }}>
          {selected.toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long", year: "numeric" }).replace(/^./, (x) => x.toUpperCase())}
        </Text>
        {day ? (
          <>
            {row(t("pcDayOut"), day.outCents, "out")}
            {row(t("pcDayIn"), day.inCents, "in")}
            {row(t("pcDayNet"), day.netCents, undefined, true)}
            <View style={{ gap: 6, paddingTop: space(2) }}>
              {day.events.map((e) => (
                <Pressable key={e.id} accessibilityRole="link" onPress={() => router.push(`/groups/${e.groupId}` as any)} style={{ flexDirection: "row", gap: 8, alignItems: "baseline" }}>
                  <Text style={{ fontFamily: fonts.bodyBold, fontSize: 14, color: e.kind === "pay" ? c.ink : c.amarillo.text, fontVariant: ["tabular-nums"] }}>
                    {signed(e) < 0 || e.kind === "pay" ? "−" : "+"}
                    {money(e.amountCents)}
                  </Text>
                  <Text style={{ flex: 1, fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: c.muted }}>
                    {e.groupName}
                    {e.round ? ` · ${t("round")} ${e.round}` : ""} · {t(`pcSt_${e.status}` as Key)}
                    {e.estimated ? ` · ${t("pcEstimated")}` : ""}
                  </Text>
                </Pressable>
              ))}
            </View>
          </>
        ) : (
          <Text style={{ fontFamily: fonts.body, fontSize: 14.5, lineHeight: 21, color: c.muted }}>{t("pcNothing")}</Text>
        )}
      </SteppedBox>

      <SteppedBox fill={c.amarillo.fill + "2E"} stroke={c.amarillo.fill} step={5} style={{ padding: space(5), gap: space(1) }}>
        <Text accessibilityRole="header" style={{ fontFamily: fonts.display, fontSize: 16.5, color: c.ink }}>
          {t("pcUntil")}
        </Text>
        {row(t("pcOwe"), st.owe, "out")}
        {row(t("pcWill"), st.will, "in")}
        {row(t("pcAhead"), st.aheadNet, undefined, true, t("pcAheadHint"))}
        <Text style={{ fontFamily: fonts.bodyBold, fontSize: 13.5, color: c.muted, paddingTop: space(3) }}>{t("pcHistory")}</Text>
        {row(t("pcPaid"), st.paid, "out")}
        {row(t("pcGot"), st.received, "in")}
        <Text style={{ fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: c.muted, paddingTop: space(2) }}>{t("pcEstimate")}</Text>
      </SteppedBox>

      <View style={{ gap: space(2) }}>
        <Text style={{ fontFamily: fonts.bodyBold, fontSize: 14, color: c.ink }}>{t("pcJump")}</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {[
            { k: "today", label: t("pcToday"), on: () => jump(0) },
            { k: "7", label: t("pcJ7"), on: () => jump(7) },
            { k: "30", label: t("pcJ30"), on: () => jump(30) },
            { k: "end", label: t("pcJEnd"), on: () => pick(new Date(now.getFullYear(), now.getMonth() + 1, 0)) },
            ...(nextPayout ? [{ k: "next", label: `${t("pcJNext")} · ${new Date(nextPayout.at).toLocaleDateString(locale, { day: "numeric", month: "short" })}`, on: () => pick(new Date(nextPayout.at)) }] : []),
          ].map((b) => (
            <Pressable key={b.k} accessibilityRole="button" onPress={b.on} style={{ minHeight: 40, paddingHorizontal: 12, justifyContent: "center", borderWidth: 2, borderColor: c.line, backgroundColor: c.surface }}>
              <Text style={{ fontFamily: fonts.bodyBold, fontSize: 14, color: c.ink }}>{b.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    </View>
  );

  return (
    <Screen width={wide ? 1240 : 640}>
      {title}
      <P muted>{t("pcHint")}</P>
      <LedgerSummary
        items={[
          { label: `${t("pcWillPay")} · ${t("pcNext30").toLowerCase()}`, cents: out30 },
          { label: `${t("pcWillGet")} · ${t("pcNext30").toLowerCase()}`, cents: in30, tone: "verde" },
          { label: t("pcHeld"), cents: held, tone: "turquesa" },
        ]}
      />
      {data.groups.length > 1 ? (
        <View style={{ gap: space(1.5) }}>
          <Text style={{ fontFamily: fonts.bodyBold, fontSize: 14.5, color: c.ink }}>{t("pcGroups")}</Text>
          {/* one line that scrolls sideways: many pasanakus must not push the calendar down the page */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {[{ id: "all", name: t("mpAllGroups") }, ...data.groups].map((g) => {
              const on = group === g.id;
              return (
                <Pressable key={g.id} accessibilityRole="radio" accessibilityState={{ checked: on }} onPress={() => setGroup(g.id)} style={{ minHeight: 40, paddingHorizontal: 14, justifyContent: "center", backgroundColor: on ? c.fucsia.fill : c.surface, borderWidth: 2, borderColor: on ? c.fucsia.fill : c.line }}>
                  <Text numberOfLines={1} style={{ fontFamily: fonts.bodyBold, fontSize: 14.5, color: on ? c.onAction : c.ink }}>{g.name}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      ) : null}
      <View style={{ flexDirection: wide ? "row" : "column", gap: space(6), alignItems: "flex-start" }}>
        <View style={{ flex: 1, minWidth: 0, width: "100%", gap: space(4) }}>
          <PersonalCalendar data={shown} dark={c.scheme === "dark"} lang={lang === "en" ? "en" : "es"} selected={selected} onSelect={pick} money={money} labels={labels} />
          <Legend
            note={t("pcEstimate")}
            items={[
              { hue: "verde", label: `${t("pcPay")} · ${t("pcSt_paid").toLowerCase()}` },
              { hue: "naranja", label: `${t("pcPay")} · ${t("pcSt_pending").toLowerCase()}` },
              { hue: "rojo", label: `${t("pcPay")} · ${t("pcSt_late").toLowerCase()}` },
              { hue: "amarillo", label: t("pcReceive") },
              { hue: "turquesa", label: t("pcGuarantee") },
              { hue: "muted", label: t("pcSt_upcoming") },
            ]}
          />
        </View>
        {side}
      </View>
    </Screen>
  );
}
