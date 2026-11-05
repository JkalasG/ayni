/**
 * PayPal, visible. Every peso that moves in Ayni moves through PayPal, so the app shows it:
 * a status chip (connected / simulated) and a live activity feed built from the real captures
 * and payouts of the group. Nothing here is invented: each line comes from a contribution or a payout.
 */
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Icon, type IconName } from "@/components/icons";
import { SteppedBox } from "@/components/stepped";
import { money } from "@/lib/api";
import { useI18n, type Key } from "@/lib/i18n";
import { useScheme } from "@/lib/scheme";
import { fonts, space } from "@/lib/theme";

/** PayPal yellow chip: who moves the money, and whether this is simulated. */
export function PayPalChip({ mode, label }: { mode?: "live" | "mock"; label?: string }) {
  const { c } = useScheme();
  const { t } = useI18n();
  return (
    <SteppedBox fill={c.paypal} step={3} style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, minHeight: 30 }}>
      <Icon name="paypal" size={16} color={c.paypalInk} />
      <Text style={{ fontFamily: fonts.bodyBold, fontSize: 13, color: c.paypalInk }}>
        {label ?? "PayPal"}
        {mode === "mock" ? `  ·  ${t("ppSimulated")}` : ""}
      </Text>
    </SteppedBox>
  );
}

export type PPContribution = { id: string; membershipId: string; status: string; amountCents: number; lateFeeCents: number; paidAt?: string | null; paypalCaptureId?: string | null };
export type PPRound = { number: number; contributions: PPContribution[] };
export type PPPayout = { id: string; kind: string; status: string; amountCents: number; membershipId: string; round: number | null; createdAt: string };
export type PPEvent = {
  id: string;
  at: number;
  icon: IconName;
  tone: "verde" | "amarillo" | "rojo" | "turquesa" | "naranja";
  title: string;
  detail: string;
  amount?: number;
  ref?: string;
};

const short = (id?: string | null) => (id ? id.slice(-6).toUpperCase() : undefined);

/** Events of a group, newest first, built only from what PayPal actually settled. */
export function buildEvents(
  t: (k: Key) => string,
  rounds: PPRound[],
  payouts: PPPayout[],
  nameOf: (membershipId: string) => string
): PPEvent[] {
  const out: PPEvent[] = [];
  for (const r of rounds) {
    for (const x of r.contributions) {
      if ((x.status === "PAID" || x.status === "COVERED") && x.paidAt) {
        const covered = x.status === "COVERED";
        out.push({
          id: `c${x.id}`,
          at: new Date(x.paidAt).getTime(),
          icon: covered ? "garantia" : "pagar",
          tone: covered ? "turquesa" : "verde",
          title: covered ? t("ppGuarantee") : t("ppCaptured"),
          detail: `${nameOf(x.membershipId)}, ${t("round").toLowerCase()} ${r.number}`,
          amount: x.amountCents + x.lateFeeCents,
          ref: short(x.paypalCaptureId),
        });
      }
    }
  }
  for (const p of payouts) {
    if (p.kind === "COMPENSATION") continue;
    const ok = p.status === "SUCCEEDED" || p.status === "SENT";
    const bad = p.status === "FAILED";
    out.push({
      id: `p${p.id}`,
      at: new Date(p.createdAt).getTime(),
      icon: "pozo",
      tone: bad ? "rojo" : ok ? "amarillo" : "naranja",
      title: bad ? t("ppPayoutFailed") : p.status === "UNKNOWN" ? t("ppPayoutUnknown") : ok ? (p.kind === "POT" ? t("ppPayoutSent") : t("ppRetentionSent")) : t("ppPayoutPending"),
      detail: `${nameOf(p.membershipId)}${p.round ? `, ${t("round").toLowerCase()} ${p.round}` : ""}`,
      amount: p.amountCents,
    });
  }
  return out.sort((a, b) => b.at - a.at);
}

export function EventRow({ e, last, locale }: { e: PPEvent; last?: boolean; locale: string }) {
  const { c } = useScheme();
  const { t } = useI18n();
  const color = c[e.tone].text;
  // scripted demo events carry a small index instead of a real timestamp: no clock for those
  const time = e.at > 1e9 ? new Date(e.at).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" }) : null;
  return (
    <View
      accessible
      accessibilityLabel={`${e.title}, ${e.detail}${e.amount ? `, ${money(e.amount)}` : ""}`}
      style={{ flexDirection: "row", gap: 12, paddingVertical: space(3), borderBottomWidth: last ? 0 : 1, borderColor: c.line }}
    >
      <View style={{ width: 34, height: 34, alignItems: "center", justifyContent: "center", backgroundColor: c[e.tone].fill + "26" }}>
        <Icon name={e.icon} size={20} color={color} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
          <Text style={{ flex: 1, fontFamily: fonts.bodyBold, fontSize: 15, color }}>{e.title}</Text>
          {e.amount ? <Text style={{ fontFamily: fonts.display, fontSize: 14, color: c.ink, fontVariant: ["tabular-nums"] }}>{money(e.amount)}</Text> : null}
        </View>
        <Text style={{ fontFamily: fonts.body, fontSize: 14, color: c.muted }}>
          {e.detail}
          {e.ref ? `  ·  ${t("ppRef")} ${e.ref}` : ""}
        </Text>
        {time ? <Text style={{ fontFamily: fonts.body, fontSize: 12.5, color: c.muted }}>{time}</Text> : null}
      </View>
    </View>
  );
}

/** The group's PayPal panel: connection status, totals and the newest movements. */
export function PayPalActivity({
  rounds,
  payouts,
  nameOf,
  mode,
  recipientName,
  locale,
}: {
  rounds: PPRound[];
  payouts: PPPayout[];
  nameOf: (membershipId: string) => string;
  mode?: "live" | "mock";
  recipientName?: string;
  locale: string;
}) {
  const { c } = useScheme();
  const { t } = useI18n();
  const [all, setAll] = useState(false);
  const events = buildEvents(t, rounds, payouts, nameOf);
  const captured = events.filter((e) => e.icon === "pagar" || e.icon === "garantia").length;
  const shown = all ? events : events.slice(0, 5);
  return (
    <SteppedBox fill={c.surface} stroke={c.paypal} step={5} style={{ padding: space(4), gap: space(3) }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        <Text accessibilityRole="header" style={{ fontFamily: fonts.display, fontSize: 16, color: c.ink }}>
          {t("ppActivity")}
        </Text>
        <PayPalChip mode={mode} label={t("ppConnected")} />
      </View>
      <Text style={{ fontFamily: fonts.body, fontSize: 14.5, lineHeight: 21, color: c.muted }}>
        {recipientName ? `${t("ppFlowTo")} ${recipientName} ${t("ppFlowVia")}` : t("ppFlow")}
      </Text>
      {events.length === 0 ? (
        <View style={{ borderTopWidth: 1, borderColor: c.line, paddingTop: space(3) }}>
          <Text style={{ fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: c.muted }}>{t("ppEmpty")}</Text>
        </View>
      ) : (
        <View style={{ borderTopWidth: 1, borderColor: c.line }}>
          <Text style={{ fontFamily: fonts.bodyBold, fontSize: 13.5, color: c.muted, paddingTop: space(2) }}>
            {captured} {t("ppCapturedCount")}
          </Text>
          {shown.map((e, i) => (
            <EventRow key={e.id} e={e} locale={locale} last={i === shown.length - 1} />
          ))}
          {events.length > 5 && (
            <Pressable accessibilityRole="button" onPress={() => setAll((v) => !v)} style={{ minHeight: 44, justifyContent: "center" }}>
              <Text style={{ fontFamily: fonts.bodyBold, fontSize: 15, color: c.fucsia.text }}>{all ? t("ppShowLess") : `${t("ppShowAll")} (${events.length})`}</Text>
            </Pressable>
          )}
        </View>
      )}
    </SteppedBox>
  );
}
