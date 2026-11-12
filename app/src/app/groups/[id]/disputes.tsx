import { useCallback, useState } from "react";
import { useScheme } from "@/lib/scheme";
import { Stack, useFocusEffect, useLocalSearchParams } from "expo-router";
import { Badge, Card, H2, Loading, Notice, P, Screen } from "@/components/ui";
import { useI18n } from "@/lib/i18n";
import { api, ApiError } from "@/lib/api";
import { colors } from "@/lib/theme";
import { Guide, TwoCol } from "@/components/guide";
import { useLayout } from "@/lib/layout";

type Dispute = { id: string; reason: string; status: string; amount: string; memberName: string; round: number | null; createdAt: string };

/** Organizer only: PayPal disputes on this group's contributions, summarized by Claude. */
export default function Disputes() {
  useScheme(); // re-render when the color mode changes
  const { id } = useLocalSearchParams<{ id: string }>();
  const { wide } = useLayout();
  const { t, lang } = useI18n();
  const [data, setData] = useState<{ disputes: Dispute[]; summary: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      api<{ disputes: Dispute[]; summary: string }>(`/groups/${id}/disputes`)
        .then(setData)
        .catch((e) => setError(e instanceof ApiError ? e.code : String(e)));
    }, [id])
  );

  if (error) return <Screen><Stack.Screen options={{ title: t("disputes") }} /><Notice tone="error">{error === "organizer_only" ? t("organizerOnly") : t("loadFailed")}</Notice></Screen>;
  if (!data) return <><Stack.Screen options={{ title: t("disputes") }} /><Loading /></>;
  return (
    <Screen width={wide ? 1240 : 640}>
      <Stack.Screen options={{ title: t("disputes") }} />
      <P muted>{t("dpHint")}</P>
      <TwoCol side={<Guide title={t("dpGuide")} steps={[{ title: t("dpG1"), body: t("dpG1b") }, { title: t("dpG2"), body: t("dpG2b") }, { title: t("dpG3"), body: t("dpG3b") }]} note={t("dpNote")} />}>
      <Card style={{ borderColor: colors.primary }}>
        <P>{data.summary}</P>
      </Card>
      {data.disputes.map((d) => (
        <Card key={d.id}>
          <H2>
            {d.memberName}
            {d.round ? ` · ${t("round")} ${d.round}` : ""}
          </H2>
          <Badge text={d.status} color={d.status === "RESOLVED" ? colors.leaf : colors.corn} />
          <P>
            ${d.amount} · {d.reason}
          </P>
          <P muted style={{ fontSize: 13.5 }}>
            {d.id} · {new Date(d.createdAt).toLocaleString(lang === "en" ? "en-US" : "es-BO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
          </P>
        </Card>
      ))}
      </TwoCol>
    </Screen>
  );
}
