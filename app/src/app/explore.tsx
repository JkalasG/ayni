import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { Stack, router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, Field, Loading, Notice } from "@/components/ui";
import { AguayoBand, type Motif } from "@/components/aguayo";
import { Icon } from "@/components/icons";
import { SteppedBox } from "@/components/stepped";
import { CountryMap } from "@/components/country-map";
import { countryName } from "@/lib/countries";
import { type AdmissionCheck, type TrustProfile } from "@/components/trust";
import { useI18n, type Key } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { useLayout } from "@/lib/layout";
import { useScheme } from "@/lib/scheme";
import { api, ApiError, money } from "@/lib/api";
import { openPayPal, returnUrl } from "@/lib/pay";
import { fonts, space, type Palette } from "@/lib/theme";

type Rules = { minCompleted: number; minOnTimePct: number; maxLate: number | null; acceptNewcomers: boolean };
type OpenGroup = {
  id: string;
  name: string;
  description: string | null;
  country: string;
  memberCountries: string[];
  organizerName: string;
  contributionCents: number;
  frequency: string;
  members: number;
  maxMembers: number;
  admissionMode: "MANUAL" | "AUTO" | "AI";
  requireDeposit: boolean;
  rules: Rules;
  check: AdmissionCheck;
  isMember: boolean;
  myRequest: { id: string; status: string } | null;
};

type Filter = "all" | "forMe" | "WEEKLY" | "MONTHLY" | "newcomers";
const MOTIFS: Motif[] = ["zigzag", "escalonado", "franjas"];

/** Each requirement as a short line: met or not, with the numbers. */
function requirements(g: OpenGroup, p: TrustProfile, t: (k: Key) => string) {
  const out: { ok: boolean; text: string }[] = [];
  const fails = g.check.failures;
  out.push({ ok: !fails.includes("not_verified"), text: t("reqVerified") });
  if (p.isNewcomer) {
    out.push({ ok: !fails.includes("newcomers_not_accepted"), text: g.rules.acceptNewcomers ? t("acceptsNewcomers") : t("rule_newcomers_not_accepted") });
  } else {
    if (g.rules.minCompleted > 0) out.push({ ok: !fails.includes("min_completed"), text: `${g.rules.minCompleted} ${g.rules.minCompleted === 1 ? t("needCompletedOne") : t("needCompletedMany")}` });
    if (g.rules.minOnTimePct > 0) out.push({ ok: !fails.includes("min_on_time"), text: `${g.rules.minOnTimePct}% ${t("onTimeShort")}` });
    if (g.rules.maxLate != null) out.push({ ok: !fails.includes("max_late"), text: `${t("rule_max_late")} ≤ ${g.rules.maxLate}` });
  }
  if (fails.includes("has_abandoned")) out.push({ ok: false, text: t("rule_has_abandoned") });
  return out;
}

/** "Cumples todo" or exactly what is missing, in one line. */
function verdict(g: OpenGroup, p: TrustProfile, t: (k: Key) => string, c: Palette) {
  if (g.check.meets) return { text: t("youMeetAll"), color: c.verde.text, ok: true };
  const f = g.check.failures;
  if (f.includes("min_completed") && f.length === 1) {
    const n = g.rules.minCompleted - p.completed;
    return { text: `${t("youLack")} ${n} ${n === 1 ? t("needCompletedOne") : t("needCompletedMany")}`, color: c.naranja.text, ok: false };
  }
  if (f.includes("min_on_time") && f.length === 1) return { text: `${t("youLack")} ${g.rules.minOnTimePct}% ${t("onTimeShort")}`, color: c.naranja.text, ok: false };
  if (g.check.borderline) return { text: t("borderline"), color: c.naranja.text, ok: false };
  return { text: `${t("youLack")} ${f.length} ${f.length === 1 ? t("requirement") : t("requirements")}`, color: c.rojo.text, ok: false };
}

export default function Explore() {
  const { t, lang } = useI18n();
  const { me, loading } = useAuth();
  const { c } = useScheme();
  const { wide } = useLayout();
  const insets = useSafeAreaInsets();
  const { status } = useLocalSearchParams<{ status?: string }>();
  const [data, setData] = useState<{ profile: TrustProfile; groups: OpenGroup[] } | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [country, setCountry] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);

  const load = useCallback(async () => setData(await api("/explore")), []);

  useFocusEffect(
    useCallback(() => {
      load().catch(() => {});
    }, [load])
  );

  useEffect(() => {
    if (!loading && !me) router.replace("/");
  }, [me, loading]);

  // Web comes back from PayPal with ?status=deposit|cancelled|error
  useEffect(() => {
    if (status === "deposit") setBanner(t("depositDone"));
    else if (status === "cancelled") setBanner(t("paymentCancel"));
    else if (status === "error") setBanner(t("paymentError"));
  }, [status, t]);

  const shown = useMemo(() => {
    const list = (data?.groups ?? []).filter((g) => !country || g.country === country || g.memberCountries.includes(country));
    switch (filter) {
      case "forMe":
        return list.filter((g) => g.check.meets);
      case "WEEKLY":
      case "MONTHLY":
        return list.filter((g) => g.frequency === filter);
      case "newcomers":
        return list.filter((g) => g.rules.acceptNewcomers);
      default:
        return list;
    }
  }, [data, filter, country]);

  // a group counts in its own country and in every country its members pay from
  const byCountry = useMemo(() => {
    const out: Record<string, number> = {};
    for (const g of data?.groups ?? []) for (const k of new Set([g.country, ...g.memberCountries])) out[k] = (out[k] ?? 0) + 1;
    return out;
  }, [data]);
  const links = useMemo(() => (data?.groups ?? []).flatMap((g) => g.memberCountries.map((m) => [g.country, m] as [string, string])), [data]);

  const request = async (g: OpenGroup) => {
    setBusy(true);
    setBanner(null);
    try {
      const redirect = returnUrl("explore");
      const res = await api<{ request: { status: string }; approveUrl: string | null }>(`/groups/${g.id}/requests`, {
        body: { message: message.trim() || undefined, redirect },
      });
      if (res.approveUrl) {
        const r = await openPayPal(res.approveUrl, redirect);
        if (r === "deposit") setBanner(t("depositDone"));
        else if (r === "cancelled") setBanner(t("paymentCancel"));
        else if (r === "error") setBanner(t("paymentError"));
      } else {
        setBanner(t(`req_${res.request.status}` as Key));
      }
      setMessage("");
      setOpen(null);
      await load();
    } catch (e) {
      setBanner(e instanceof ApiError ? e.code : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (!data) return <Loading />;

  const filters: { value: Filter; label: string }[] = [
    { value: "all", label: t("filterAll") },
    { value: "forMe", label: t("filterForMe") },
    { value: "WEEKLY", label: t("WEEKLY") },
    { value: "MONTHLY", label: t("MONTHLY") },
    { value: "newcomers", label: t("filterNewcomers") },
  ];

  const countries = Object.keys(byCountry).sort((a, b) => byCountry[b] - byCountry[a] || countryName(a, lang).localeCompare(countryName(b, lang)));
  const countryChip = (value: string | null, label: string) => {
    const on = country === value;
    return (
      <Pressable key={value ?? "all"} accessibilityRole="radio" accessibilityState={{ checked: on }} onPress={() => setCountry(value)}>
        <SteppedBox fill={on ? c.turquesa.fill : c.surface} stroke={on ? c.turquesa.fill : c.line} step={3} style={{ minHeight: 44, justifyContent: "center", paddingHorizontal: 14 }}>
          <Text style={{ fontFamily: fonts.bodyBold, fontSize: 14, color: on ? c.onAction : c.ink }}>{label}</Text>
        </SteppedBox>
      </Pressable>
    );
  };
  const countrySection = data.groups.length > 0 && (
    <SteppedBox fill={c.surface} stroke={c.line} step={6} style={{ padding: wide ? space(6) : space(4), gap: space(4) }}>
      <View style={{ gap: space(3) }}>
        <View style={{ gap: 4 }}>
          <Text accessibilityRole="header" style={{ fontFamily: fonts.display, fontSize: 18, color: c.ink }}>{t("byCountry")}</Text>
          <Text style={{ fontFamily: fonts.body, fontSize: 14.5, lineHeight: 21, color: c.muted }}>{t("byCountryHint")}</Text>
        </View>
        {/* the same choice as text, for screen readers and anyone who prefers a list */}
        <View accessibilityRole="radiogroup" accessibilityLabel={t("byCountry")} style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {countryChip(null, t("allCountries"))}
          {countries.map((k) => countryChip(k, `${countryName(k, lang)} ${byCountry[k]}`))}
        </View>
      </View>
      <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        <CountryMap counts={byCountry} links={links} selected={country} onSelect={setCountry} compact={!wide} />
      </View>
    </SteppedBox>
  );

  const card = (g: OpenGroup, i: number) => {
    const v = verdict(g, data.profile, t, c);
    const reqs = requirements(g, data.profile, t);
    const expanded = open === g.id;
    const req = g.myRequest;
    const canRequest = !g.isMember && (!req || req.status === "REJECTED" || req.status === "CANCELLED" || req.status === "AWAITING_DEPOSIT");
    const free = g.maxMembers - g.members;
    const [fu, , am, ve, tu] = c.threads;
    const bandColors = [
      [fu, am, ve],
      [tu, fu],
      [am, tu],
    ][i % 3];
    return (
      <View key={g.id} style={{ backgroundColor: c.surface, borderWidth: 1, borderColor: c.line, borderRadius: 10, overflow: "hidden", flexBasis: wide ? "48%" : "100%", flexGrow: 1 }}>
        <AguayoBand motif={MOTIFS[i % 3]} colors={bandColors} cell={3} />
        <View style={{ padding: space(4), gap: space(3) }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text accessibilityRole="header" style={{ fontFamily: fonts.display, fontSize: 17, lineHeight: 22, color: c.ink }}>
                {g.name}
              </Text>
              <Text style={{ fontFamily: fonts.body, fontSize: 14, color: c.muted }}>
                {t("organizedBy")} {g.organizerName}
              </Text>
              <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 6, marginTop: 4 }}>
                <Icon name="lugar" size={13} color={c.turquesa.text} />
                <Text style={{ flexShrink: 1, fontFamily: fonts.bodyBold, fontSize: 13.5, color: c.turquesa.text }}>
                  {countryName(g.country, lang)}
                  {g.memberCountries.length ? `, ${t("membersAlsoIn")} ${g.memberCountries.map((k) => countryName(k, lang)).join(", ")}` : ""}
                </Text>
              </View>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={{ fontFamily: fonts.displayHeavy, fontSize: 24, color: c.amarillo.text, fontVariant: ["tabular-nums"] }}>{money(g.contributionCents * g.maxMembers).replace(/\.00$/, "")}</Text>
              <Text style={{ fontFamily: fonts.body, fontSize: 12.5, color: c.muted }}>{t("pot").toLowerCase()}</Text>
            </View>
          </View>
          <Text style={{ fontFamily: fonts.bodyBold, fontSize: 14.5, color: c.ink }}>
            {money(g.contributionCents)} {t(`per_${g.frequency}` as Key)}, {free} {t("of")} {g.maxMembers} {free === 1 ? t("seatFree") : t("seatsFree")}
          </Text>
          {g.description ? <Text style={{ fontFamily: fonts.body, fontSize: 14.5, lineHeight: 21, color: c.muted }}>{g.description}</Text> : null}
          {g.memberCountries.length ? (
            <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8, padding: space(3), backgroundColor: c.turquesa.fill + "1A", borderLeftWidth: 3, borderColor: c.turquesa.fill }}>
              <Icon name="paypal" size={16} color={c.turquesa.text} />
              <Text style={{ flex: 1, fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: c.ink }}>{t("crossBorderNote")}</Text>
            </View>
          ) : null}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {reqs.map((r) => (
              <View key={r.text} accessible accessibilityLabel={`${r.text}: ${r.ok ? t("met") : t("notMet")}`} style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 8, paddingVertical: 5, backgroundColor: (r.ok ? c.verde.fill : c.rojo.fill) + "1F" }}>
                <Icon name={r.ok ? "aprobar" : "rechazar"} size={12} color={r.ok ? c.verde.text : c.rojo.text} />
                <Text style={{ fontFamily: fonts.bodyBold, fontSize: 12.5, color: r.ok ? c.verde.text : c.rojo.text }}>{r.text}</Text>
              </View>
            ))}
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", borderTopWidth: 1, borderColor: c.line, paddingTop: space(3) }}>
            <View style={{ flex: 1, minWidth: 140, gap: 2 }}>
              <Text style={{ fontFamily: fonts.bodyBold, fontSize: 15, color: req ? c.muted : v.color }}>{req ? t(`req_${req.status}` as Key) : v.text}</Text>
            </View>
            {g.isMember ? (
              <Button compact kind="secondary" title={t("openGroupBtn")} onPress={() => router.push(`/groups/${g.id}`)} />
            ) : canRequest ? (
              <Button compact kind={v.ok ? "primary" : "light"} title={v.ok ? t("requestJoin") : t("seeWhatsMissing")} onPress={() => setOpen(expanded ? null : g.id)} />
            ) : null}
          </View>
          {expanded && canRequest && (
            <View style={{ gap: space(3) }}>
              {!v.ok && <Text style={{ fontFamily: fonts.body, fontSize: 14.5, lineHeight: 21, color: c.muted }}>{t("missingExplain")}</Text>}
              <Field label={t("requestMessage")} value={message} onChangeText={setMessage} maxLength={500} multiline />
              {g.requireDeposit && <Text style={{ fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: c.muted }}>{t("depositNote")}</Text>}
              <Button
                kind={g.requireDeposit ? "paypal" : "primary"}
                title={g.requireDeposit ? `${t("requestJoin")}, ${money(g.contributionCents)}` : t("sendRequest")}
                loading={busy}
                onPress={() => request(g)}
              />
            </View>
          )}
        </View>
      </View>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: t("openPasanakus"), headerShown: false }} />
      <ScrollView
        contentContainerStyle={{ paddingTop: wide ? space(10) : insets.top + space(4), paddingHorizontal: wide ? space(10) : space(4), paddingBottom: space(12) }}
        refreshControl={<RefreshControl refreshing={false} onRefresh={() => load().catch(() => {})} />}
      >
        <View style={{ maxWidth: wide ? 1100 : 600, width: "100%", alignSelf: "center", gap: space(4) }}>
          <View style={{ gap: 4 }}>
            <Text accessibilityRole="header" style={{ fontFamily: fonts.display, fontSize: wide ? 32 : 24, lineHeight: wide ? 38 : 30, color: c.ink }}>
              {t("openPasanakus")}
            </Text>
            <Text style={{ fontFamily: fonts.body, fontSize: 16, lineHeight: 23, color: c.muted }}>{t("openPasanakusHint")}</Text>
          </View>
          {countrySection}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} accessibilityRole="radiogroup">
            {filters.map((f) => {
              const on = filter === f.value;
              return (
                <Pressable key={f.value} accessibilityRole="radio" accessibilityState={{ checked: on }} onPress={() => setFilter(f.value)}>
                  <SteppedBox fill={on ? c.fucsia.fill : c.surface} stroke={on ? c.fucsia.fill : c.line} step={3} style={{ minHeight: 44, justifyContent: "center", paddingHorizontal: 16 }}>
                    <Text style={{ fontFamily: fonts.bodyBold, fontSize: 14, color: on ? c.onAction : c.ink }}>{f.label}</Text>
                  </SteppedBox>
                </Pressable>
              );
            })}
          </ScrollView>
          {banner && <Notice tone="ok">{banner}</Notice>}
          {shown.length === 0 ? (
            <Text style={{ fontFamily: fonts.body, fontSize: 16, color: c.muted, paddingVertical: space(6) }}>{data.groups.length === 0 ? t("noOpenGroups") : t("noMatches")}</Text>
          ) : (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space(4) }}>{shown.map(card)}</View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}
