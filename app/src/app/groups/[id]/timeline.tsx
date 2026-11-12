/**
 * Turn timeline: who receives the pot in which round. The organizer drags a turn onto another member to swap them;
 * when someone falls behind, the assistant's proposal to move their turn shows up here to approve or reject.
 */
import { useCallback, useState } from "react";
import { View } from "react-native";
import { Stack, useFocusEffect, useLocalSearchParams } from "expo-router";
import { Badge, Button, Card, H2, Loading, Notice, P, Screen } from "@/components/ui";
import { TurnTimeline } from "@/components/turn-timeline";
import { Legend } from "@/components/legend";
import { ROUND_HUE } from "@/lib/sched-colors";
import type { TimelineMember, TimelineRound } from "@/components/turn-timeline-types";
import { useI18n, type Key } from "@/lib/i18n";
import { Empty } from "@/components/empty";
import { useScheme } from "@/lib/scheme";
import { api, ApiError } from "@/lib/api";

type Group = {
  id: string;
  name: string;
  status: string;
  startsAt: string | null;
  isOrganizer: boolean;
  myMembershipId: string;
  memberships: { id: string; turn: number | null; user: { id: string; name: string } }[];
  rounds: (TimelineRound & { contributions: { status: string }[] })[];
  actions: { id: string; type: string; summary: string; payload: { reason?: string; noAuto?: boolean } }[];
};

const ERRORS: Record<string, Key> = {
  round_not_upcoming: "tlErrRound",
  same_member: "tlErrSame",
  group_not_active: "tlErrActive",
  organizer_only: "err_organizer_only",
};

export default function Timeline() {
  const { c } = useScheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, lang } = useI18n();
  const [g, setG] = useState<Group | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ text: string; tone: "ok" | "error" } | null>(null);

  const load = useCallback(() => api<Group>(`/groups/${id}`).then(setG).catch(() => setFailed(true)), [id]);
  useFocusEffect(
    useCallback(() => {
      load();
      // live: a payment, a swap or a proposal moves the bars without reloading
      const timer = setInterval(load, 5000);
      return () => clearInterval(timer);
    }, [load])
  );

  const title = <Stack.Screen options={{ title: t("timeline") }} />;
  if (failed) return <Screen>{title}<Notice tone="error">{t("loadFailed")}</Notice></Screen>;
  if (!g) return <>{title}<Loading /></>;

  const fail = (e: unknown) => {
    const code = e instanceof ApiError ? e.code : "";
    setBanner({ text: ERRORS[code] ? t(ERRORS[code]) : t("loadFailed"), tone: "error" });
  };
  const swap = async (a: string, b: string) => {
    setBanner(null);
    try {
      await api(`/groups/${g.id}/swap`, { body: { a, b } });
      setBanner({ text: t("tlSwapped"), tone: "ok" });
      await load();
    } catch (e) {
      fail(e);
      throw e;
    }
  };
  const decide = async (actionId: string, approve: boolean) => {
    setBusy(actionId + approve);
    setBanner(null);
    try {
      await api(`/actions/${actionId}/${approve ? "approve" : "reject"}`, { body: {} });
      setBanner({ text: approve ? t("tlSwapped") : t("tlRejected"), tone: "ok" });
      await load();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  };

  const members: TimelineMember[] = g.memberships.map((m) => ({ id: m.id, userId: m.user.id, name: m.user.name, turn: m.turn }));
  const proposals = g.isOrganizer ? g.actions.filter((a) => a.type === "SWAP_TURNS") : [];
  const running = g.status === "ACTIVE" || g.status === "FINISHED";

  return (
    <Screen width={1100}>
      {title}
      <P muted>{g.isOrganizer && g.status === "ACTIVE" ? t("tlHintOrganizer") : t("tlHint")}</P>
      {banner && <Notice tone={banner.tone}>{banner.text}</Notice>}
      {proposals.map((a) => (
        <Card key={a.id} style={{ borderColor: c.fucsia.fill }}>
          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
            <Badge text={a.payload.noAuto ? t("tlProposal") : t("tlRequest")} color={c.fucsia.text} />
          </View>
          <H2>{a.summary}</H2>
          <P muted>{a.payload.noAuto ? t("tlProposalHint") : t("tlRequestHint")}</P>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Button compact title={t("approve")} loading={busy === a.id + "true"} onPress={() => decide(a.id, true)} />
            </View>
            <View style={{ flex: 1 }}>
              <Button compact kind="secondary" title={t("reject")} loading={busy === a.id + "false"} onPress={() => decide(a.id, false)} />
            </View>
          </View>
        </Card>
      ))}
      {running ? (
        <TurnTimeline
          rounds={g.rounds.map((r) => ({ ...r, paid: r.contributions.filter((x) => x.status !== "PENDING").length, total: r.contributions.length }))}
          members={members}
          startsAt={g.startsAt}
          myMembershipId={g.myMembershipId}
          canEdit={g.isOrganizer && g.status === "ACTIVE"}
          dark={c.scheme === "dark"}
          locale={lang === "en" ? "en-US" : "es-BO"}
          labels={{
            member: t("members"),
            round: t("round"),
            turnWord: t("schTurn"),
            roundOf: (n, total) => `${t("round")} ${n} ${t("of")} ${total}`,
            toolbar: { now: t("schNow"), search: t("schSearch"), mine: t("schMine") },
            due: t("due"),
            mine: t("you"),
            shortStatus: { UPCOMING: t("tlUpcoming"), COLLECTING: t("tlCollectingShort"), READY: t("tlReady"), PAID_OUT: t("tlPaidOut") },
            status: { UPCOMING: t("tlUpcoming"), COLLECTING: t("tlCollecting"), READY: t("tlReady"), PAID_OUT: t("tlPaidOut") },
            confirm: (a, b) => `${t("tlConfirm")} ${a} ↔ ${b}?\n\n${t("tlConfirmNote")}`,
            cannotSwap: t("tlCannotSwap"),
          }}
          onSwap={swap}
        />
      ) : (
        <Empty icon="turno" tone="amarillo" title={t("emTurns")} body={t("emTurnsBody")} />
      )}
      {running && (
        <Legend
          note={g.isOrganizer && g.status === "ACTIVE" ? t("tlOnlyUpcoming") : undefined}
          items={[
            { hue: ROUND_HUE.UPCOMING, label: t("tlUpcoming") },
            { hue: ROUND_HUE.COLLECTING, label: t("tlCollecting") },
            { hue: ROUND_HUE.READY, label: t("tlReady") },
            { hue: ROUND_HUE.PAID_OUT, label: t("tlPaidOut") },
          ]}
        />
      )}
    </Screen>
  );
}
