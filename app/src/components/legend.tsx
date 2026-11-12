import { Text, View } from "react-native";
import { SteppedBox } from "@/components/stepped";
import { hueOf, type SchedHue } from "@/lib/sched-colors";
import { useScheme } from "@/lib/scheme";
import { fonts, space } from "@/lib/theme";

/** What each bar color means, drawn with the same colors as the chart. The word always comes with the color. */
export function Legend({ items, note }: { items: { hue: SchedHue; label: string }[]; note?: string }) {
  const { c } = useScheme();
  return (
    <View style={{ gap: space(3) }}>
      <View accessibilityRole="list" style={{ flexDirection: "row", flexWrap: "wrap", columnGap: space(5), rowGap: space(2) }}>
        {items.map((i) => {
          const h = hueOf(c, i.hue);
          return (
            <View key={i.label} accessibilityRole="text" style={{ flexDirection: "row", alignItems: "center", gap: 8, minHeight: 28 }}>
              <SteppedBox fill={h.fill + "55"} stroke={h.fill} step={2} style={{ width: 22, height: 14 }} />
              <Text style={{ fontFamily: fonts.body, fontSize: 14, color: c.ink }}>{i.label}</Text>
            </View>
          );
        })}
      </View>
      {note ? <Text style={{ fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: c.muted }}>{note}</Text> : null}
    </View>
  );
}
