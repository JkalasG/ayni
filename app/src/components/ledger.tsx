/**
 * Payment history: one row per PayPal movement, grouped by day, newest first.
 * The server already decided what this person may see; this file only draws it.
 */
import type { ReactNode } from "react";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Icon, type IconName } from "@/components/icons";
import { SteppedBox } from "@/components/stepped";
import { money } from "@/lib/api";
import { useI18n, type Key } from "@/lib/i18n";
import { useLayout } from "@/lib/layout";
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
export function LedgerList({ entries, locale, personal, onReport }: { entries: LedgerEntry[]; locale: string; personal?: boolean; onReport?: (contributionId: string) => void }) {
  const { c } = useScheme();
  const { wide } = useLayout();
  // The table needs room for its seven columns: in a narrower space the same record is the list by day.
  const [width, setWidth] = useState<number | null>(null);
  if (wide && (width == null || width >= 900))
    return (
      <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        <LedgerTable entries={entries} locale={locale} personal={personal} onReport={onReport} />
      </View>
    );
  const days: { label: string; rows: LedgerEntry[] }[] = [];
  for (const e of entries) {
    const at = new Date(e.at);
    const raw = at.toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long", ...(at.getFullYear() !== new Date().getFullYear() ? { year: "numeric" as const } : {}) });
    const label = raw.charAt(0).toUpperCase() + raw.slice(1);
    const last = days[days.length - 1];
    if (last && last.label === label) last.rows.push(e);
    else days.push({ label, rows: [e] });
  }
  return (
    <View style={{ gap: space(5) }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {days.map((d) => (
        <View key={d.label} style={{ gap: space(1) }}>
          <Text accessibilityRole="header" style={{ fontFamily: fonts.bodyBold, fontSize: 14, color: c.muted }}>
            {d.label}
          </Text>
          <SteppedBox fill={c.surface} stroke={c.line} step={4} style={{ paddingHorizontal: space(4) }}>
            {d.rows.map((e, i) => (
              <Row key={e.id} e={e} c={c} locale={locale} personal={personal} last={i === d.rows.length - 1} onReport={onReport} />
            ))}
          </SteppedBox>
        </View>
      ))}
    </View>
  );
}

/** Wide screens: the record as a table, one line per movement, so dates, amounts and states line up. */
function LedgerTable({ entries, locale, personal, onReport }: { entries: LedgerEntry[]; locale: string; personal?: boolean; onReport?: (contributionId: string) => void }) {
  const { c } = useScheme();
  const { t } = useI18n();
  // the fixed columns must leave room for the flexible one (member / circle) on a 1280 px screen with the sidebar
  const W = { date: 84, concept: 176, status: 112, ref: 142, fee: 60, amount: 96 };
  const head = { fontFamily: fonts.bodyBold, fontSize: 13, color: c.muted, letterSpacing: 0.3, textTransform: "uppercase" as const };
  const cols = (cells: [number | undefined, ReactNode, "left" | "right"][], bg?: string, border?: boolean) => (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space(4), paddingHorizontal: space(4), paddingVertical: space(3), backgroundColor: bg, borderBottomWidth: border ? 1 : 0, borderColor: c.line }}>
      {cells.map(([w, node, align], i) => (
        <View key={i} style={{ width: w, flex: w ? undefined : 1, minWidth: w ? 0 : 96, overflow: "hidden", alignItems: align === "right" ? "flex-end" : "flex-start" }}>
          {node}
        </View>
      ))}
    </View>
  );
  return (
    <SteppedBox fill={c.surface} stroke={c.line} step={5} style={{ overflow: "hidden" }}>
      {cols(
        [
          [W.date, <Text numberOfLines={1} style={head}>{t("lgColDate")}</Text>, "left"],
          [W.concept, <Text numberOfLines={1} style={head}>{t("lgColConcept")}</Text>, "left"],
          [undefined, <Text numberOfLines={1} style={head}>{personal ? t("lgColGroup") : t("lgColMember")}</Text>, "left"],
          [W.status, <Text numberOfLines={1} style={head}>{t("lgColStatus")}</Text>, "left"],
          [W.ref, <Text numberOfLines={1} style={head}>{t("lgColRef")}</Text>, "left"],
          [W.fee, <Text numberOfLines={1} style={head}>{t("lgColFee")}</Text>, "right"],
          [W.amount, <Text numberOfLines={1} style={head}>{t("lgColAmount")}</Text>, "right"],
        ],
        c.surfaceAlt,
        true
      )}
      {entries.map((e, i) => {
        const look = LOOK[e.type];
        const failed = e.status === "FAILED";
        const tone = failed ? c.rojo : c[look.tone];
        const at = new Date(e.at);
        const who = personal ? e.groupName ?? "" : e.mine ? `${e.memberName} (${t("you")})` : e.memberName;
        const sign = !personal || e.direction === "none" ? "" : e.direction === "in" ? "− " : "+ ";
        const st = failed ? { text: t("lgStFailed"), color: c.rojo.text } : e.status === "IN_PROGRESS" ? { text: t("lgStProgress"), color: c.naranja.text } : { text: t("lgStDone"), color: c.verde.text };
        const title = `${t(`lg_${e.type}` as Key)}${e.round ? `, ${t("round").toLowerCase()} ${e.round}` : ""}`;
        return (
          <View key={e.id} accessible accessibilityLabel={`${title}, ${who}, ${money(e.amountCents)}, ${st.text}`}>
            {cols(
              [
                [
                  W.date,
                  <View>
                    <Text style={{ fontFamily: fonts.bodyBold, fontSize: 14.5, color: c.ink }}>{at.toLocaleDateString(locale, { day: "numeric", month: "short", ...(at.getFullYear() !== new Date().getFullYear() ? { year: "numeric" as const } : {}) })}</Text>
                    <Text style={{ fontFamily: fonts.body, fontSize: 13, color: c.muted }}>{at.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })}</Text>
                  </View>,
                  "left",
                ],
                [
                  W.concept,
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                    <View style={{ width: 30, height: 30, alignItems: "center", justifyContent: "center", backgroundColor: tone.fill + "26" }}>
                      <Icon name={look.icon} size={17} color={tone.text} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontFamily: fonts.bodyBold, fontSize: 15, color: c.ink }}>{title}</Text>
                      {e.lateFeeCents > 0 ? <Text style={{ fontFamily: fonts.body, fontSize: 13, color: c.muted }}>{t("lgLateFee")} {money(e.lateFeeCents)}</Text> : null}
                      {onReport && e.mine && e.type === "CONTRIBUTION" && e.id.startsWith("c_") ? (
                        <Pressable accessibilityRole="button" onPress={() => onReport(e.id.slice(2))}>
                          <Text style={{ fontFamily: fonts.bodyBold, fontSize: 13, color: c.fucsia.text }}>{t("clReport")}</Text>
                        </Pressable>
                      ) : null}
                    </View>
                  </View>,
                  "left",
                ],
                [undefined, <Text numberOfLines={2} style={{ fontFamily: fonts.body, fontSize: 14.5, lineHeight: 19, color: c.ink }}>{who}</Text>, "left"],
                [
                  W.status,
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
                    <View style={{ width: 8, height: 8, transform: [{ rotate: "45deg" }], backgroundColor: st.color }} />
                    <Text style={{ fontFamily: fonts.bodyBold, fontSize: 14, color: st.color }}>{st.text}</Text>
                  </View>,
                  "left",
                ],
                [W.ref, e.ref ? <Text selectable numberOfLines={1} style={{ fontFamily: fonts.body, fontSize: 13, color: c.muted }}>{e.ref}</Text> : <Text style={{ fontFamily: fonts.body, fontSize: 13, color: c.muted }}>{e.direction === "none" ? t("lgNoPaypal") : "—"}</Text>, "left"],
                [W.fee, <Text style={{ fontFamily: fonts.body, fontSize: 14, color: c.muted, fontVariant: ["tabular-nums"] }}>{e.feeCents != null ? money(e.feeCents) : "—"}</Text>, "right"],
                [
                  W.amount,
                  <Text style={{ fontFamily: fonts.display, fontSize: 15.5, color: failed ? c.muted : c.ink, fontVariant: ["tabular-nums"], textDecorationLine: e.type === "UNPAID" ? "line-through" : "none" }}>
                    {sign}
                    {money(e.amountCents)}
                  </Text>,
                  "right",
                ],
              ],
              i % 2 ? c.surfaceAlt : undefined,
              i < entries.length - 1
            )}
          </View>
        );
      })}
    </SteppedBox>
  );
}

function Row({ e, c, locale, personal, last, onReport }: { e: LedgerEntry; c: Palette; locale: string; personal?: boolean; last: boolean; onReport?: (contributionId: string) => void }) {
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
        {/* Only on my own paid contributions: that is what a claim is about. */}
        {onReport && e.mine && e.type === "CONTRIBUTION" && e.id.startsWith("c_") ? (
          <Pressable accessibilityRole="button" onPress={() => onReport(e.id.slice(2))} style={{ minHeight: 40, justifyContent: "center", alignSelf: "flex-start" }}>
            <Text style={{ fontFamily: fonts.bodyBold, fontSize: 14, color: c.fucsia.text }}>{t("clReport")}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
