import { useCallback, useState } from "react";
import { useScheme } from "@/lib/scheme";
import { Stack, router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { Button, LoadError, Loading, Notice, Screen } from "@/components/ui";
import { AdmissionForm, admissionPayload, fromGroup, type AdmissionValues } from "@/components/admission-form";
import { useI18n } from "@/lib/i18n";
import { api } from "@/lib/api";
import { errorText } from "@/lib/errors";
import { P } from "@/components/ui";
import { Guide, TwoCol } from "@/components/guide";
import { useLayout } from "@/lib/layout";

/** Organizer: publish the pasanaku as open and set who can get in. */
export default function AdmissionSettings() {
  useScheme(); // re-render when the color mode changes
  const { id } = useLocalSearchParams<{ id: string }>();
  const { wide } = useLayout();
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
    <Screen width={wide ? 1240 : 640}>
      {title}
      <P muted>{t("adHint")}</P>
      <TwoCol side={<Guide title={t("adGuide")} steps={[{ title: t("adG1"), body: t("adG1b") }, { title: t("adG2"), body: t("adG2b") }, { title: t("adG3"), body: t("adG3b") }, { title: t("adG4"), body: t("adG4b") }]} note={t("adNote")} />}>
      <AdmissionForm value={value} onChange={setValue} />
      {msg && <Notice tone={msg.ok ? "ok" : "error"}>{msg.text}</Notice>}
      <Button title={t("saveSettings")} onPress={save} loading={busy} />
      </TwoCol>
    </Screen>
  );
}
