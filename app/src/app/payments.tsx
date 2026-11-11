import { useCallback, useState } from "react";
import { Stack, useFocusEffect } from "expo-router";
import { Loading, Notice, P, Screen } from "@/components/ui";
import { LedgerList, LedgerSummary, type LedgerEntry } from "@/components/ledger";
import { useI18n } from "@/lib/i18n";
import { api } from "@/lib/api";

type Mine = {
  entries: LedgerEntry[];
  totals: { paidCents: number; receivedCents: number };
  guaranteeHeldCents: number;
};

/** "Mis pagos": everything this person paid and received through PayPal, in all their groups. */
export default function MyPayments() {
  const { t, lang } = useI18n();
  const [data, setData] = useState<Mine | null>(null);
  const [failed, setFailed] = useState(false);

  useFocusEffect(
    useCallback(() => {
      api<Mine>("/me/payments")
        .then(setData)
        .catch(() => setFailed(true));
    }, [])
  );

  const title = <Stack.Screen options={{ title: t("myPayments") }} />;
  if (failed) return <Screen>{title}<Notice tone="error">{t("loadFailed")}</Notice></Screen>;
  if (!data) return <Loading />;
  return (
    <Screen>
      {title}
      <P muted>{t("myPaymentsHint")}</P>
      <LedgerSummary
        items={[
          { label: t("lgPaidByMe"), cents: data.totals.paidCents },
          { label: t("lgReceived"), cents: data.totals.receivedCents, tone: "verde" },
          { label: t("lgHeldMine"), cents: data.guaranteeHeldCents, tone: "turquesa" },
        ]}
      />
      {data.entries.length === 0 ? <Notice>{t("lgEmptyMine")}</Notice> : <LedgerList entries={data.entries} locale={lang === "en" ? "en-US" : "es-BO"} personal />}
    </Screen>
  );
}
