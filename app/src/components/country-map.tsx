/**
 * Explore by country: a world map embroidered as a stitch grid (2° per stitch, from Natural Earth).
 * Countries with open pasanakus are stitched in gold, the selected one in fuchsia, and a dashed
 * thread joins a group's country to the countries its members pay from.
 * The same choice is always available as a text list of chips (see Explore), so the map is never
 * the only way in.
 */
import { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { useI18n } from "@/lib/i18n";
import { useScheme } from "@/lib/scheme";
import { ANCHOR, countryName, type Country } from "@/lib/countries";
import { CELL_COUNTRY, WORLD, WORLD_ROWS } from "@/lib/world-grid";
import { fonts } from "@/lib/theme";

const stitch = (x: number, y: number) => `M${x + 0.12} ${y + 0.12}h0.76v0.76h-0.76z`;

/** One path per kind of cell: plain land, and each country Ayni works in. */
function buildPaths() {
  let land = "";
  const byCountry: Record<string, string> = {};
  WORLD_ROWS.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === ".") continue;
      if (ch === "#") land += stitch(x, y);
      else {
        const code = CELL_COUNTRY[ch];
        byCountry[code] = (byCountry[code] ?? "") + stitch(x, y);
      }
    }
  });
  return { land, byCountry };
}
let cached: ReturnType<typeof buildPaths> | null = null;

/** lon/lat to grid units */
const toGrid = ([lon, lat]: [number, number]) => ({ x: (lon + 180) / WORLD.step, y: (WORLD.top - lat) / WORLD.step });

export function CountryMap({
  counts,
  links,
  selected,
  onSelect,
  compact = false,
}: {
  counts: Record<string, number>;
  /** [group country, member country] for pasanakus that cross borders */
  links: [string, string][];
  selected: string | null;
  onSelect: (country: string | null) => void;
  /** phone: show the Americas, Europe and Africa only, so Bolivia stays big enough to see */
  compact?: boolean;
}) {
  const { c } = useScheme();
  const { lang } = useI18n();
  const [w, setW] = useState(0);
  const paths = useMemo(() => (cached ??= buildPaths()), []);

  // visible window in grid columns/rows (the far south and Antarctica are already cut)
  const view = compact ? { x0: 22, x1: 112, y0: 4, y1: WORLD.rows } : { x0: 0, x1: WORLD.cols, y0: 0, y1: WORLD.rows };
  const vw = view.x1 - view.x0;
  const vh = view.y1 - view.y0;
  const scale = w / vw;
  const height = vh * scale;
  const px = (g: { x: number; y: number }) => ({ left: (g.x - view.x0) * scale, top: (g.y - view.y0) * scale });

  const uniqueLinks = [...new Map(links.map(([a, b]) => [[a, b].sort().join("-"), [a, b] as [string, string]])).values()];
  const withGroups = (Object.keys(ANCHOR) as Country[]).filter((k) => counts[k]);

  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ width: "100%" }}>
      {w > 0 && (
        <View style={{ width: w, height }}>
          <Svg width={w} height={height} viewBox={`${view.x0} ${view.y0} ${vw} ${vh}`} style={{ position: "absolute" }} pointerEvents="none">
            <Path d={paths.land} fill={c.muted} opacity={0.38} />
            {Object.entries(paths.byCountry).map(([code, d]) => {
              const on = selected === code;
              const has = !!counts[code];
              return <Path key={code} d={d} fill={on ? c.fucsia.fill : has ? c.amarillo.fill : c.muted} opacity={on || has ? 1 : 0.6} />;
            })}
            {uniqueLinks.map(([a, b]) => {
              const p = toGrid(ANCHOR[a as Country] ?? [0, 0]);
              const q = toGrid(ANCHOR[b as Country] ?? [0, 0]);
              // a thread that arcs north between the two countries, like a route on a flight map
              const mx = (p.x + q.x) / 2;
              const my = Math.max(view.y0 + 1, Math.min(p.y, q.y) - Math.hypot(p.x - q.x, p.y - q.y) * 0.25);
              const on = selected === a || selected === b;
              return (
                <Path
                  key={`${a}-${b}`}
                  d={`M${p.x} ${p.y} Q${mx} ${my} ${q.x} ${q.y}`}
                  stroke={on ? c.fucsia.fill : c.turquesa.fill}
                  strokeWidth={on ? 0.55 : 0.4}
                  strokeDasharray="1.2 0.8"
                  fill="none"
                />
              );
            })}
            {withGroups.map((k) => {
              const g = toGrid(ANCHOR[k]);
              return <Circle key={k} cx={g.x} cy={g.y} r={0.9} fill={c.ink} stroke={selected === k ? c.fucsia.fill : c.amarillo.fill} strokeWidth={0.45} />;
            })}
          </Svg>
          {withGroups.map((k) => {
            const on = selected === k;
            const pos = px(toGrid(ANCHOR[k]));
            const n = counts[k];
            return (
              <Pressable
                key={k}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                hitSlop={8}
                onPress={() => onSelect(on ? null : k)}
                style={{
                  position: "absolute",
                  left: pos.left + 8,
                  top: pos.top - 12,
                  flexDirection: "row",
                  alignItems: "center",
                  backgroundColor: on ? c.fucsia.fill : c.surface,
                  borderWidth: 1.5,
                  borderColor: on ? c.fucsia.fill : c.amarillo.fill,
                }}
              >
                <Text style={{ fontFamily: fonts.bodyBold, fontSize: compact ? 11.5 : 12.5, color: on ? c.onAction : c.ink, paddingHorizontal: 6, paddingVertical: 2 }}>
                  {countryName(k, lang)}
                </Text>
                <View style={{ alignSelf: "stretch", justifyContent: "center", paddingHorizontal: 5, backgroundColor: on ? c.ink : c.amarillo.fill }}>
                  <Text style={{ fontFamily: fonts.bodyBold, fontSize: compact ? 11.5 : 12.5, color: on ? c.bg : "#1A1A3A" }}>{n}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}
