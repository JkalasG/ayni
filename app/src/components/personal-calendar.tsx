/**
 * Native fallback of the money calendar: Bryntum Calendar draws on the browser's DOM, so the app on a phone shows the
 * same data as a list of the next days, each with what goes out and what comes in (see personal-calendar.web.tsx).
 */
import { Pressable, Text, View } from "react-native";
import { Icon } from "@/components/icons";
import { SteppedBox } from "@/components/stepped";
import { byDay, dayKey, fromKey, signed } from "@/lib/personal-calendar";
import { useScheme } from "@/lib/scheme";
import { fonts, space } from "@/lib/theme";
import type { PersonalCalendarProps } from "./personal-calendar-types";

export function PersonalCalendar({ data, lang, selected, onSelect, money, labels }: PersonalCalendarProps) {
  const { c } = useScheme();
  const days = [...byDay(data.events).entries()].filter(([k]) => k >= dayKey(new Date(new Date(data.now).getTime() - 7 * 86_400_000))).sort(([a], [b]) => (a < b ? -1 : 1)).slice(0, 40);
  const sel = dayKey(selected);
  return (
    <View style={{ gap: space(3) }}>
      {days.map(([k, t]) => {
        const d = fromKey(k);
        const on = k === sel;
        return (
          <Pressable key={k} accessibilityRole="button" onPress={() => onSelect(d)}>
            <SteppedBox fill={on ? c.surfaceAlt : c.surface} stroke={on ? c.fucsia.fill : c.line} step={4} style={{ padding: space(4), gap: space(2) }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
                <Text style={{ flex: 1, fontFamily: fonts.bodyBold, fontSize: 15, color: c.ink }}>{d.toLocaleDateString(lang === "en" ? "en-US" : "es-BO", { weekday: "long", day: "numeric", month: "long" })}</Text>
                <Text style={{ fontFamily: fonts.display, fontSize: 15, color: t.netCents < 0 ? c.ink : c.verde.text, fontVariant: ["tabular-nums"] }}>
                  {t.netCents < 0 ? "−" : "+"}
                  {money(Math.abs(t.netCents))}
                </Text>
              </View>
              {t.events.map((e) => (
                <View key={e.id} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Icon name={e.kind === "pay" ? "pagar" : e.kind === "receive" ? "pozo" : "garantia"} size={16} color={e.kind === "receive" ? c.amarillo.text : e.kind === "return" ? c.turquesa.text : c.muted} />
                  <Text style={{ flex: 1, fontFamily: fonts.body, fontSize: 14, color: c.ink }}>
                    {e.groupName} · {labels.state[e.status] ?? e.status}
                    {e.estimated ? ` · ${labels.estimated}` : ""}
                  </Text>
                  <Text style={{ fontFamily: fonts.bodyBold, fontSize: 14, color: c.ink, fontVariant: ["tabular-nums"] }}>
                    {signed(e) < 0 || e.kind === "pay" ? "−" : "+"}
                    {money(e.amountCents)}
                  </Text>
                </View>
              ))}
            </SteppedBox>
          </Pressable>
        );
      })}
    </View>
  );
}
