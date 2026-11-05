/**
 * Celebrations. They never block: confetti lets touches through, and the pot
 * celebration closes with one tap anywhere. With reduced motion nothing moves:
 * things simply appear and disappear.
 */
import { useEffect, useMemo, useState } from "react";
import { AccessibilityInfo, Platform, Pressable, ScrollView, Text, View, useWindowDimensions } from "react-native";
import Svg, { Circle, G, Path, Rect } from "react-native-svg";
import * as Haptics from "expo-haptics";
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming } from "react-native-reanimated";
import { AguayoBand, type Motif } from "@/components/aguayo";
import { Icon } from "@/components/icons";
import { StepButton } from "@/components/stepped";
import { useI18n } from "@/lib/i18n";
import { useScheme } from "@/lib/scheme";
import { money } from "@/lib/api";
import { fonts, space } from "@/lib/theme";

function Piece({ x, size, color, delay, duration, drift, spin, height }: { x: number; size: number; color: string; delay: number; duration: number; drift: number; spin: number; height: number }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withDelay(delay, withTiming(1, { duration, easing: Easing.in(Easing.quad) }));
  }, []);
  const style = useAnimatedStyle(() => ({
    opacity: p.value < 0.85 ? 1 : (1 - p.value) / 0.15,
    transform: [{ translateY: -30 + p.value * (height + 60) }, { translateX: Math.sin(p.value * 6) * drift }, { rotate: `${45 + p.value * spin}deg` }],
  }));
  return <Animated.View style={[{ position: "absolute", left: x, top: 0, width: size, height: size, backgroundColor: color }, style]} />;
}

/** A shower of small woven diamonds. Touches pass through it. */
export function Confetti({ onDone, pieces = 34 }: { onDone?: () => void; pieces?: number }) {
  const reduced = useReducedMotion();
  const { c } = useScheme();
  const { width, height } = useWindowDimensions();
  const list = useMemo(
    () =>
      Array.from({ length: pieces }).map((_, i) => ({
        x: Math.random() * width,
        size: 7 + Math.random() * 7,
        color: c.threads[i % 5],
        delay: Math.random() * 350,
        duration: 1500 + Math.random() * 900,
        drift: 10 + Math.random() * 26,
        spin: 180 + Math.random() * 360,
      })),
    [pieces, width]
  );
  useEffect(() => {
    const timer = setTimeout(() => onDone?.(), reduced ? 10 : 2700);
    return () => clearTimeout(timer);
  }, []);
  if (reduced) return null;
  return (
    <View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, overflow: "hidden", zIndex: 50 }}>
      {list.map((p, i) => (
        <Piece key={i} {...p} height={height} />
      ))}
    </View>
  );
}

/** Three neighbours cheering, seen from the front: the people who made the pot. */
function Cheering({ width }: { width: number }) {
  const h = (width * 150) / 240;
  const arm = { strokeWidth: 10, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, fill: "none" };
  return (
    <Svg width={width} height={h} viewBox="0 0 240 150">
      <G>
        <Path d="M42 54Q42 34 60 34Q78 34 78 54L80 92H40Z" fill="#1E1A2E" />
        <Path d="M36 96Q60 84 84 96V150H36Z" fill="#2AA5BA" />
        <Path d="M40 100L26 70L30 44" stroke="#2AA5BA" {...arm} />
        <Path d="M80 100L94 70L90 44" stroke="#2AA5BA" {...arm} />
        <Circle cx={30} cy={42} r={5.5} fill="#8D5A3B" />
        <Circle cx={90} cy={42} r={5.5} fill="#8D5A3B" />
        <Circle cx={60} cy={60} r={16} fill="#8D5A3B" />
        <Path d="M44 58A16 16 0 0 1 76 58Q68 48 60 50Q52 48 44 58Z" fill="#1E1A2E" />
        <Path d="M53 61Q55 59 57 61M63 61Q65 59 67 61" stroke="#1A1A3A" strokeWidth={1.6} fill="none" strokeLinecap="round" />
        <Path d="M55 67Q60 71 65 67" stroke="#1A1A3A" strokeWidth={1.7} fill="none" strokeLinecap="round" />
      </G>
      <G>
        <Path d="M94 90Q120 76 146 90V150H94Z" fill="#E8287A" />
        <Path d="M98 94L90 60L102 30" stroke="#E8287A" {...arm} />
        <Path d="M142 94L150 60L138 30" stroke="#E8287A" {...arm} />
        <Rect x={98} y={4} width={44} height={26} rx={5} fill="#FFD23F" />
        <Rect x={98} y={9} width={44} height={4} fill="#FF2E88" />
        <Rect x={98} y={16} width={44} height={4} fill="#2FD49A" />
        <Rect x={98} y={23} width={44} height={4} fill="#29C6E0" />
        <Circle cx={102} cy={30} r={5.5} fill="#A8693F" />
        <Circle cx={138} cy={30} r={5.5} fill="#A8693F" />
        <Circle cx={120} cy={40} r={6} fill="#1E1A2E" />
        <Circle cx={120} cy={56} r={17} fill="#A8693F" />
        <Path d="M103 54A17 17 0 0 1 137 54Q128 45 120 47Q112 45 103 54Z" fill="#1E1A2E" />
        <Path d="M112 57Q114 55 116 57M124 57Q126 55 128 57" stroke="#1A1A3A" strokeWidth={1.6} fill="none" strokeLinecap="round" />
        <Path d="M113 63Q120 69 127 63" stroke="#1A1A3A" strokeWidth={1.8} fill="none" strokeLinecap="round" />
      </G>
      <G>
        <Path d="M156 96Q180 84 204 96V150H156Z" fill="#129A6A" />
        <Path d="M160 100L148 72L154 46" stroke="#129A6A" {...arm} />
        <Path d="M200 100L212 72L208 46" stroke="#129A6A" {...arm} />
        <Circle cx={154} cy={44} r={5.5} fill="#5A3620" />
        <Circle cx={208} cy={44} r={5.5} fill="#5A3620" />
        <Circle cx={180} cy={62} r={16} fill="#5A3620" />
        <Path d="M164 58A16 16 0 0 1 196 58Z" fill="#1F2A5C" />
        <Rect x={180} y={53} width={20} height={5} rx={2} fill="#1F2A5C" />
        <Path d="M173 63Q175 61 177 63M183 63Q185 61 187 63" stroke="#1A1A3A" strokeWidth={1.6} fill="none" strokeLinecap="round" />
        <Path d="M175 69Q180 73 185 69" stroke="#1A1A3A" strokeWidth={1.7} fill="none" strokeLinecap="round" />
      </G>
      <Rect x={20} y={14} width={7} height={7} fill="#29C6E0" transform="rotate(45 23.5 17.5)" />
      <Rect x={214} y={20} width={7} height={7} fill="#FFD23F" transform="rotate(45 217.5 23.5)" />
      <Rect x={74} y={8} width={6} height={6} fill="#2FD49A" transform="rotate(45 77 11)" />
      <Rect x={168} y={6} width={6} height={6} fill="#FF8A1F" transform="rotate(45 171 9)" />
    </Svg>
  );
}

/** Hanging woven pennants that unroll from the top. */
function Pennant({ motif, colors, height, delay, cell }: { motif: Motif; colors: string[]; height: number; delay: number; cell: number }) {
  const reduced = useReducedMotion();
  const p = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    if (!reduced) p.value = withDelay(delay, withTiming(1, { duration: 650, easing: Easing.out(Easing.back(1.4)) }));
  }, []);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: (p.value - 1) * height }] }));
  return (
    <Animated.View style={[{ height, alignItems: "center" }, style]}>
      <AguayoBand motif={motif} colors={colors} cell={cell} vertical style={{ flex: 1 }} />
      <View style={{ width: 12, height: 12, marginTop: -6, backgroundColor: colors[0], transform: [{ rotate: "45deg" }] }} />
    </Animated.View>
  );
}

function useCountUp(target: number, run: boolean) {
  const reduced = useReducedMotion();
  const [v, setV] = useState(reduced || !run ? target : 0);
  useEffect(() => {
    if (reduced || !run) return setV(target);
    const start = Date.now();
    const timer = setInterval(() => {
      const k = Math.min(1, (Date.now() - start) / 1400);
      setV(Math.round(target * (1 - Math.pow(1 - k, 3))));
      if (k >= 1) clearInterval(timer);
    }, 33);
    return () => clearInterval(timer);
  }, [target, run]);
  return v;
}

/** Full screen: you took the pot. Closes with one tap. */
export function PotCelebration({
  round,
  groupName,
  amountCents,
  guaranteeCents,
  streak,
  onClose,
  onPassport,
}: {
  round: number;
  groupName: string;
  amountCents: number;
  guaranteeCents: number;
  streak: number | null;
  onClose: () => void;
  onPassport: () => void;
}) {
  const { t } = useI18n();
  const { c } = useScheme();
  const { width } = useWindowDimensions();
  const shown = useCountUp(amountCents, true);
  const narrow = Math.max(280, Math.min(width, 560));
  const [fu, na, am, ve, tu, li] = c.threads;

  useEffect(() => {
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    AccessibilityInfo.announceForAccessibility?.(`${t("gotPot")} ${money(amountCents)}`);
  }, []);

  const pennants: { motif: Motif; colors: string[]; h: number }[] = [
    { motif: "rombos", colors: [fu, am, ve], h: 120 },
    { motif: "zigzag", colors: [tu], h: 84 },
    { motif: "escalonado", colors: [am, fu], h: 140 },
    { motif: "rombos", colors: [ve, tu, am], h: 100 },
    { motif: "escalonado", colors: [fu, na], h: 130 },
    { motif: "zigzag", colors: [am], h: 90 },
    { motif: "rombos", colors: [tu, fu, li], h: 116 },
  ];

  return (
    <View accessibilityViewIsModal style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, backgroundColor: c.bg, zIndex: 100 }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
        {/* one tap anywhere closes it; the buttons inside still win their own taps */}
        <Pressable accessible={false} onPress={onClose} style={{ flexGrow: 1, alignItems: "center", paddingBottom: space(10) }}>
        <View pointerEvents="none" style={{ flexDirection: "row", justifyContent: "space-between", width: "100%", maxWidth: 720, paddingHorizontal: space(4), alignItems: "flex-start" }}>
          {pennants.map((p, i) => (
            <Pennant key={i} motif={p.motif} colors={p.colors} height={p.h} delay={i * 80} cell={3} />
          ))}
        </View>
        <View style={{ width: narrow, paddingHorizontal: space(5), gap: space(4), alignItems: "center", marginTop: space(4) }}>
          <Text style={{ fontFamily: fonts.bodyBold, fontSize: 15, color: c.verde.text, textAlign: "center" }}>
            {t("round")} {round}, {groupName}
          </Text>
          <Text accessibilityRole="header" style={{ fontFamily: fonts.displayHeavy, fontSize: 34, lineHeight: 40, color: c.ink, textAlign: "center" }}>
            {t("gotPot")}
          </Text>
          <Text style={{ fontFamily: fonts.displayHeavy, fontSize: 64, lineHeight: 72, color: c.amarillo.text, fontVariant: ["tabular-nums"] }}>{money(shown)}</Text>
          <Text style={{ fontFamily: fonts.body, fontSize: 16.5, color: c.muted, textAlign: "center" }}>{t("arrivedPayPal")}</Text>
          {guaranteeCents > 0 && (
            <View style={{ flexDirection: "row", gap: 12, alignItems: "flex-start", backgroundColor: c.surface, borderWidth: 1, borderColor: c.line, borderRadius: 10, padding: space(4), alignSelf: "stretch" }}>
              <Icon name="garantia" size={22} color={c.turquesa.text} />
              <Text style={{ flex: 1, fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: c.ink }}>
                <Text style={{ fontFamily: fonts.bodyBold }}>
                  {money(guaranteeCents)} {t("guaranteeKept")}
                </Text>{" "}
                {t("guaranteeBack")}
              </Text>
            </View>
          )}
          <View pointerEvents="none">
            <Cheering width={Math.max(120, Math.min(narrow - 40, 340))} />
          </View>
          {streak ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: c.amarillo.fill + "22" }}>
              <Icon name="racha" size={18} color={c.amarillo.text} />
              <Text style={{ fontFamily: fonts.bodyBold, fontSize: 15, color: c.amarillo.text }}>
                {t("streak")}: {streak} {t("onTimePayments")}
              </Text>
            </View>
          ) : null}
          <View style={{ alignSelf: "stretch", gap: space(3), marginTop: space(2) }}>
            <StepButton title={t("seePassport")} fill={c.fucsia.fill} ink={c.onAction} left={<Icon name="pasaporte" size={20} color={c.onAction} />} onPress={onPassport} />
            <StepButton title={t("keepWeaving")} fill={c.surface} stroke={c.line} ink={c.ink} onPress={onClose} />
          </View>
        </View>
        </Pressable>
      </ScrollView>
    </View>
  );
}
