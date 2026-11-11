import { useCallback, useState } from "react";
import { Stack, router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { Chips, Loading, Notice, P, Screen } from "@/components/ui";
import { LedgerList, LedgerSummary, type LedgerEntry } from "@/components/ledger";
import { useI18n } from "@/lib/i18n";
import { api, money } from "@/lib/api";

type Ledger = {
  isOrganizer: boolean;
  entries: LedgerEntry[];
  totals: { inCents: number; outCents: number; feesCents: number | null };
  guaranteeHeldCents: number;
};
type Filter = "all" | "mine" | "in" | "out";

/** Every PayPal charge and payout of the group, with what this member is allowed to see. */
export default function GroupPayments() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, lang } = useI18n();
  const [data, setData] = useState<Ledger | null>(null);
  const [failed, setFailed] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");

  useFocusEffect(
    useCallback(() => {
      api<Ledger>(`/groups/${id}/ledger`)
        .then(setData)
        .catch(() => setFailed(true));
    }, [id])
  );

  const title = <Stack.Screen options={{ title: t("payments") }} />;
  if (failed) return <Screen>{title}<Notice tone="error">{t("loadFailed")}</Notice></Screen>;
  if (!data) return <Loading />;

  const shown = data.entries.filter((e) => (filter === "mine" ? e.mine : filter === "all" ? true : e.direction === filter));
  return (
    <Screen>
      {title}
      <P muted>{t("paymentsHint")}</P>
      <LedgerSummary
        items={[
          { label: t("lgIn"), cents: data.totals.inCents, tone: "verde" },
          { label: t("lgOut"), cents: data.totals.outCents, tone: "amarillo" },
          { label: data.isOrganizer ? t("lgHeld") : t("lgHeldMine"), cents: data.guaranteeHeldCents, tone: "turquesa" },
        ]}
      />
      {data.totals.feesCents != null && (
        <P muted>
          {t("lgFeesTotal")}: {money(data.totals.feesCents)}
        </P>
      )}
      <Chips
        value={filter}
        onChange={setFilter}
        options={[
          { value: "all", label: t("lgAll") },
          { value: "mine", label: t("lgMine") },
          { value: "in", label: t("lgInF") },
          { value: "out", label: t("lgOutF") },
        ]}
      />
      {shown.length === 0 ? <Notice>{data.entries.length === 0 ? t("lgEmpty") : t("lgEmptyFilter")}</Notice> : <LedgerList entries={shown} locale={lang === "en" ? "en-US" : "es-BO"} onReport={(contributionId) => router.push(`/groups/${id}/claims?new=${contributionId}` as any)} />}
      <P muted style={{ fontSize: 14, lineHeight: 20 }}>
        {data.isOrganizer ? t("lgPrivacyOrganizer") : t("lgPrivacy")}
      </P>
    </Screen>
  );
}
