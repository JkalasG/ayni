import { Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { useScheme } from "@/lib/scheme";
import { fonts } from "@/lib/theme";

/**
 * The Ayni emblem: two half rombos of aguayo bands, warm on the left and cool on
 * the right, meeting at a gold centre (the pot). Same geometry as
 * propuesta/logos/ayni-icono-app*.svg and the app icon.
 */
const PATHS = [
  "M500.45 193.55 L182 512 L500.45 830.45 L500.45 769.4 L243.05 512 L500.45 254.6 Z",
  "M523.55 193.55 L842 512 L523.55 830.45 L523.55 769.4 L780.95 512 L523.55 254.6 Z",
  "M500.45 299.15 L287.6 512 L500.45 724.85 L500.45 663.8 L348.65 512 L500.45 360.2 Z",
  "M523.55 299.15 L736.4 512 L523.55 724.85 L523.55 663.8 L675.35 512 L523.55 360.2 Z",
  "M512 393.2 L630.8 512 L512 630.8 L393.2 512 Z",
];

// fucsia, turquesa, amarillo, verde, oro: the light set reads on cream, the dark set on indigo
const TONES = {
  light: ["#D4106B", "#0A8BA8", "#B07F00", "#0E9A64", "#E0A000"],
  dark: ["#FF4A97", "#29C6E0", "#FFD23F", "#2FD49A", "#FFC93C"],
};

export type BrandTone = "light" | "dark";

/** `tone` is the background it sits on; it follows the current sky when left out. */
export function Emblem({ size = 40, tone, mono }: { size?: number; tone?: BrandTone; mono?: string }) {
  const { c } = useScheme();
  const set = TONES[tone ?? (c.scheme === "dark" ? "dark" : "light")];
  return (
    <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden aria-hidden>
      <Svg width={size} height={size} viewBox="182 182 660 660">
        {PATHS.map((d, i) => (
          <Path key={i} d={d} fill={mono ?? set[i]} />
        ))}
      </Svg>
    </View>
  );
}

/** Emblem + the "ayni" wordmark in Unbounded ExtraBold, tight like the sidebar. */
export function Logo({
  size = 40,
  tone,
  color,
  vertical,
}: {
  /** font size of the wordmark; the emblem scales with it */
  size?: number;
  tone?: BrandTone;
  color?: string;
  vertical?: boolean;
}) {
  const { c } = useScheme();
  const ink = color ?? (tone === "dark" ? "#F7F3EA" : tone === "light" ? "#1A1A3A" : c.ink);
  return (
    <View
      accessible
      accessibilityLabel="Ayni"
      style={{ flexDirection: vertical ? "column" : "row", alignItems: vertical ? "flex-start" : "center", gap: size * (vertical ? 0.3 : 0.28) }}
    >
      <Emblem size={size * (vertical ? 1.5 : 1.08)} tone={tone} />
      <Text
        style={{
          fontFamily: fonts.displayHeavy,
          fontSize: size,
          lineHeight: size * 1.08,
          letterSpacing: -size * 0.05,
          color: ink,
          // Unbounded sits high in its box; nudge it onto the emblem's centre line
          marginTop: vertical ? 0 : -size * 0.08,
        }}
      >
        ayni
      </Text>
    </View>
  );
}
