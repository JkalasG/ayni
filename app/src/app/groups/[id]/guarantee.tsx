/**
 * Guarantee timeline: when each member's guarantee was withheld, used, returned or refunded.
 * Private: the organizer sees every member, a member sees only their own (the server decides, this screen only draws).
 */
import { useCallback, useState } from "react";
import { Stack, useFocusEffect, useLocalSearchParams } from "expo-router";
import { Card, H2, Loading, Notice, P, Screen } from "@/components/ui";
import { GuaranteeTimeline } from "@/components/guarantee-timeline";
import { Legend } from "@/components/legend";
import { GUARANTEE_HUE } from "@/lib/sched-colors";
import type { GuaranteeItem, GuaranteeMember } from "@/components/guarantee-timeline-types";
import { useI18n } from "@/lib/i18n";
import { useScheme } from "@/lib/scheme";
import { api, money } from "@/lib/api";

type Data = {
  group: { id: string; name: string; startsAt: string | null; endsAt: string | null; status: string };
  isOrganizer: boolean;
  myMembershipId: string;
  members: GuaranteeMember[];
  items: GuaranteeItem[];
  now: string;
};

export default function Guarantee() {
  const { c } = useScheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, lang } = useI18n();
  const [d, setD] = useState<Data | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => api<Data>(`/groups/${id}/guarantee`).then(setD).catch(() => setFailed(true)), [id]);
  useFocusEffect(
    useCallback(() => {
      load();
      const timer = setInterval(load, 5000);
      return () => clearInterval(timer);
    }, [load])
  );

  const title = <Stack.Screen options={{ title: t("gtTitle") }} />;
  if (failed) return <Screen>{title}<Notice tone="error">{t("loadFailed")}</Notice></Screen>;
  if (!d) return <>{title}<Loading /></>;

  const held = d.members.reduce((s, m) => s + m.heldCents, 0);
  const hasHeld = d.items.some((i) => i.kind === "HELD");
  const anyFailed = d.items.some((i) => i.status === "FAILED");

  return (
    <Screen width={1100}>
      {title}
      <P muted>{d.isOrganizer ? t("gtHintOrganizer") : t("gtHint")}</P>
      <Card>
        <H2>{`${t("gtHeldNow")}: ${money(held)}`}</H2>
        <P muted>{t("gtPrivate")}</P>
      </Card>
      {anyFailed && <Notice tone="error">{t("gtNoteFailed")}</Notice>}
      {!hasHeld ? (
        <Notice>{held > 0 ? t("gtNoDetail") : t("gtEmpty")}</Notice>
      ) : (
        <GuaranteeTimeline
          items={d.items}
          members={d.members}
          startsAt={d.group.startsAt}
          endsAt={d.group.endsAt}
          myMembershipId={d.myMembershipId}
          dark={c.scheme === "dark"}
          locale={lang === "en" ? "en-US" : "es-BO"}
          now={new Date(d.now).getTime()}
          money={money}
          labels={{
            member: t("members"),
            round: t("round"),
            held: t("schHeld"),
            turnWord: t("schTurn"),
            toolbar: { now: t("schNow"), search: t("schSearch"), mine: t("schMine") },
            mine: t("you"),
            until: t("gtUntil"),
            stillHeld: t("gtStillHeld"),
            back: t("gtBack"),
            failed: t("gtFailed"),
            kind: { HELD: t("gtHeld"), USED: t("gtUsed"), RECOVERED: t("gtRecovered"), RETURNED: t("gtReturned"), REFUND: t("gtRefund") },
          }}
        />
      )}
      {hasHeld && (
        <Legend
          items={[
            { hue: GUARANTEE_HUE.HELD, label: t("gtHeld") },
            { hue: GUARANTEE_HUE.USED, label: t("gtUsed") },
            { hue: GUARANTEE_HUE.RECOVERED, label: t("gtRecovered") },
            { hue: GUARANTEE_HUE.RETURNED, label: t("gtReturned") },
            { hue: GUARANTEE_HUE.REFUND, label: t("gtRefund") },
          ]}
        />
      )}
    </Screen>
  );
}
