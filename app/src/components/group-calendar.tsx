/**
 * The payment schedule of a group: every member's contribution to every round, plus who receives the pot and what has
 * been collected. On the web it is the Bryntum chart; the native app has no chart engine, so it keeps the woven grid
 * (see Tejido) in its place: the summary screen picks one or the other.
 */
import { useMemo } from "react";
import { View } from "react-native";
import { PaymentCalendar } from "@/components/payment-calendar";
import { Legend } from "@/components/legend";
import type { CalendarMember } from "@/components/payment-calendar-types";
import type { Group } from "@/lib/group";
import { useI18n } from "@/lib/i18n";
import { useScheme } from "@/lib/scheme";
import { money } from "@/lib/api";
import { CELL_HUE } from "@/lib/sched-colors";
import { space } from "@/lib/theme";

export function GroupCalendar({ g }: { g: Group }) {
  const { t, lang } = useI18n();
  const { c } = useScheme();
  // "now" moves forward with every refresh of the group (they come every few seconds)
  const now = useMemo(() => Date.now(), [g]);
  const members: CalendarMember[] = g.memberships.map((m) => ({ id: m.id, userId: m.user.id, name: m.user.name, turn: m.turn }));
  return (
    <View style={{ gap: space(4) }}>
      <PaymentCalendar
        rounds={g.rounds}
        members={members}
        startsAt={null}
        myMembershipId={g.myMembershipId}
        isOrganizer={g.isOrganizer}
        dark={c.scheme === "dark"}
        locale={lang === "en" ? "en-US" : "es-BO"}
        now={now}
        money={money}
        labels={{
          member: t("members"),
          round: t("round"),
          turnWord: t("schTurn"),
          summary: t("schCollected"),
          pot: t("pot"),
          potSub: t("schWhoReceives"),
          roundOf: (n, total) => `${t("round")} ${n} ${t("of")} ${total}`,
          toolbar: { now: t("schNow"), search: t("schSearch"), mine: t("schMine") },
          due: t("due"),
          mine: t("you"),
          receives: t("calReceives"),
          lateFee: t("calLateFee"),
          paidOn: t("calPaidOn"),
          short: { paid: t("calPaid"), covered: t("calCoveredShort"), pending: t("calPending"), late: t("calLate"), upcoming: t("tlUpcoming"), closed: t("calClosedShort") },
          state: { paid: t("calPaid"), covered: t("calCovered"), pending: t("calPending"), late: t("calLate"), upcoming: t("tlUpcoming"), closed: t("calClosed") },
        }}
      />
      <Legend
        note={g.isOrganizer ? t("calPrivacyOrganizer") : t("calPrivacy")}
        items={[
          { hue: "amarillo", label: `${t("pot")} · ${t("schWhoReceives").toLowerCase()}` },
          { hue: CELL_HUE.paid, label: t("calPaid") },
          { hue: CELL_HUE.pending, label: t("calPending") },
          { hue: CELL_HUE.late, label: t("calLate") },
          { hue: CELL_HUE.covered, label: t("calCovered") },
          { hue: CELL_HUE.closed, label: t("calClosed") },
          { hue: CELL_HUE.upcoming, label: t("tlUpcoming") },
        ]}
      />
    </View>
  );
}
