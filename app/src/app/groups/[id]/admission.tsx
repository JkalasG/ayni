import { useCallback, useState } from "react";
import { useScheme } from "@/lib/scheme";
import { Stack, router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { Button, LoadError, Loading, Notice, Screen } from "@/components/ui";
import { AdmissionForm, admissionPayload, fromGroup, type AdmissionValues } from "@/components/admission-form";
import { useI18n } from "@/lib/i18n";
import { api } from "@/lib/api";
import { errorText } from "@/lib/errors";

/** Organizer: publish the pasanaku as open and set who can get in. */
export default function AdmissionSettings() {
  useScheme(); // re-render when the color mode changes
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useI18n();
  const [value, setValue] = useState<AdmissionValues | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => {
    setFailed(false);
    api(`/groups/${id}`).then((g) => setValue(fromGroup(g))).catch(() => setFailed(true));
  }, [id]);
  useFocusEffect(load);

  const title = <Stack.Screen options={{ title: t("publish") }} />;
  if (failed && !value) return <>{title}<LoadError text={t("loadFailed")} retry={t("retry")} onRetry={load} /></>;
  if (!value) return <>{title}<Loading /></>;

  const save = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await api(`/groups/${id}/admission`, { method: "PATCH", body: admissionPayload(value) });
      setMsg({ text: t("saved"), ok: true });
      setTimeout(() => router.back(), 600);
    } catch (e) {
      setMsg({ text: errorText(e, t), ok: false });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      {title}
      <AdmissionForm value={value} onChange={setValue} />
      {msg && <Notice tone={msg.ok ? "ok" : "error"}>{msg.text}</Notice>}
      <Button title={t("saveSettings")} onPress={save} loading={busy} />
    </Screen>
  );
}
