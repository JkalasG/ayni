/**
 * Woven avatars: a small cloth generated from the member's id. Motif, colors and
 * orientation come from a hash, so the same person always gets the same cloth.
 * 8 × 8 stitches with stepped corners; initials on a plate from 40 px up
 * (below that the name is always shown beside it).
 */
import { Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { fonts } from "@/lib/theme";
import { useScheme } from "@/lib/scheme";

export function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

type Pattern = (x: number, y: number) => number;
export const PATTERNS: Pattern[] = [
  (x, y) => Math.floor(Math.abs(x - 3.5) + Math.abs(y - 3.5)) % 3, // concentric diamond
  (x, y) => (Math.floor(y + Math.abs(x - 3.5)) >> 1) % 2, // chevrons
  (x, y) => ((x + y) >> 1) % 3, // diagonal threads
  (x, y) => ((x >> 1) + (y >> 1)) % 2, // checker
  (x, y) => (y >= 7 - Math.min(x, 7 - x) * 2 ? 1 : (y >> 1) % 2 ? 2 : 0), // stepped pyramid
  (x, y) => (y >> 1) % 3, // stripes
];

/** The member's own thread color (the first color of their avatar): used to weave their row. */
export function memberThread(id: string, threads: readonly string[]) {
  const i = hash(id) % 5;
  // never orange in the cloth: orange means "pending"
  return threads[i === 1 ? 4 - (hash(id) % 2) * 4 : i];
}

export function initials(name: string) {
  const parts = name.replace(/^(Doña|Don)\s+/i, "").trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase();
}

export function WovenAvatar({ id, name, size = 40 }: { id: string; name: string; size?: number }) {
  const { c } = useScheme();
  const h = hash(id);
  const vivid = c.threads.slice(0, 5);
  const a = vivid[h % 5];
  const b = vivid[(h >>> 3) % 5 === h % 5 ? ((h % 5) + 2) % 5 : (h >>> 3) % 5];
  const third = c.scheme === "dark" ? c.surfaceAlt : c.surface;
  const colors = [a, b, third];
  const pattern = PATTERNS[(h >>> 7) % PATTERNS.length];
  const o = (h >>> 11) % 4;
  const paths = ["", "", ""];
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const corner = (x === 0 || x === 7) && (y === 0 || y === 7);
      if (corner) continue; // stepped corner, like the edge of a cloth
      const [px, py] = o === 1 ? [y, x] : o === 2 ? [7 - x, y] : o === 3 ? [x, 7 - y] : [x, y];
      paths[pattern(px, py)] += `M${x} ${y}h1.02v1.02h-1.02z`;
    }
  }
  const plate = size >= 40;
  return (
    <View style={{ width: size, height: size }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width={size} height={size} viewBox="0 0 8 8">
        {paths.map((d, i) => (d ? <Path key={i} d={d} fill={colors[i]} /> : null))}
      </Svg>
      {plate && (
        <View
          style={{
            position: "absolute",
            left: size * 0.22,
            top: size * 0.3,
            width: size * 0.56,
            height: size * 0.4,
            backgroundColor: c.surface,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ fontFamily: fonts.display, fontSize: size * 0.2, color: c.ink }}>{initials(name)}</Text>
        </View>
      )}
    </View>
  );
}

/**
 * A woven emblem for levels and achievements: a diamond of stitches with its own motif.
 * Locked emblems are drawn as an outline only (and always say so in text next to them).
 */
export function WovenEmblem({ motif, size = 56, colors, locked, lockedColor }: { motif: number; size?: number; colors: string[]; locked?: boolean; lockedColor: string }) {
  const n = 9;
  const pattern = PATTERNS[motif % PATTERNS.length];
  const paths = ["", "", ""];
  let edge = "";
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const d = Math.abs(x - 4) + Math.abs(y - 4);
      if (d > 4) continue;
      const cell = `M${x + 0.06} ${y + 0.06}h0.88v0.88h-0.88z`;
      if (locked) {
        if (d === 4) edge += cell;
      } else {
        paths[d === 4 ? 0 : pattern(Math.min(7, x), Math.min(7, y)) ] += cell;
      }
    }
  }
  return (
    <View style={{ width: size, height: size }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width={size} height={size} viewBox={`0 0 ${n} ${n}`}>
        {locked ? <Path d={edge} fill={lockedColor} /> : paths.map((d, i) => (d ? <Path key={i} d={d} fill={colors[i % colors.length]} /> : null))}
      </Svg>
    </View>
  );
}
