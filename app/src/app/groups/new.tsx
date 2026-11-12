import { useState } from "react";
import { Text, View } from "react-native";
import { Stack, router } from "expo-router";
import { Button, Chips, Field, FormHeader, Notice, Screen, Toggle } from "@/components/ui";
import { useI18n } from "@/lib/i18n";
import { api } from "@/lib/api";
import { errorText } from "@/lib/errors";
import { AdmissionForm, admissionPayload, defaultAdmission } from "@/components/admission-form";
import { COUNTRIES, countryName, type Country } from "@/lib/countries";
import { Icon } from "@/components/icons";
import { SteppedBox } from "@/components/stepped";
import { useScheme } from "@/lib/scheme";
import { fonts, space } from "@/lib/theme";

type Draft = { name?: string; country?: Country; contributionCents?: number; frequency?: Freq; maxMembers?: number; orderMethod?: Method; isOpen?: boolean };

type Freq = "WEEKLY" | "BIWEEKLY" | "MONTHLY";
type Method = "LOTTERY" | "AI" | "ORGANIZER";

const whole = (v: string) => (/^\d+$/.test(v.trim()) ? parseInt(v, 10) : NaN);
const between = (n: number, min: number, max: number) => Number.isFinite(n) && n >= min && n <= max;

export default function NewGroup() {
  const { t, lang } = useI18n();
  const [name, setName] = useState("");
  const [country, setCountry] = useState<Country>("BO");
  const [amount, setAmount] = useState("20");
  const [frequency, setFrequency] = useState<Freq>("WEEKLY");
  const [orderMethod, setOrderMethod] = useState<Method>("AI");
  const [maxMembers, setMaxMembers] = useState("5");
  const [lateFee, setLateFee] = useState("5");
  const [maxRetention, setMaxRetention] = useState("25");
  const [demoMode, setDemoMode] = useState(true);
  const [admission, setAdmission] = useState(defaultAdmission);
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { c } = useScheme();
  const [describe, setDescribe] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [drafted, setDrafted] = useState<{ text: string; tone: "ok" | "error" } | null>(null);

  /** The assistant reads the description and fills the fields below; nothing is created until the person saves. */
  const fill = async () => {
    if (describe.trim().length < 3) return;
    setDrafting(true);
    setDrafted(null);
    try {
      const r = await api<{ draft: Draft; note: string }>("/groups/draft", { body: { text: describe.trim() } });
      const d = r.draft;
      const filled: string[] = [];
      if (d.name) (setName(d.name), filled.push(t("name")));
      if (d.country) (setCountry(d.country), filled.push(t("groupCountry")));
      if (d.contributionCents) (setAmount(String(d.contributionCents / 100)), filled.push(t("contribution")));
      if (d.frequency) (setFrequency(d.frequency), filled.push(t("frequency")));
      if (d.maxMembers) (setMaxMembers(String(d.maxMembers)), filled.push(t("maxMembers")));
      if (d.orderMethod) (setOrderMethod(d.orderMethod), filled.push(t("orderMethod")));
      if (d.isOpen != null) setAdmission((a) => ({ ...a, isOpen: d.isOpen! }));
      setDrafted(filled.length ? { text: `${r.note} ${t("drFilled")}: ${filled.join(", ").toLowerCase()}.`, tone: "ok" } : { text: t("drNothing"), tone: "error" });
    } catch (e) {
      setDrafted({ text: errorText(e, t), tone: "error" });
    } finally {
      setDrafting(false);
    }
  };

  // The same limits the server enforces, checked here so the person sees which field is wrong.
  const cents = Math.round(parseFloat(amount.replace(",", ".")) * 100);
  const members = whole(maxMembers);
  const fee = whole(lateFee);
  const retention = whole(maxRetention);
  const problems = {
    name: name.trim().length < 2 ? t("vName") : null,
    amount: between(cents, 100, 1_000_000) ? null : t("vAmount"),
    members: between(members, 2, 30) ? null : t("vMembers"),
    fee: between(fee, 0, 20) ? null : t("vLateFee"),
    retention: between(retention, 0, 50) ? null : t("vRetention"),
  };
  const valid = Object.values(problems).every((p) => !p);
  // The name's problem waits for the first attempt; a number out of range shows as soon as it is typed.
  const show = (p: string | null, always = true) => (always || tried ? p : null);

  const submit = async () => {
    setTried(true);
    if (!valid) return;
    setBusy(true);
    setError(null);
    try {
      const g = await api<{ id: string }>("/groups", {
        body: {
          name: name.trim(),
          country,
          contributionCents: cents,
          frequency,
          orderMethod,
          maxMembers: members,
          lateFeePct: fee,
          maxRetentionPct: retention,
          demoMode,
          demoRoundMinutes: demoMode ? 4 : undefined,
          ...(admission.isOpen ? admissionPayload(admission) : {}),
        },
      });
      router.replace(`/groups/${g.id}`);
    } catch (e) {
      setError(errorText(e, t));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: t("create") }} />
      <FormHeader icon="grupos" hint={t("newHint")} />
      <SteppedBox fill={c.surface} stroke={c.turquesa.fill} step={5} style={{ padding: space(4), gap: space(3) }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <View style={{ width: 34, height: 34, alignItems: "center", justifyContent: "center", backgroundColor: c.turquesa.fill }}>
            <Icon name="rayo" size={18} color={c.onAction} />
          </View>
          <View style={{ flex: 1 }}>
            <Text accessibilityRole="header" style={{ fontFamily: fonts.display, fontSize: 17, color: c.ink }}>
              {t("drTitle")}
            </Text>
            <Text style={{ fontFamily: fonts.body, fontSize: 13.5, lineHeight: 19, color: c.muted }}>{t("drHint")}</Text>
          </View>
        </View>
        <Field label={t("drLabel")} value={describe} onChangeText={setDescribe} placeholder={t("drPlaceholder")} multiline maxLength={1000} />
        <Button compact kind="secondary" title={t("drButton")} onPress={fill} loading={drafting} />
        {drafted ? (
          <Text accessibilityLiveRegion="polite" style={{ fontFamily: fonts.bodyBold, fontSize: 14.5, lineHeight: 21, color: drafted.tone === "ok" ? c.turquesa.text : c.rojo.text }}>
            {drafted.text}
          </Text>
        ) : null}
      </SteppedBox>
      <Field label={t("name")} value={name} onChangeText={setName} placeholder="Pasanaku de la familia" maxLength={60} error={show(problems.name, false)} />
      <Chips label={t("groupCountry")} value={country} onChange={setCountry} options={COUNTRIES.map((v) => ({ value: v, label: countryName(v, lang) }))} />
      <Field label={t("contribution")} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" error={show(problems.amount)} />
      <Chips
        label={t("frequency")}
        value={frequency}
        onChange={setFrequency}
        options={(["WEEKLY", "BIWEEKLY", "MONTHLY"] as Freq[]).map((v) => ({ value: v, label: t(v) }))}
      />
      <Chips
        label={t("orderMethod")}
        value={orderMethod}
        onChange={setOrderMethod}
        options={(["AI", "LOTTERY", "ORGANIZER"] as Method[]).map((v) => ({ value: v, label: t(v) }))}
      />
      <Field label={t("maxMembers")} value={maxMembers} onChangeText={setMaxMembers} keyboardType="number-pad" error={show(problems.members)} />
      <Field label={t("lateFee")} value={lateFee} onChangeText={setLateFee} keyboardType="number-pad" error={show(problems.fee)} />
      <Field label={t("maxRetention")} value={maxRetention} onChangeText={setMaxRetention} keyboardType="number-pad" error={show(problems.retention)} />
      <Toggle label={t("demoMode")} value={demoMode} onChange={setDemoMode} />
      <AdmissionForm value={admission} onChange={setAdmission} />
      {error && <Notice tone="error">{error}</Notice>}
      <Button title={t("save")} onPress={submit} loading={busy} />
    </Screen>
  );
}
