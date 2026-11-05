import { useState } from "react";
import { useScheme } from "@/lib/scheme";
import { Switch, Text, View } from "react-native";
import { Stack, router } from "expo-router";
import { Button, Chips, Field, P, Screen } from "@/components/ui";
import { useI18n } from "@/lib/i18n";
import { api, ApiError } from "@/lib/api";
import { AdmissionForm, admissionPayload, defaultAdmission } from "@/components/admission-form";
import { colors, fonts } from "@/lib/theme";

type Freq = "WEEKLY" | "BIWEEKLY" | "MONTHLY";
type Method = "LOTTERY" | "AI" | "ORGANIZER";

export default function NewGroup() {
  useScheme(); // re-render when the color mode changes
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("20");
  const [frequency, setFrequency] = useState<Freq>("WEEKLY");
  const [orderMethod, setOrderMethod] = useState<Method>("AI");
  const [maxMembers, setMaxMembers] = useState("5");
  const [lateFee, setLateFee] = useState("5");
  const [maxRetention, setMaxRetention] = useState("25");
  const [demoMode, setDemoMode] = useState(true);
  const [admission, setAdmission] = useState(defaultAdmission);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const g = await api<{ id: string }>("/groups", {
        body: {
          name: name.trim(),
          contributionCents: Math.round(parseFloat(amount.replace(",", ".")) * 100),
          frequency,
          orderMethod,
          maxMembers: parseInt(maxMembers, 10),
          lateFeePct: parseInt(lateFee, 10),
          maxRetentionPct: parseInt(maxRetention, 10),
          demoMode,
          demoRoundMinutes: demoMode ? 4 : undefined,
          ...(admission.isOpen ? admissionPayload(admission) : {}),
        },
      });
      router.replace(`/groups/${g.id}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.code : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: t("create") }} />
      <Field label={t("name")} value={name} onChangeText={setName} placeholder="Pasanaku de la familia" />
      <Field label={t("contribution")} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" />
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
      <Field label={t("maxMembers")} value={maxMembers} onChangeText={setMaxMembers} keyboardType="number-pad" />
      <Field label={t("lateFee")} value={lateFee} onChangeText={setLateFee} keyboardType="number-pad" />
      <Field label={t("maxRetention")} value={maxRetention} onChangeText={setMaxRetention} keyboardType="number-pad" />
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text style={{ color: colors.ink, fontFamily: fonts.bodyBold, flex: 1 }}>{t("demoMode")}</Text>
        <Switch value={demoMode} onValueChange={setDemoMode} trackColor={{ true: colors.primary }} />
      </View>
      <AdmissionForm value={admission} onChange={setAdmission} />
      {error && <P style={{ color: colors.danger }}>{error}</P>}
      <Button title={t("save")} onPress={submit} loading={busy} disabled={name.trim().length < 2} />
    </Screen>
  );
}
