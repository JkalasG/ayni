/**
 * The altiplano: banded sky (night or dawn), generic mountains and the people of Ayni.
 * Everything drawn in SVG. Gradients only as bands, like the layers of the high-plain sky.
 */
import type { ReactNode } from "react";
import { View, type ViewStyle } from "react-native";
import Svg, { Circle, G, Path, Rect } from "react-native-svg";
import type { Palette } from "@/lib/theme";

const SKY_FLEX = [5, 3, 2.2, 1.6, 1.2, 0.9, 0.7];
const STARS: [number, number, number][] = [
  [8, 10, 5], [21, 24, 3], [33, 8, 4], [47, 18, 3], [58, 6, 5], [69, 27, 3], [80, 12, 4], [91, 22, 3],
  [14, 38, 3], [40, 34, 4], [63, 40, 3], [86, 36, 4], [27, 50, 3], [74, 52, 3],
];

/** A disk woven in horizontal slices: the sun at dawn, the moon at night. */
function SlicedDisk({ size, colors }: { size: number; colors: string[] }) {
  const n = 9;
  const r = size / 2;
  const slice = size / n;
  return (
    <Svg width={size} height={size}>
      {Array.from({ length: n }).map((_, i) => {
        const yMid = i * slice + slice / 2 - r;
        const half = Math.sqrt(Math.max(0, r * r - yMid * yMid));
        return <Rect key={i} x={r - half} y={i * slice} width={half * 2} height={slice * 0.72} fill={colors[Math.floor((i / n) * colors.length)]} />;
      })}
    </Svg>
  );
}

function Mountains({ c, height }: { c: Palette; height: number }) {
  return (
    <Svg width="100%" height={height} viewBox="0 0 800 160" preserveAspectRatio="xMidYMax slice">
      <Path
        d="M0 160V95L60 70L110 88L170 50L230 80L290 60L340 85L420 40L470 70L520 55L600 85L660 62L720 80L800 58V160Z"
        fill={c.mountains.far}
      />
      <Path
        d="M0 160V120L90 100L150 115L230 78L262 92L300 52L330 70L360 44L392 66L420 50L470 90L540 105L620 92L700 112L800 100V160Z"
        fill={c.mountains.near}
      />
      <Path d="M286 64L300 52L314 61L306 59L300 65L293 60Z" fill={c.mountains.snow} />
      <Path d="M346 56L360 44L377 55L368 54L361 60L353 54Z" fill={c.mountains.snow} />
      <Path d="M408 59L420 50L434 60L426 58L420 63L414 58Z" fill={c.mountains.snow} />
    </Svg>
  );
}

/**
 * Four neighbours on the day someone takes the pot: an older woman checking her phone,
 * a young man showing the payment went through, a woman lifting the woven pouch, and
 * an older man clapping. Flat, everyday clothes; one striped shawl among them.
 */
export function People({ height, ink }: { height: number; ink: string }) {
  const w = (height * 340) / 190;
  const arm = { strokeWidth: 9, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, fill: "none" };
  return (
    <Svg width={w} height={height} viewBox="0 0 340 190">
      {/* A: older woman with a striped shawl */}
      <G>
        <Rect x={36} y={178} width={14} height={8} rx={3} fill="#2B2B3A" />
        <Rect x={60} y={178} width={14} height={8} rx={3} fill="#2B2B3A" />
        <Path d="M37 118H73L80 180H30Z" fill="#4A3A6B" />
        <Path d="M35 74Q55 66 75 74L77 122H33Z" fill="#2AA5BA" />
        <Path d="M35 75Q55 67 75 75L72 86Q55 80 38 86Z" fill="#E8287A" />
        <Path d="M37 82Q55 76 73 82L72 85Q55 79 38 85Z" fill="#FFD23F" />
        <Path d="M37 78L44 104L52 98" stroke="#2AA5BA" {...arm} />
        <Path d="M73 78L66 104L58 98" stroke="#2AA5BA" {...arm} />
        <Rect x={49} y={84} width={12} height={16} rx={2} fill={ink} />
        <Rect x={51} y={86} width={8} height={10} fill="#29C6E0" />
        <Circle cx={51} cy={98} r={4.5} fill="#8D5A3B" />
        <Circle cx={59} cy={98} r={4.5} fill="#8D5A3B" />
        <Circle cx={55} cy={34} r={7} fill="#CFC8C0" />
        <Circle cx={55} cy={52} r={14} fill="#8D5A3B" />
        <Path d="M41 51A14 14 0 0 1 69 51Q62 43 55 44Q48 43 41 51Z" fill="#CFC8C0" />
        <Circle cx={50} cy={55} r={1.6} fill={"#1A1A3A"} />
        <Circle cx={60} cy={55} r={1.6} fill={"#1A1A3A"} />
      </G>

      {/* B: young man holding up his phone: the payment went through */}
      <G>
        <Rect x={112} y={178} width={16} height={8} rx={3} fill="#F2F2F2" />
        <Rect x={129} y={178} width={16} height={8} rx={3} fill="#F2F2F2" />
        <Rect x={114} y={120} width={12} height={60} fill="#2E3A6E" />
        <Rect x={130} y={120} width={12} height={60} fill="#2E3A6E" />
        <Path d="M110 72Q128 62 146 72L148 124H108Z" fill="#F07D1A" />
        <Path d="M112 76L108 102L111 116" stroke="#F07D1A" {...arm} />
        <Path d="M144 76L154 60L155 46" stroke="#F07D1A" {...arm} />
        <Circle cx={111} cy={118} r={4.5} fill="#6B4128" />
        <Rect x={147} y={20} width={16} height={24} rx={2.5} fill={ink} />
        <Rect x={149} y={23} width={12} height={16} fill="#2FD49A" />
        <Path d="M151.5 31L154 33.5L158.5 28" stroke="#0B3D2A" strokeWidth={1.8} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <Circle cx={155} cy={45} r={4.5} fill="#6B4128" />
        <Circle cx={128} cy={48} r={14} fill="#6B4128" />
        <Path d="M114 46A14 14 0 0 1 142 46Z" fill="#1F2A5C" />
        <Rect x={130} y={42} width={19} height={4.5} rx={2} fill="#1F2A5C" />
        <Circle cx={124} cy={51} r={1.6} fill={"#1A1A3A"} />
        <Circle cx={133} cy={51} r={1.6} fill={"#1A1A3A"} />
        <Path d="M125 57Q128.5 59.5 132 57" stroke="#1A1A3A" strokeWidth={1.5} fill="none" strokeLinecap="round" />
      </G>

      {/* C: the one taking the pot, lifting the woven pouch */}
      <G>
        <Path d="M189 50Q189 28 205 28Q221 28 221 50L223 88H187Z" fill="#1E1A2E" />
        <Rect x={191} y={178} width={14} height={8} rx={3} fill="#8A1550" />
        <Rect x={206} y={178} width={14} height={8} rx={3} fill="#8A1550" />
        <Rect x={193} y={122} width={11} height={58} fill="#1F5C5A" />
        <Rect x={207} y={122} width={11} height={58} fill="#1F5C5A" />
        <Path d="M188 74Q205 64 222 74L224 124H186Z" fill="#E8287A" />
        <Path d="M190 78L182 58L189 38" stroke="#E8287A" {...arm} />
        <Path d="M220 78L228 58L221 38" stroke="#E8287A" {...arm} />
        <Circle cx={205} cy={50} r={14} fill="#A8693F" />
        <Path d="M191 48A14 14 0 0 1 219 48Q211 39 203 42Q196 41 191 48Z" fill="#1E1A2E" />
        <Path d="M198.5 52.5Q200.5 50.5 202.5 52.5M207.5 52.5Q209.5 50.5 211.5 52.5" stroke="#1A1A3A" strokeWidth={1.5} fill="none" strokeLinecap="round" />
        <Path d="M200 57.5Q205 61.5 210 57.5" stroke="#1A1A3A" strokeWidth={1.6} fill="none" strokeLinecap="round" />
        {/* the pouch: a small aguayo bundle with its knot */}
        <Path d="M199 6L205 1L211 6Z" fill="#FFD23F" />
        <Rect x={186} y={6} width={38} height={28} rx={5} fill="#FF2E88" />
        <Rect x={186} y={11} width={38} height={4} fill="#FFD23F" />
        <Rect x={186} y={18} width={38} height={4} fill="#2FD49A" />
        <Rect x={186} y={25} width={38} height={4} fill="#29C6E0" />
        <Circle cx={190} cy={36} r={4.5} fill="#A8693F" />
        <Circle cx={220} cy={36} r={4.5} fill="#A8693F" />
        {/* confetti diamonds */}
        <Rect x={172} y={10} width={6} height={6} fill="#FFD23F" transform="rotate(45 175 13)" />
        <Rect x={234} y={4} width={6} height={6} fill="#29C6E0" transform="rotate(45 237 7)" />
        <Rect x={240} y={26} width={5} height={5} fill="#FF8A1F" transform="rotate(45 242.5 28.5)" />
        <Rect x={166} y={30} width={5} height={5} fill="#2FD49A" transform="rotate(45 168.5 32.5)" />
      </G>

      {/* D: older man with glasses, clapping */}
      <G>
        <Rect x={270} y={178} width={15} height={8} rx={3} fill="#3A2A20" />
        <Rect x={287} y={178} width={15} height={8} rx={3} fill="#3A2A20" />
        <Rect x={273} y={122} width={11} height={58} fill="#5A4636" />
        <Rect x={288} y={122} width={11} height={58} fill="#5A4636" />
        <Path d="M268 74Q285 64 302 74L304 124H266Z" fill="#129A6A" />
        <Path d="M270 78L276 100L283 94" stroke="#129A6A" {...arm} />
        <Path d="M300 78L294 100L287 94" stroke="#129A6A" {...arm} />
        <Circle cx={282} cy={93} r={4.5} fill="#5A3620" />
        <Circle cx={288} cy={93} r={4.5} fill="#5A3620" />
        <Circle cx={285} cy={50} r={14} fill="#5A3620" />
        <Path d="M271 48A14 14 0 0 1 299 48Q292 42 285 43Q278 42 271 48Z" fill="#D9D3CB" />
        <Circle cx={280} cy={52} r={3.4} stroke="#1A1A3A" strokeWidth={1.4} fill="none" />
        <Circle cx={290} cy={52} r={3.4} stroke="#1A1A3A" strokeWidth={1.4} fill="none" />
        <Path d="M283.4 52H286.6" stroke="#1A1A3A" strokeWidth={1.4} />
        <Path d="M279 58.5Q285 61.5 291 58.5Q285 56.8 279 58.5Z" fill="#D9D3CB" />
      </G>
    </Svg>
  );
}

export function Altiplano({
  c,
  peopleHeight,
  mountainHeight,
  groundHeight = 18,
  celestial,
  peopleInset,
  style,
  children,
}: {
  /** Left offset for the people; centered when omitted. */
  peopleInset?: number;
  c: Palette;
  peopleHeight: number;
  mountainHeight: number;
  groundHeight?: number;
  celestial: number;
  style?: ViewStyle;
  children?: ReactNode;
}) {
  const dark = c.scheme === "dark";
  return (
    <View style={[{ overflow: "hidden", backgroundColor: c.sky[0] }, style]}>
      <View style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {c.sky.map((col, i) => (
          <View key={i} style={{ flex: SKY_FLEX[i] ?? 1, backgroundColor: col }} />
        ))}
      </View>
      {dark &&
        STARS.map(([x, y, s], i) => (
          <View
            key={i}
            style={{ position: "absolute", left: `${x}%`, top: `${y}%`, width: s, height: s, backgroundColor: i % 4 === 0 ? "#FFD23F" : "#E9E6F5", transform: [{ rotate: "45deg" }] }}
          />
        ))}
      <View style={{ position: "absolute", right: -celestial * 0.22, bottom: groundHeight + mountainHeight * 0.5 }}>
        <SlicedDisk size={celestial} colors={dark ? ["#F4F0DC", "#E6E0C6", "#D6CFB0"] : ["#FFD23F", "#FFB02E", "#FF8A1F"]} />
      </View>
      <View style={{ position: "absolute", left: 0, right: 0, bottom: groundHeight }}>
        <Mountains c={c} height={mountainHeight} />
      </View>
      <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: groundHeight, backgroundColor: c.ground }} />
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{ position: "absolute", left: peopleInset ?? 0, right: peopleInset == null ? 0 : undefined, bottom: groundHeight * 0.45, alignItems: "center" }}
      >
        <People height={peopleHeight} ink="#1A1A3A" />
      </View>
      {children}
    </View>
  );
}
