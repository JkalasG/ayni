/**
 * The pot as a woven clay vessel. It fills from the bottom with one band of thread per contribution,
 * and a band only appears once the backend marks the contribution settled, which happens after PayPal
 * confirms the capture (or the guarantee covers it). Pressing "Pay" alone never fills it.
 */
import { useEffect, useRef } from "react";
import { Platform, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withSpring, withTiming } from "react-native-reanimated";
import * as Haptics from "expo-haptics";

export type VasijaSlot = { id: string; state: "PAID" | "COVERED" | "LATE" | "EMPTY" };

const W = 18;
// interior half-width per row, top (neck) to bottom; the outline sits one stitch outside it
const PROFILE = [4, 4, 5, 6, 7, 8, 8, 8, 8, 8, 8, 7, 6, 5, 4];
const H = PROFILE.length + 2; // lip row + interior + base row
const CX = W / 2;

const cell = (x: number, y: number) => `M${x + 0.06} ${y + 0.06}h0.88v0.88h-0.88z`;

function outlinePath() {
  let d = "";
  // lip: a wide stitched rim
  for (let x = CX - 6; x < CX + 6; x++) d += cell(x, 0);
  PROFILE.forEach((hw, i) => {
    const y = i + 1;
    d += cell(CX - hw - 1, y) + cell(CX + hw, y);
    // the step where the profile widens or narrows is closed with stitches too
    const prev = i === 0 ? 6 : PROFILE[i - 1];
    for (let x = Math.min(hw, prev); x < Math.max(hw, prev) && i > 0; x++) {
      const row = hw > prev ? y : y - 1;
      d += cell(CX - x - 1, row) + cell(CX + x, row);
    }
  });
  const base = PROFILE[PROFILE.length - 1];
  for (let x = CX - base - 1; x < CX + base + 1; x++) d += cell(x, H - 1);
  // two handles
  d += cell(CX - 8, 2) + cell(CX - 9, 3) + cell(CX - 9, 4) + cell(CX + 7, 2) + cell(CX + 8, 3) + cell(CX + 8, 4);
  return d;
}
const OUTLINE = outlinePath();

/** Interior rows from the bottom, so row 0 is the first to fill. */
const ROWS = PROFILE.map((hw, i) => ({ y: i + 1, hw })).reverse();

function rowsPath(from: number, to: number, accent: boolean) {
  let d = "";
  for (let r = from; r < to; r++) {
    const { y, hw } = ROWS[r];
    for (let x = CX - hw; x < CX + hw; x++) {
      // a small rombo motif woven into each band
      const dot = (x + r) % 4 === 0 || (x - r) % 4 === 0;
      if (dot === accent) d += cell(x, y);
    }
  }
  return d;
}

function Band({ d, accent, color, accentColor, fresh, delay, size, onLand }: { d: string; accent: string; color: string; accentColor: string; fresh: boolean; delay: number; size: { w: number; h: number }; onLand: () => void }) {
  const reduced = useReducedMotion();
  const p = useSharedValue(fresh && !reduced ? 0 : 1);
  useEffect(() => {
    if (!fresh || reduced) return;
    p.value = 0;
    p.value = withDelay(delay, withSpring(1, { damping: 12, stiffness: 140 }));
    const timer = setTimeout(onLand, delay + 260);
    return () => clearTimeout(timer);
  }, [fresh]);
  const style = useAnimatedStyle(() => ({ opacity: Math.min(1, p.value * 1.6), transform: [{ translateY: (1 - p.value) * -size.h * 0.35 }] }));
  return (
    <Animated.View pointerEvents="none" style={[{ position: "absolute", left: 0, top: 0 }, style]}>
      <Svg width={size.w} height={size.h} viewBox={`0 0 ${W} ${H}`}>
        <Path d={d} fill={color} />
        <Path d={accent} fill={accentColor} />
      </Svg>
    </Animated.View>
  );
}

export function Vasija({
  slots,
  size = 120,
  ink,
  colors,
  label,
  onFull,
  animateFirst = false,
}: {
  slots: VasijaSlot[];
  size?: number;
  ink: string;
  /** thread colors for paid bands, one per member in turn */
  colors: { paid: string[]; covered: string; late: string; accent: string; empty: string };
  label: string;
  onFull?: () => void;
  /** weave in the bands already settled on the first render too (the demo) */
  animateFirst?: boolean;
}) {
  const reduced = useReducedMotion();
  const dims = { w: size, h: (size * H) / W };
  const n = Math.max(1, slots.length);
  // settled first so the vessel always fills from the bottom up
  const ordered = [...slots].sort((a, b) => Number(a.state === "EMPTY") - Number(b.state === "EMPTY"));
  const seen = useRef<Set<string> | null>(null);
  const before = seen.current ?? (animateFirst ? new Set<string>() : null);
  const filledCount = ordered.filter((s) => s.state !== "EMPTY").length;

  useEffect(() => {
    seen.current = new Set(ordered.filter((s) => s.state !== "EMPTY").map((s) => s.id));
  });

  const freshIds = before ? ordered.filter((s) => s.state !== "EMPTY" && !before.has(s.id)).map((s) => s.id) : [];
  const wasFull = before ? before.size >= slots.length : true;
  useEffect(() => {
    if (freshIds.length && !wasFull && filledCount === slots.length) {
      const timer = setTimeout(() => onFull?.(), reduced ? 0 : freshIds.length * 180 + 500);
      return () => clearTimeout(timer);
    }
  }, [freshIds.join(), filledCount]);

  const tick = () => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  };

  let freshIndex = 0;
  return (
    <View
      style={{ width: dims.w, height: dims.h }}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: slots.length, now: filledCount }}
    >
      <Svg width={dims.w} height={dims.h} viewBox={`0 0 ${W} ${H}`} style={{ position: "absolute" }}>
        <Path d={rowsPath(0, ROWS.length, true)} fill={colors.empty} />
      </Svg>
      {ordered.map((s, i) => {
        if (s.state === "EMPTY") return null;
        const from = Math.round((i * ROWS.length) / n);
        const to = Math.round(((i + 1) * ROWS.length) / n);
        if (to <= from) return null;
        const color = s.state === "COVERED" ? colors.covered : s.state === "LATE" ? colors.late : colors.paid[i % colors.paid.length];
        const fresh = freshIds.includes(s.id);
        const delay = fresh ? freshIndex++ * 180 : 0;
        return <Band key={s.id} d={rowsPath(from, to, false)} accent={rowsPath(from, to, true)} color={color} accentColor={colors.accent} fresh={fresh} delay={delay} size={dims} onLand={tick} />;
      })}
      <Svg width={dims.w} height={dims.h} viewBox={`0 0 ${W} ${H}`} style={{ position: "absolute" }} pointerEvents="none">
        <Path d={OUTLINE} fill={ink} />
      </Svg>
    </View>
  );
}
