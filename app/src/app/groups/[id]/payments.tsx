import { useCallback, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Stack, router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { Button, Card, Chips, Field, H2, Loading, Notice, P, Screen } from "@/components/ui";
import { useScheme } from "@/lib/scheme";
import { fonts, space } from "@/lib/theme";
import type { Key } from "@/lib/i18n";
import { LedgerList, LedgerSummary, type LedgerEntry } from "@/components/ledger";
import { useI18n } from "@/lib/i18n";
import { api, money } from "@/lib/api";
import { useLayout } from "@/lib/layout";

type Ledger = {
  isOrganizer: boolean;
  entries: LedgerEntry[];
  totals: { inCents: number; outCents: number; feesCents: number | null };
  guaranteeHeldCents: number;
};
type Filter = "all" | "mine" | "in" | "out";
type State = "all" | "done" | "progress" | "problems";

/** Lowercase and without accents, so "garantia" finds "garantía". */
const plain = (v: string) => v.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
type Recon = {
  ranAt: string | null;
  available: boolean;
  checked: number;
  matched: number;
  issueCount?: number;
  issues: { type: string; captureId: string; amount: string; theirs: string | null }[];
  isOrganizer: boolean;
};

/** Every PayPal charge and payout of the group, with what this member is allowed to see. */
export default function GroupPayments() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, lang } = useI18n();
  const { wide } = useLayout();
  const [data, setData] = useState<Ledger | null>(null);
  const [failed, setFailed] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [state, setState] = useState<State>("all");
  const [round, setRound] = useState("all");
  const [q, setQ] = useState("");
  const { c } = useScheme();
  const [recon, setRecon] = useState<Recon | null>(null);
  const [checking, setChecking] = useState(false);

  useFocusEffect(
    useCallback(() => {
      api<Ledger>(`/groups/${id}/ledger`)
        .then(setData)
        .catch(() => setFailed(true));
      api<Recon>(`/groups/${id}/reconciliation`).then(setRecon).catch(() => {});
    }, [id])
  );

  const title = <Stack.Screen options={{ title: t("payments") }} />;
  if (failed) return <Screen>{title}<Notice tone="error">{t("loadFailed")}</Notice></Screen>;
  if (!data) return <>{title}<Loading /></>;

  const rounds = [...new Set(data.entries.map((e) => e.round).filter((n): n is number => n != null))].sort((a, b) => a - b);
  const needle = plain(q.trim());
  const shown = data.entries.filter((e) => {
    if (filter === "mine" ? !e.mine : filter !== "all" && e.direction !== filter) return false;
    const problem = e.status === "FAILED" || e.type === "UNPAID";
    if (state === "problems" && !problem) return false;
    if (state === "progress" && e.status !== "IN_PROGRESS") return false;
    if (state === "done" && (problem || e.status !== "DONE")) return false;
    if (round !== "all" && String(e.round) !== round) return false;
    if (!needle) return true;
    // what the row shows: concept, round, member, PayPal reference and amount
    return plain([t(`lg_${e.type}` as Key), e.round ? `${t("round")} ${e.round}` : "", e.memberName, e.ref ?? "", money(e.amountCents)].join(" ")).includes(needle);
  });
  const filtered = filter !== "all" || state !== "all" || round !== "all" || q.trim() !== "";
  return (
    <Screen width={wide ? 1240 : 640}>
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
      {recon && (recon.ranAt || recon.available) && (
        <Card>
          <H2>{t("rcTitle")}</H2>
          {!recon.ranAt ? (
            <P muted>{recon.available ? t("rcNever") : t("rcUnavailable")}</P>
          ) : (
            <>
              <P>{recon.checked === 0 ? t("rcNothing") : `${recon.matched} / ${recon.checked} ${t("rcOk")}`}</P>
              {(recon.issueCount ?? recon.issues.length) > 0 && <Notice tone="error">{`${recon.issueCount ?? recon.issues.length} ${t("rcIssues")}`}</Notice>}
              {recon.issues.map((i) => (
                <P key={i.captureId} muted>
                  {t(`rc_${i.type}` as Key)}: {i.captureId.slice(-8)} · ${i.amount}
                  {i.theirs ? ` → $${i.theirs}` : ""}
                </P>
              ))}
              <P muted style={{ fontSize: 13.5 }}>
                {t("rcWhen")}: {new Date(recon.ranAt).toLocaleString(lang === "en" ? "en-US" : "es-BO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).replace(/\.$/, "")}. {t("rcLag")}
              </P>
            </>
          )}
          {recon.isOrganizer && (
            <Button
              compact
              kind="secondary"
              title={t("rcNow")}
              loading={checking}
              onPress={async () => {
                setChecking(true);
                try {
                  setRecon(await api<Recon>(`/groups/${id}/reconciliation`, { body: {} }));
                } catch {
                  /* the card keeps showing the last check */
                } finally {
                  setChecking(false);
                }
              }}
            />
          )}
        </Card>
      )}
      <View style={{ flexDirection: wide ? "row" : "column", gap: space(4), alignItems: wide ? "flex-end" : "stretch", flexWrap: "wrap" }}>
        <View style={{ flexGrow: 1, flexBasis: wide ? 280 : undefined, maxWidth: wide ? 380 : undefined }}>
          <Field label={t("mpSearch")} value={q} onChangeText={setQ} placeholder={t("gpSearchPh")} maxLength={60} autoCorrect={false} />
        </View>
        <Chips
          label={t("mpKind")}
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: t("lgAll") },
            { value: "mine", label: t("lgMine") },
            { value: "in", label: t("lgInF") },
            { value: "out", label: t("lgOutF") },
          ]}
        />
        <Chips
          label={t("lgColStatus")}
          value={state}
          onChange={setState}
          options={[
            { value: "all", label: t("mpAllGroups") },
            { value: "done", label: t("lgStDone") },
            { value: "progress", label: t("lgStProgress") },
            { value: "problems", label: t("mpProblems") },
          ]}
        />
      </View>
      {rounds.length > 1 ? <Chips label={t("round")} value={round} onChange={setRound} options={[{ value: "all", label: t("gpAllRounds") }, ...rounds.map((n) => ({ value: String(n), label: `R${n}` }))]} /> : null}
      <View style={{ flexDirection: "row", alignItems: "center", gap: space(4), flexWrap: "wrap" }}>
        <Text accessibilityLiveRegion="polite" style={{ fontFamily: fonts.bodyBold, fontSize: 14.5, color: c.ink }}>
          {shown.length} {t("of")} {data.entries.length} {t("mpShowing")}
        </Text>
        {filtered ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setFilter("all");
              setState("all");
              setRound("all");
              setQ("");
            }}
            style={{ minHeight: 36, justifyContent: "center" }}
          >
            <Text style={{ fontFamily: fonts.bodyBold, fontSize: 14, color: c.fucsia.text }}>{t("mpClear")}</Text>
          </Pressable>
        ) : null}
      </View>
      {shown.length === 0 ? <Notice>{data.entries.length === 0 ? t("lgEmpty") : t("lgEmptyFilter")}</Notice> : <LedgerList entries={shown} locale={lang === "en" ? "en-US" : "es-BO"} onReport={(contributionId) => router.push(`/groups/${id}/claims?new=${contributionId}` as any)} />}
      <P muted style={{ fontSize: 14, lineHeight: 20 }}>
        {data.isOrganizer ? t("lgPrivacyOrganizer") : t("lgPrivacy")}
      </P>
    </Screen>
  );
}
