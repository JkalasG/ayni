import { useCallback, useState } from "react";
import { useScheme } from "@/lib/scheme";
import { Stack, useFocusEffect, useLocalSearchParams } from "expo-router";
import { Badge, Card, H2, Loading, P, Screen } from "@/components/ui";
import { useI18n } from "@/lib/i18n";
import { api, ApiError } from "@/lib/api";
import { colors } from "@/lib/theme";

type Dispute = { id: string; reason: string; status: string; amount: string; memberName: string; round: number | null; createdAt: string };

/** Organizer only: PayPal disputes on this group's contributions, summarized by Claude. */
export default function Disputes() {
  useScheme(); // re-render when the color mode changes
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useI18n();
  const [data, setData] = useState<{ disputes: Dispute[]; summary: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      api<{ disputes: Dispute[]; summary: string }>(`/groups/${id}/disputes`)
        .then(setData)
        .catch((e) => setError(e instanceof ApiError ? e.code : String(e)));
    }, [id])
  );

  if (error) return <Screen><Stack.Screen options={{ title: t("disputes") }} /><P style={{ color: colors.danger }}>{error === "organizer_only" ? t("organizerOnly") : t("loadFailed")}</P></Screen>;
  if (!data) return <Loading />;
  return (
    <Screen>
      <Stack.Screen options={{ title: t("disputes") }} />
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
          <P muted style={{ fontSize: 12 }}>
            {d.id} · {new Date(d.createdAt).toLocaleString()}
          </P>
        </Card>
      ))}
    </Screen>
  );
}
