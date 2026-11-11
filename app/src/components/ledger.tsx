/**
 * Payment history: one row per PayPal movement, grouped by day, newest first.
 * The server already decided what this person may see; this file only draws it.
 */
import { Text, View } from "react-native";
import { Icon, type IconName } from "@/components/icons";
import { SteppedBox } from "@/components/stepped";
import { money } from "@/lib/api";
import { useI18n, type Key } from "@/lib/i18n";
import { useScheme } from "@/lib/scheme";
import { fonts, space, type Palette } from "@/lib/theme";

export type LedgerEntry = {
  id: string;
  at: string;
  type: "CONTRIBUTION" | "DEPOSIT" | "REFUND" | "GUARANTEE_COVER" | "UNPAID" | "POT" | "GUARANTEE_RETURN" | "COMPENSATION";
  direction: "in" | "out" | "none";
  status: "DONE" | "IN_PROGRESS" | "FAILED";
  amountCents: number;
  lateFeeCents: number;
  feeCents: number | null;
  membershipId: string;
  memberName: string;
  round: number | null;
  ref: string | null;
  mine: boolean;
  groupName?: string;
};

type Tone = "verde" | "amarillo" | "rojo" | "turquesa" | "naranja";
const LOOK: Record<LedgerEntry["type"], { icon: IconName; tone: Tone }> = {
  CONTRIBUTION: { icon: "pagar", tone: "verde" },
  DEPOSIT: { icon: "pagar", tone: "turquesa" },
  REFUND: { icon: "atras", tone: "naranja" },
  GUARANTEE_COVER: { icon: "garantia", tone: "turquesa" },
  UNPAID: { icon: "rechazar", tone: "rojo" },
  POT: { icon: "pozo", tone: "amarillo" },
  GUARANTEE_RETURN: { icon: "garantia", tone: "verde" },
  COMPENSATION: { icon: "pozo", tone: "naranja" },
};

/** Three plain figures at the top of a history screen. */
export function LedgerSummary({ items }: { items: { label: string; cents: number; tone?: Tone }[] }) {
  const { c } = useScheme();
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space(3) }}>
      {items.map((it) => (
        <SteppedBox key={it.label} fill={c.surface} stroke={c.line} step={4} style={{ flexGrow: 1, flexBasis: 150, padding: space(4), gap: 4 }}>
          <View accessible accessibilityLabel={`${it.label}: ${money(it.cents)}`}>
            <Text style={{ fontFamily: fonts.body, fontSize: 14, color: c.muted }}>{it.label}</Text>
            <Text style={{ fontFamily: fonts.display, fontSize: 22, lineHeight: 30, color: it.tone ? c[it.tone].text : c.ink, fontVariant: ["tabular-nums"] }}>{money(it.cents)}</Text>
          </View>
        </SteppedBox>
      ))}
    </View>
  );
}

/**
 * `personal`: the screen is about one person, so amounts carry a sign
 * (− what I paid, + what I received) and the row names the group instead of the member.
 */
export function LedgerList({ entries, locale, personal }: { entries: LedgerEntry[]; locale: string; personal?: boolean }) {
  const { c } = useScheme();
  const days: { label: string; rows: LedgerEntry[] }[] = [];
  for (const e of entries) {
    const label = new Date(e.at).toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long" });
    const last = days[days.length - 1];
    if (last && last.label === label) last.rows.push(e);
    else days.push({ label, rows: [e] });
  }
  return (
    <View style={{ gap: space(5) }}>
      {days.map((d) => (
        <View key={d.label} style={{ gap: space(1) }}>
          <Text accessibilityRole="header" style={{ fontFamily: fonts.bodyBold, fontSize: 14, color: c.muted, textTransform: "capitalize" }}>
            {d.label}
          </Text>
          <SteppedBox fill={c.surface} stroke={c.line} step={4} style={{ paddingHorizontal: space(4) }}>
            {d.rows.map((e, i) => (
              <Row key={e.id} e={e} c={c} locale={locale} personal={personal} last={i === d.rows.length - 1} />
            ))}
          </SteppedBox>
        </View>
      ))}
    </View>
  );
}

function Row({ e, c, locale, personal, last }: { e: LedgerEntry; c: Palette; locale: string; personal?: boolean; last: boolean }) {
  const { t } = useI18n();
  const look = LOOK[e.type];
  const failed = e.status === "FAILED";
  const color = failed ? c.rojo.text : c[look.tone].text;
  const who = personal ? e.groupName ?? "" : e.mine ? `${e.memberName} (${t("you")})` : e.memberName;
  const title = `${t(`lg_${e.type}` as Key)}${e.round ? `, ${t("round").toLowerCase()} ${e.round}` : ""}`;
  const sign = !personal || e.direction === "none" ? "" : e.direction === "in" ? "− " : "+ ";
  const notes = [
    new Date(e.at).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" }),
    e.lateFeeCents > 0 ? `${t("lgLateFee")} ${money(e.lateFeeCents)}` : null,
    e.feeCents != null ? `${t("lgFee")} ${money(e.feeCents)}` : null,
    e.type === "POT" && e.status === "FAILED" ? t("lgFailed") : null,
    e.status === "IN_PROGRESS" ? t("lgInProgress") : null,
    e.direction === "none" ? t("lgNoPaypal") : null,
  ].filter(Boolean);
  return (
    <View
      accessible
      accessibilityLabel={`${title}, ${who}, ${money(e.amountCents)}. ${notes.join(", ")}`}
      style={{ flexDirection: "row", gap: 12, paddingVertical: space(3), borderBottomWidth: last ? 0 : 1, borderColor: c.line }}
    >
      <View style={{ width: 36, height: 36, alignItems: "center", justifyContent: "center", backgroundColor: (failed ? c.rojo.fill : c[look.tone].fill) + "26" }}>
        <Icon name={look.icon} size={20} color={color} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
          <Text style={{ flex: 1, fontFamily: fonts.bodyBold, fontSize: 15.5, lineHeight: 21, color: c.ink }}>{title}</Text>
          <Text style={{ fontFamily: fonts.display, fontSize: 15, color: failed ? c.muted : c.ink, fontVariant: ["tabular-nums"], textDecorationLine: e.type === "UNPAID" ? "line-through" : "none" }}>
            {sign}
            {money(e.amountCents)}
          </Text>
        </View>
        {who ? <Text style={{ fontFamily: fonts.body, fontSize: 14.5, color: c.ink }}>{who}</Text> : null}
        <Text style={{ fontFamily: fonts.body, fontSize: 13.5, lineHeight: 19, color: c.muted }}>{notes.join("  ·  ")}</Text>
        {e.ref ? (
          <Text selectable style={{ fontFamily: fonts.body, fontSize: 12.5, color: c.muted }}>
            PayPal {t("ppRef")} {e.ref}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
