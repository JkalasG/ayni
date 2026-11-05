/**
 * The pasanaku as an aguayo being woven: one row per member (in turn order), one column
 * per round. A paid contribution is a woven cell in the member's own thread; a pending
 * one is an open, dashed cell; future rounds are loose threads; the round where a member
 * takes the pot carries a gold border. New stitches weave in live; a completed round glows.
 */
import { useEffect, useRef, useState, type ReactElement } from "react";
import { ScrollView, Text, View } from "react-native";
import Svg, { Path, Rect } from "react-native-svg";
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withSequence, withTiming } from "react-native-reanimated";
import { Icon } from "@/components/icons";
import { WovenAvatar, memberThread } from "@/components/woven-avatar";
import { useI18n } from "@/lib/i18n";
import { useScheme } from "@/lib/scheme";
import { fonts, type ContributionState, type Palette } from "@/lib/theme";

type Contribution = { membershipId: string; status: ContributionState };
type Round = { number: number; status: string; recipientId: string; contributions: Contribution[] };
type Member = { id: string; turn: number | null; user: { id?: string; name: string } };

/** A woven cell: stitches in a diagonal twill, full thread on a softer ground. */
export function WovenFill({ w, h, color }: { w: number; h: number; color: string }) {
  const s = 4;
  let strong = "";
  let soft = "";
  for (let y = 0; y < Math.ceil(h / s); y++) {
    for (let x = 0; x < Math.ceil(w / s); x++) {
      const d = `M${x * s + 0.5} ${y * s + 0.5}h${s - 1}v${s - 1}h-${s - 1}z`;
      if ((x + y) % 3 === 0) soft += d;
      else strong += d;
    }
  }
  return (
    <Svg width={w} height={h}>
      <Rect x={0} y={0} width={w} height={h} fill={color} opacity={0.28} />
      <Path d={strong} fill={color} />
      <Path d={soft} fill={color} opacity={0.45} />
    </Svg>
  );
}

/** Threads still on the loom: thin vertical lines. */
function LooseThreads({ w, h, color }: { w: number; h: number; color: string }) {
  const n = Math.max(3, Math.floor(w / 7));
  let d = "";
  for (let i = 1; i <= n; i++) d += `M${(i * w) / (n + 1)} 3V${h - 3}`;
  return (
    <Svg width={w} height={h}>
      <Path d={d} stroke={color} strokeWidth={1.2} />
    </Svg>
  );
}

/** A contribution still to be woven: thicker loose threads hanging from a bar, in the pending color. */
function PendingThreads({ w, h, color }: { w: number; h: number; color: string }) {
  const n = Math.max(3, Math.floor(w / 6));
  let d = "";
  for (let i = 1; i <= n; i++) d += `M${(i * w) / (n + 1)} 6V${i % 2 ? h - 3 : h - 8}`;
  return (
    <Svg width={w} height={h}>
      <Rect x={0} y={0} width={w} height={4} fill={color} />
      <Path d={d} stroke={color} strokeWidth={2} strokeLinecap="square" />
    </Svg>
  );
}

export function WeaveIn({ fresh, delay, children }: { fresh: boolean; delay: number; children: ReactElement }) {
  const reduced = useReducedMotion();
  const p = useSharedValue(fresh && !reduced ? 0 : 1);
  useEffect(() => {
    if (fresh && !reduced) {
      p.value = 0;
      p.value = withDelay(delay, withTiming(1, { duration: 650, easing: Easing.out(Easing.cubic) }));
    }
  }, [fresh]);
  const style = useAnimatedStyle(() => ({ transform: [{ scaleX: p.value }], opacity: 0.3 + p.value * 0.7 }));
  return <Animated.View style={style}>{children}</Animated.View>;
}

function ColumnGlow({ color, height }: { color: string; height: number }) {
  const reduced = useReducedMotion();
  const o = useSharedValue(0);
  useEffect(() => {
    o.value = reduced
      ? withSequence(withTiming(0.35, { duration: 1 }), withDelay(900, withTiming(0, { duration: 1 })))
      : withSequence(withTiming(0.5, { duration: 300 }), withTiming(0.15, { duration: 300 }), withTiming(0.5, { duration: 300 }), withTiming(0, { duration: 700 }));
  }, []);
  const style = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.View pointerEvents="none" style={[{ position: "absolute", left: -2, right: -2, top: 0, height, backgroundColor: color }, style]} />;
}

export function stateLabel(t: (k: any) => string, state: ContributionState | "UPCOMING") {
  return state === "UPCOMING"
    ? t("toWeave")
    : state === "PAID"
      ? t("paid")
      : state === "COVERED"
        ? t("covered")
        : state === "DEFAULTED"
          ? t("defaulted")
          : state === "CLOSED"
            ? t("closedContribution")
            : t("pending");
}

export function Tejido({
  rounds,
  members,
  me,
  cell = 40,
  onRoundComplete,
}: {
  rounds: Round[];
  members: Member[];
  me: string;
  cell?: number;
  onRoundComplete?: (round: number) => void;
}) {
  const { t } = useI18n();
  const { c } = useScheme();
  const ordered = [...members].sort((a, b) => (a.turn ?? 99) - (b.turn ?? 99));
  const nameW = cell >= 48 ? 150 : 118;
  const cw = cell;
  const ch = Math.round(cell * 0.78);
  const gap = 5;

  // what was already woven, so only new stitches animate
  const seen = useRef<Set<string> | null>(null);
  const prevStatus = useRef<Record<number, string>>({});
  const [glow, setGlow] = useState<number | null>(null);
  const woven = new Set<string>();
  for (const r of rounds) for (const x of r.contributions) if (x.status === "PAID" || x.status === "COVERED") woven.add(`${r.number}:${x.membershipId}`);
  const first = seen.current == null;

  useEffect(() => {
    seen.current = woven;
    for (const r of rounds) {
      const before = prevStatus.current[r.number];
      if (before === "COLLECTING" && (r.status === "READY" || r.status === "PAID_OUT")) {
        setGlow(r.number);
        onRoundComplete?.(r.number);
        setTimeout(() => setGlow((g) => (g === r.number ? null : g)), 1800);
      }
      prevStatus.current[r.number] = r.status;
    }
  });

  if (rounds.length === 0) return null;
  const hasCovered = rounds.some((r) => r.contributions.some((x) => x.status === "COVERED"));

  const cellFor = (r: Round, m: Member, row: number) => {
    const contrib = r.contributions.find((x) => x.membershipId === m.id);
    const receives = r.recipientId === m.id;
    const open = r.status === "COLLECTING" || r.status === "READY";
    const upcoming = r.status === "UPCOMING";
    const state: ContributionState | "UPCOMING" = upcoming ? "UPCOMING" : contrib?.status ?? "PENDING";
    const thread = memberThread(m.user.id ?? m.id, c.threads);
    const key = `${r.number}:${m.id}`;
    const fresh = !first && woven.has(key) && !seen.current!.has(key);
    const label = `${m.user.name}, ${t("round")} ${r.number}: ${stateLabel(t, state)}${receives ? `, ${t("receivesPot")}` : ""}`;
    const inner = cellArt(state, cw - 4, ch - 4, thread, c, open);
    return (
      <View
        key={r.number}
        accessible
        accessibilityLabel={label}
        style={{
          width: cw,
          height: ch,
          padding: 2,
          borderWidth: 2,
          borderColor: receives ? c.amarillo.fill : "transparent",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <WeaveIn fresh={fresh} delay={row * 90}>
          {inner}
        </WeaveIn>
        {receives ? (
          <View style={{ position: "absolute", right: -5, top: -5, width: 10, height: 10, backgroundColor: c.amarillo.fill, transform: [{ rotate: "45deg" }] }} />
        ) : null}
      </View>
    );
  };

  const rowH = ch + gap;
  return (
    <View style={{ gap: 16 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingRight: 8, paddingTop: 6 }}>
        <View style={{ gap }}>
          <View style={{ flexDirection: "row", alignItems: "center", paddingLeft: nameW, gap }}>
            {rounds.map((r) => {
              const open = r.status === "COLLECTING" || r.status === "READY";
              return (
                <View key={r.number} style={{ width: cw, alignItems: "center" }}>
                  <View style={{ paddingHorizontal: 6, paddingVertical: 3, backgroundColor: open ? c.fucsia.fill : "transparent" }}>
                    <Text style={{ fontFamily: open ? fonts.display : fonts.displayMedium, fontSize: 12, color: open ? c.onAction : c.muted, fontVariant: ["tabular-nums"] }}>R{r.number}</Text>
                  </View>
                </View>
              );
            })}
          </View>
          <View>
            {ordered.map((m, row) => (
              <View key={m.id} style={{ flexDirection: "row", alignItems: "center", gap, marginBottom: gap }}>
                <View style={{ width: nameW, flexDirection: "row", alignItems: "center", gap: 8, paddingRight: 8 }}>
                  <WovenAvatar id={m.user.id ?? m.id} name={m.user.name} size={cell >= 48 ? 32 : 26} />
                  <Text numberOfLines={1} style={{ flex: 1, fontFamily: m.id === me ? fonts.bodyBold : fonts.body, fontSize: 14, color: c.ink }}>
                    {m.id === me ? `${m.user.name.replace(/^(Doña|Don)\s+/i, "").split(" ")[0]} (${t("you")})` : m.user.name}
                  </Text>
                </View>
                {rounds.map((r) => cellFor(r, m, row))}
              </View>
            ))}
            {/* the column of a round that just closed glows once */}
            {glow != null && (
              <View pointerEvents="none" style={{ position: "absolute", top: 0, left: nameW + gap + (glow - 1) * (cw + gap), width: cw }}>
                <ColumnGlow color={c.amarillo.fill} height={ordered.length * rowH} />
              </View>
            )}
          </View>
        </View>
      </ScrollView>
      <Legend c={c} showCovered={hasCovered} />
    </View>
  );
}

function cellArt(state: ContributionState | "UPCOMING", w: number, h: number, thread: string, c: Palette, open: boolean): ReactElement {
  switch (state) {
    case "PAID":
      return <WovenFill w={w} h={h} color={thread} />;
    case "COVERED":
      return (
        <View>
          <WovenFill w={w} h={h} color={c.turquesa.fill} />
          <View style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, alignItems: "center", justifyContent: "center" }}>
            <View style={{ backgroundColor: c.surface, padding: 2 }}>
              <Icon name="garantia" size={12} color={c.turquesa.text} />
            </View>
          </View>
        </View>
      );
    case "DEFAULTED":
      return (
        <View style={{ width: w, height: h, borderWidth: 2, borderColor: c.rojo.fill, alignItems: "center", justifyContent: "center" }}>
          <Icon name="rechazar" size={12} color={c.rojo.text} />
        </View>
      );
    case "CLOSED":
      return <View style={{ width: w, height: h, borderWidth: 1.5, borderStyle: "dotted", borderColor: c.muted }} />;
    case "PENDING":
      return <PendingThreads w={w} h={h} color={open ? c.naranja.fill : c.muted} />;
    default:
      return <LooseThreads w={w} h={h} color={c.line} />;
  }
}

function Legend({ c, showCovered }: { c: Palette; showCovered: boolean }) {
  const { t } = useI18n();
  const item = (key: string, el: ReactElement) => (
    <View key={key} style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
      {el}
      <Text style={{ fontFamily: fonts.body, fontSize: 13.5, color: c.muted }}>{key}</Text>
    </View>
  );
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", columnGap: 18, rowGap: 8 }}>
      {item(t("paid"), <WovenFill w={20} h={14} color={c.threads[0]} />)}
      {item(t("pending"), <PendingThreads w={20} h={14} color={c.naranja.fill} />)}
      {showCovered && item(t("covered"), <WovenFill w={20} h={14} color={c.turquesa.fill} />)}
      {item(t("toWeave"), <LooseThreads w={20} h={14} color={c.muted} />)}
      {item(t("receivesPot"), <View style={{ width: 20, height: 14, borderWidth: 2, borderColor: c.amarillo.fill }} />)}
    </View>
  );
}
