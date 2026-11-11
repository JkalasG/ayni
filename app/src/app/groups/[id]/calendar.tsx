/**
 * Payment calendar: who has paid which round. Read-only. Each row is a member, each bar a round.
 * Privacy is the same as everywhere in Ayni: others only see "paid" or "pending"; "late", the guarantee being used and
 * late fees are shown only to the person and the organizer (the server already hides the rest).
 */
import { useCallback, useState } from "react";
import { Stack, useFocusEffect, useLocalSearchParams } from "expo-router";
import { Card, H2, Loading, Notice, P, Screen } from "@/components/ui";
import { PaymentCalendar } from "@/components/payment-calendar";
import type { CalendarRound, CalendarMember } from "@/components/payment-calendar-types";
import { cellState } from "@/lib/calendar";
import { useI18n } from "@/lib/i18n";
import { useScheme } from "@/lib/scheme";
import { api, money } from "@/lib/api";

type Group = {
  id: string;
  status: string;
  startsAt: string | null;
  isOrganizer: boolean;
  myMembershipId: string;
  memberships: { id: string; turn: number | null; user: { name: string } }[];
  rounds: CalendarRound[];
};

export default function Calendar() {
  const { c } = useScheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, lang } = useI18n();
  const [g, setG] = useState<Group | null>(null);
  const [failed, setFailed] = useState(false);
  const [now, setNow] = useState(Date.now());

  const load = useCallback(
    () =>
      api<Group>(`/groups/${id}`)
        .then((x) => {
          setG(x);
          setNow(Date.now());
        })
        .catch(() => setFailed(true)),
    [id]
  );
  useFocusEffect(
    useCallback(() => {
      load();
      // live: a payment changes the color of its bar without reloading
      const timer = setInterval(load, 5000);
      return () => clearInterval(timer);
    }, [load])
  );

  const title = <Stack.Screen options={{ title: t("calendar") }} />;
  if (failed) return <Screen>{title}<Notice tone="error">{t("loadFailed")}</Notice></Screen>;
  if (!g) return <Loading />;

  const running = g.status === "ACTIVE" || g.status === "FINISHED";
  const members: CalendarMember[] = g.memberships.map((m) => ({ id: m.id, name: m.user.name, turn: m.turn }));
  // The round that is collecting now: how many have paid (the same number everyone already sees).
  const current = g.rounds.find((r) => r.status === "COLLECTING") ?? g.rounds.find((r) => r.status === "READY");
  const paid = current ? current.contributions.filter((x) => x.status === "PAID" || x.status === "COVERED").length : 0;
  const viewer = { isOrganizer: g.isOrganizer, myMembershipId: g.myMembershipId };
  const myCell = current?.contributions.find((x) => x.membershipId === g.myMembershipId);
  const myState = current && myCell ? cellState(myCell, current, viewer, now) : null;

  return (
    <Screen width={1100}>
      {title}
      <P muted>{t("calHint")}</P>
      {running && current && (
        <Card>
          <H2>{`${t("round")} ${current.number}: ${paid} / ${current.contributions.length} ${t("calPaidCount")}`}</H2>
          {myState === "late" ? <Notice tone="error">{t("calYouLate")}</Notice> : myState === "pending" ? <P muted>{t("calYouPending")}</P> : null}
        </Card>
      )}
      {running ? (
        <PaymentCalendar
          rounds={g.rounds}
          members={members}
          startsAt={g.startsAt}
          myMembershipId={g.myMembershipId}
          isOrganizer={g.isOrganizer}
          dark={c.scheme === "dark"}
          locale={lang === "en" ? "en-US" : "es-BO"}
          now={now}
          money={money}
          labels={{
            member: t("members"),
            round: t("round"),
            due: t("due"),
            mine: t("you"),
            receives: t("calReceives"),
            lateFee: t("calLateFee"),
            paidOn: t("calPaidOn"),
            state: { paid: t("calPaid"), covered: t("calCovered"), pending: t("calPending"), late: t("calLate"), upcoming: t("tlUpcoming"), closed: t("calClosed") },
          }}
        />
      ) : (
        <Notice>{t("tlNotStarted")}</Notice>
      )}
      {running && <P muted>{g.isOrganizer ? t("calLegendOrganizer") : t("calLegend")}</P>}
    </Screen>
  );
}
