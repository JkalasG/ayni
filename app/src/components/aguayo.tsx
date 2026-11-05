/**
 * Aguayo pattern system. Every motif is a grid of stitches (square cells with a small gap),
 * the same grid the icons and avatars use, so the whole app looks woven by one hand.
 * Generic textile motifs only: diamonds, zigzags, stepped pyramids and stripes.
 * No chakana, no wiphala, no sacred or political symbols.
 */
import { useEffect, useState } from "react";
import { View, type LayoutChangeEvent, type ViewStyle } from "react-native";
import Svg, { Path } from "react-native-svg";
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming } from "react-native-reanimated";

export type Motif = "rombos" | "zigzag" | "escalonado" | "franjas" | "puntos";

/** Rows each motif needs to read well. */
export const motifRows: Record<Motif, number> = { rombos: 9, zigzag: 5, escalonado: 6, franjas: 2, puntos: 3 };

/** Color index for a stitch, or -1 for an empty one. */
function stitch(m: Motif, r: number, c: number, rows: number): number {
  switch (m) {
    case "franjas":
      return r;
    case "puntos":
      return r === 1 && c % 4 === 1 ? 0 : -1;
    case "zigzag": {
      const y = Math.abs((c % 8) - 4); // 0..4
      return r === y ? 0 : -1;
    }
    case "escalonado": {
      const x = c % 12;
      const level = Math.min(x, 11 - x) >> 1; // 0..2, steps of two stitches
      return r >= rows - 2 - level * 2 ? Math.floor(c / 12) % 2 : -1;
    }
    case "rombos": {
      const p = rows + 1;
      const mid = (rows - 1) / 2;
      const d = Math.abs(r - mid) + Math.abs((c % p) - p / 2);
      return d > mid ? -1 : d % 3;
    }
  }
}

/** One path per color: cheap to render even for long bands. */
export function stitchPaths(m: Motif, rows: number, cols: number, cell: number, vertical = false) {
  const gap = Math.max(0.6, cell * 0.14);
  const s = cell - gap;
  const paths: string[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = stitch(m, r, c, rows);
      if (i < 0) continue;
      const x = (vertical ? r : c) * cell;
      const y = (vertical ? c : r) * cell;
      paths[i] = (paths[i] ?? "") + `M${x} ${y}h${s}v${s}h-${s}z`;
    }
  }
  return paths;
}

type BandProps = {
  motif: Motif;
  colors: string[];
  cell?: number;
  /** Size along the band; measured from the parent when omitted. */
  length?: number;
  vertical?: boolean;
  /** Fill behind the stitches (the warp). */
  ground?: string;
  style?: ViewStyle;
};

export function AguayoBand({ motif, colors, cell = 6, length, vertical = false, ground, style }: BandProps) {
  const [measured, setMeasured] = useState(length ?? 0);
  const size = length ?? measured;
  const rows = motifRows[motif];
  const thick = rows * cell;
  const cols = Math.ceil(size / cell) + 1;
  const onLayout = (e: LayoutChangeEvent) => {
    if (length == null) setMeasured(vertical ? e.nativeEvent.layout.height : e.nativeEvent.layout.width);
  };
  const paths = size > 0 ? stitchPaths(motif, rows, cols, cell, vertical) : [];
  return (
    <View
      onLayout={onLayout}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[vertical ? { width: thick, alignSelf: "stretch" } : { height: thick, alignSelf: "stretch" }, { overflow: "hidden", backgroundColor: ground }, style]}
    >
      {size > 0 && (
        <Svg width={vertical ? thick : size} height={vertical ? size : thick}>
          {paths.map((d, i) => (d ? <Path key={i} d={d} fill={colors[i % colors.length]} /> : null))}
        </Svg>
      )}
    </View>
  );
}

/** The standard composition: stripes, zigzag, diamonds, zigzag, stripes. */
export function aguayoLayers(threads: string[]): { motif: Motif; colors: string[] }[] {
  const [fu, na, am, ve, tu, li] = threads;
  return [
    { motif: "franjas", colors: [fu, am] },
    { motif: "zigzag", colors: [tu] },
    { motif: "rombos", colors: [fu, am, ve] },
    { motif: "zigzag", colors: [na] },
    { motif: "franjas", colors: [ve, li] },
  ];
}

function UnfoldLayer({ order, vertical, children }: { order: number; vertical: boolean; children: React.ReactNode }) {
  const reduced = useReducedMotion();
  const p = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    if (!reduced) p.value = withDelay(120 + order * 140, withTiming(1, { duration: 760, easing: Easing.out(Easing.cubic) }));
  }, [reduced]);
  const anim = useAnimatedStyle(() => ({
    opacity: Math.min(1, p.value * 3),
    transform: vertical ? [{ scaleY: p.value }] : [{ scaleX: p.value }],
  }));
  return <Animated.View style={anim}>{children}</Animated.View>;
}

/**
 * An aguayo that unfolds when it appears: the middle band is woven first, then the
 * ones beside it. With reduced motion it simply appears.
 */
export function AguayoUnfold({
  threads,
  cell = 6,
  vertical = false,
  ground,
  spacing = 0,
}: {
  threads: string[];
  cell?: number;
  vertical?: boolean;
  ground?: string;
  spacing?: number;
}) {
  const layers = aguayoLayers(threads);
  const mid = (layers.length - 1) / 2;
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ flexDirection: vertical ? "row" : "column", gap: spacing, backgroundColor: ground, padding: spacing, alignSelf: "stretch" }}
    >
      {layers.map((l, i) => (
        <UnfoldLayer key={i} order={Math.abs(i - mid)} vertical={vertical}>
          <AguayoBand motif={l.motif} colors={l.colors} cell={cell} vertical={vertical} style={vertical ? { flex: 1 } : undefined} />
        </UnfoldLayer>
      ))}
    </View>
  );
}
