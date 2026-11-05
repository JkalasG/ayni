import { useCallback, useState } from "react";
import { useScheme } from "@/lib/scheme";
import { Stack, router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { Button, Loading, P, Screen } from "@/components/ui";
import { AdmissionForm, admissionPayload, fromGroup, type AdmissionValues } from "@/components/admission-form";
import { useI18n } from "@/lib/i18n";
import { api, ApiError } from "@/lib/api";
import { colors } from "@/lib/theme";

/** Organizer: publish the pasanaku as open and set who can get in. */
export default function AdmissionSettings() {
  useScheme(); // re-render when the color mode changes
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useI18n();
  const [value, setValue] = useState<AdmissionValues | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  useFocusEffect(
    useCallback(() => {
      api(`/groups/${id}`).then((g) => setValue(fromGroup(g))).catch(() => {});
    }, [id])
  );

  if (!value) return <Loading />;

  const save = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await api(`/groups/${id}/admission`, { method: "PATCH", body: admissionPayload(value) });
      setMsg({ text: t("saved"), ok: true });
      setTimeout(() => router.back(), 600);
    } catch (e) {
      setMsg({ text: e instanceof ApiError ? e.code : String(e), ok: false });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: t("publish") }} />
      <AdmissionForm value={value} onChange={setValue} />
      {msg && <P style={{ color: msg.ok ? colors.leaf : colors.danger }}>{msg.text}</P>}
      <Button title={t("saveSettings")} onPress={save} loading={busy} />
    </Screen>
  );
}
