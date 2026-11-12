import { useCallback, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Stack, useFocusEffect } from "expo-router";
import { Chips, Field, Loading, Notice, P, Screen } from "@/components/ui";
import { LedgerList, LedgerSummary, type LedgerEntry } from "@/components/ledger";
import { useI18n, type Key } from "@/lib/i18n";
import { useLayout } from "@/lib/layout";
import { useScheme } from "@/lib/scheme";
import { api, money } from "@/lib/api";
import { fonts, space } from "@/lib/theme";
import { Empty } from "@/components/empty";

type Mine = {
  entries: LedgerEntry[];
  totals: { paidCents: number; receivedCents: number };
  guaranteeHeldCents: number;
};
type Kind = "all" | "paid" | "received" | "problems";

/** Lowercase and without accents, so "garantia" finds "garantía". */
const plain = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** "Mis pagos": everything this person paid and received through PayPal, in all their groups. */
export default function MyPayments() {
  const { t, lang } = useI18n();
  const { c } = useScheme();
  const { wide } = useLayout();
  const [data, setData] = useState<Mine | null>(null);
  const [failed, setFailed] = useState(false);
  const [kind, setKind] = useState<Kind>("all");
  const [group, setGroup] = useState("all");
  const [q, setQ] = useState("");

  useFocusEffect(
    useCallback(() => {
      api<Mine>("/me/payments")
        .then(setData)
        .catch(() => setFailed(true));
    }, [])
  );

  const groups = useMemo(() => [...new Set((data?.entries ?? []).map((e) => e.groupName ?? "").filter(Boolean))], [data]);
  const shown = useMemo(() => {
    const needle = plain(q.trim());
    return (data?.entries ?? []).filter((e) => {
      const problem = e.status === "FAILED" || e.type === "UNPAID";
      if (kind === "paid" && !(e.direction === "in" && !problem)) return false;
      if (kind === "received" && !(e.direction === "out" && !problem)) return false;
      if (kind === "problems" && !problem) return false;
      if (group !== "all" && e.groupName !== group) return false;
      if (!needle) return true;
      // what the row shows: concept, round, pasanaku, PayPal reference and amount
      const text = plain([t(`lg_${e.type}` as Key), e.round ? `${t("round")} ${e.round}` : "", e.groupName ?? "", e.ref ?? "", money(e.amountCents)].join(" "));
      return text.includes(needle);
    });
  }, [data, kind, group, q, t]);

  const title = <Stack.Screen options={{ title: t("myPayments") }} />;
  if (failed) return <Screen>{title}<Notice tone="error">{t("loadFailed")}</Notice></Screen>;
  if (!data) return <>{title}<Loading /></>;

  const filtered = kind !== "all" || group !== "all" || q.trim() !== "";
  const sum = shown.reduce((n, e) => n + (e.status === "FAILED" || e.type === "UNPAID" || e.direction === "none" ? 0 : e.direction === "in" ? -e.amountCents : e.amountCents), 0);
  return (
    <Screen width={wide ? 1240 : 640}>
      {title}
      <P muted>{t("myPaymentsHint")}</P>
      <LedgerSummary
        items={[
          { label: t("lgPaidByMe"), cents: data.totals.paidCents },
          { label: t("lgReceived"), cents: data.totals.receivedCents, tone: "verde" },
          { label: t("lgHeldMine"), cents: data.guaranteeHeldCents, tone: "turquesa" },
        ]}
      />
      {data.entries.length === 0 ? (
        <Empty icon="paypal" tone="amarillo" title={t("emPay")} body={t("lgEmptyMine")} />
      ) : (
        <>
          <View style={{ flexDirection: wide ? "row" : "column", gap: space(4), alignItems: wide ? "flex-end" : "stretch", flexWrap: "wrap" }}>
            <View style={{ flexGrow: 1, flexBasis: wide ? 300 : undefined, maxWidth: wide ? 420 : undefined }}>
              <Field label={t("mpSearch")} value={q} onChangeText={setQ} placeholder={t("mpSearchPh")} maxLength={60} autoCorrect={false} />
            </View>
            <Chips
              label={t("mpKind")}
              value={kind}
              onChange={setKind}
              options={[
                { value: "all", label: t("lgAll") },
                { value: "paid", label: t("mpPaid") },
                { value: "received", label: t("mpReceived") },
                { value: "problems", label: t("mpProblems") },
              ]}
            />
          </View>
          {groups.length > 1 ? <Chips label={t("mpGroup")} value={group} onChange={setGroup} options={[{ value: "all", label: t("mpAllGroups") }, ...groups.map((g) => ({ value: g, label: g }))]} /> : null}
          <View style={{ flexDirection: "row", alignItems: "center", gap: space(4), flexWrap: "wrap" }}>
            <Text accessibilityLiveRegion="polite" style={{ fontFamily: fonts.bodyBold, fontSize: 14.5, color: c.ink }}>
              {shown.length} {t("of")} {data.entries.length} {t("mpShowing")}
            </Text>
            {filtered && shown.length > 0 ? (
              <Text style={{ fontFamily: fonts.body, fontSize: 14.5, color: c.muted }}>
                {t("mpSum")}: <Text style={{ fontFamily: fonts.bodyBold, color: sum < 0 ? c.ink : c.verde.text }}>{sum < 0 ? "− " : "+ "}{money(Math.abs(sum))}</Text>
              </Text>
            ) : null}
            {filtered ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setKind("all");
                  setGroup("all");
                  setQ("");
                }}
                style={{ minHeight: 36, justifyContent: "center" }}
              >
                <Text style={{ fontFamily: fonts.bodyBold, fontSize: 14, color: c.fucsia.text }}>{t("mpClear")}</Text>
              </Pressable>
            ) : null}
          </View>
          {shown.length === 0 ? <Empty icon="explorar" tone="naranja" title={t("emFilter")} body={t("emFilterBody")} action={{ label: t("mpClear"), onPress: () => (setKind("all"), setGroup("all"), setQ("")) }} /> : <LedgerList entries={shown} locale={lang === "en" ? "en-US" : "es-BO"} personal />}
        </>
      )}
    </Screen>
  );
}
