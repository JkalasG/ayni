/**
 * Claims: report a problem with one of MY contributions, follow it, and (organizer) answer it.
 * If it goes to PayPal as a dispute, the same card shows the dispute and PayPal's decision.
 */
import { useCallback, useState } from "react";
import { Text, View } from "react-native";
import { Stack, router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { Badge, Button, Card, Chips, Field, H2, Loading, Notice, P, Screen } from "@/components/ui";
import { useI18n, type Key } from "@/lib/i18n";
import { useScheme } from "@/lib/scheme";
import { api, ApiError, money } from "@/lib/api";
import { fonts } from "@/lib/theme";
import { Empty } from "@/components/empty";
import { Guide, TwoCol } from "@/components/guide";
import { useLayout } from "@/lib/layout";

type Claim = {
  id: string;
  kind: string;
  status: "OPEN" | "REFUNDING" | "REFUNDED" | "REJECTED" | "ESCALATED" | "RESOLVED";
  message: string | null;
  claimant: string;
  round: number | null;
  amountCents: number;
  paypalDisputeId: string | null;
  note: string | null;
  timeline: { at: string; type: string; text: string }[];
  createdAt: string;
  canRefund: boolean;
  canReject: boolean;
};
type KindValue = "DOUBLE_CHARGE" | "WRONG_AMOUNT" | "NOT_RECOGNIZED" | "OTHER";

const ERRORS: Record<string, Key> = {
  claim_exists: "clErrExists",
  too_many_claims: "clErrMany",
  nothing_to_claim: "clErrNothing",
  pot_already_sent: "clErrPot",
  escalated_to_paypal: "clErrEscalated",
  message_required: "clErrMessage",
};

export default function Claims() {
  const { c } = useScheme();
  const { id, new: newFor } = useLocalSearchParams<{ id: string; new?: string }>();
  const { wide } = useLayout();
  const { t, lang } = useI18n();
  const [data, setData] = useState<{ isOrganizer: boolean; claims: Claim[] } | null>(null);
  const [failed, setFailed] = useState(false);
  const [kind, setKind] = useState<KindValue>("DOUBLE_CHARGE");
  const [message, setMessage] = useState("");
  const [note, setNote] = useState<Record<string, string>>({});
  const [answering, setAnswering] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ text: string; tone: "ok" | "error" } | null>(null);

  const load = useCallback(() => api<{ isOrganizer: boolean; claims: Claim[] }>(`/groups/${id}/claims`).then(setData).catch(() => setFailed(true)), [id]);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const run = async (key: string, fn: () => Promise<unknown>, ok?: Key) => {
    setBusy(key);
    setBanner(null);
    try {
      await fn();
      if (ok) setBanner({ text: t(ok), tone: "ok" });
      await load();
    } catch (e) {
      const code = e instanceof ApiError ? e.code : "";
      setBanner({ text: ERRORS[code] ? t(ERRORS[code]) : t("loadFailed"), tone: "error" });
    } finally {
      setBusy(null);
    }
  };

  const title = <Stack.Screen options={{ title: t("claims") }} />;
  if (failed) return <Screen>{title}<Notice tone="error">{t("loadFailed")}</Notice></Screen>;
  if (!data) return <>{title}<Loading /></>;
  const locale = lang === "en" ? "en-US" : "es-BO";
  const tone = (s: Claim["status"]) => ({ OPEN: c.naranja.text, REFUNDING: c.turquesa.text, REFUNDED: c.verde.text, REJECTED: c.muted, ESCALATED: c.fucsia.text, RESOLVED: c.verde.text })[s];

  const form = newFor ? (
    <Card>
      <H2>{t("clNewTitle")}</H2>
      <P muted>{t("clNewHint")}</P>
      <Chips<KindValue>
        value={kind}
        onChange={setKind}
        options={[
          { value: "DOUBLE_CHARGE", label: t("clK_DOUBLE_CHARGE") },
          { value: "WRONG_AMOUNT", label: t("clK_WRONG_AMOUNT") },
          { value: "NOT_RECOGNIZED", label: t("clK_NOT_RECOGNIZED") },
          { value: "OTHER", label: t("clK_OTHER") },
        ]}
      />
      <Field label={t("clMessage")} value={message} onChangeText={setMessage} multiline maxLength={500} />
      <Button
        title={t("clSend")}
        loading={busy === "new"}
        onPress={() =>
          run("new", async () => {
            await api(`/contributions/${newFor}/claim`, { body: { kind, message } });
            setMessage("");
            router.replace(`/groups/${id}/claims`);
          }, "clSent")
        }
      />
    </Card>
  ) : null;

  return (
    <Screen width={wide ? 1240 : 640}>
      {title}
      <P muted>{data.isOrganizer ? t("clHintOrganizer") : t("clHint")}</P>
      <TwoCol side={<Guide title={t("clGuide")} steps={[{ title: t("clG1"), body: t("clG1b") }, { title: t("clG2"), body: t("clG2b") }, { title: t("clG3"), body: t("clG3b") }, { title: t("clG4"), body: t("clG4b") }]} note={t("clNote")} />}>
      {banner && <Notice tone={banner.tone}>{banner.text}</Notice>}
      {form}
      {data.claims.length === 0 && !newFor && (
        <Empty
          icon="aprobar"
          tone="verde"
          title={t("emClaims")}
          body={data.isOrganizer ? t("emClaimsOrg") : t("clEmptyMember")}
          action={data.isOrganizer ? undefined : { label: t("emGoPayments"), onPress: () => router.navigate(`/groups/${id}/payments` as any) }}
        />
      )}
      {data.claims.map((cl) => (
        <Card key={cl.id}>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            <Badge text={t(`clS_${cl.status}` as Key)} color={tone(cl.status)} />
            <Badge text={cl.kind === "PAYPAL_DISPUTE" ? t("clK_PAYPAL_DISPUTE") : t(`clK_${cl.kind}` as Key)} color={c.ink} />
          </View>
          <H2>
            {data.isOrganizer ? `${cl.claimant} · ` : ""}
            {cl.round ? `${t("round")} ${cl.round} · ` : ""}
            {money(cl.amountCents)}
          </H2>
          {cl.message ? <P>{cl.message}</P> : null}
          {cl.note ? (
            <View style={{ borderLeftWidth: 3, borderColor: c.line, paddingLeft: 12 }}>
              <P muted>{cl.note}</P>
            </View>
          ) : null}
          {cl.status === "REJECTED" && !data.isOrganizer ? <Notice>{t("clGoPayPal")}</Notice> : null}
          {cl.status === "ESCALATED" ? (
            <Notice>
              {t("clWithPayPal")}
              {cl.paypalDisputeId ? ` (${cl.paypalDisputeId})` : ""}
            </Notice>
          ) : null}
          <View style={{ gap: 2 }}>
            {cl.timeline.map((e, i) => (
              <Text key={i} style={{ fontFamily: fonts.body, fontSize: 13.5, lineHeight: 19, color: c.muted }}>
                {new Date(e.at).toLocaleString(locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} · {e.text}
              </Text>
            ))}
          </View>
          {cl.canRefund || cl.canReject ? (
            answering === cl.id ? (
              <View style={{ gap: 8 }}>
                <Field label={t("clAnswer")} hint={t("clAnswerHint")} value={note[cl.id] ?? ""} onChangeText={(v) => setNote((n) => ({ ...n, [cl.id]: v }))} multiline maxLength={500} />
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Button compact kind="secondary" title={t("cancelNo")} onPress={() => setAnswering(null)} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Button
                      compact
                      title={t("clSendAnswer")}
                      loading={busy === cl.id + "n"}
                      disabled={!(note[cl.id] ?? "").trim()}
                      onPress={() => run(cl.id + "n", async () => { await api(`/claims/${cl.id}/reject`, { body: { note: note[cl.id] } }); setAnswering(null); }, "clAnswered")}
                    />
                  </View>
                </View>
              </View>
            ) : (
              <View style={{ gap: 8 }}>
                <P muted>{t("clRefundHint")}</P>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Button compact title={t("clRefund")} loading={busy === cl.id} onPress={() => run(cl.id, () => api(`/claims/${cl.id}/refund`, { body: {} }), "clRefunded")} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Button compact kind="secondary" title={t("clExplain")} onPress={() => setAnswering(cl.id)} />
                  </View>
                </View>
              </View>
            )
          ) : null}
        </Card>
      ))}
      </TwoCol>
    </Screen>
  );
}
