/**
 * Ayni's corner system: key elements end in a stepped corner, like the edge of a
 * woven cloth. Drawn in SVG behind the content, sized from the layout.
 */
import { useState, type ReactNode } from "react";
import { Platform, Pressable, Text, View, type ViewStyle } from "react-native";
import Svg, { Path } from "react-native-svg";
import * as Haptics from "expo-haptics";
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring } from "react-native-reanimated";
import { fonts } from "@/lib/theme";

export function steppedPath(w: number, h: number, s: number) {
  const t = 2 * s;
  return [
    `M${t} 0H${w - t}V${s}H${w - s}V${t}H${w}`,
    `V${h - t}H${w - s}V${h - s}H${w - t}V${h}`,
    `H${t}V${h - s}H${s}V${h - t}H0`,
    `V${t}H${s}V${s}H${t}Z`,
  ].join("");
}

export function SteppedBox({
  fill,
  stroke,
  step = 4,
  style,
  children,
}: {
  fill: string;
  stroke?: string;
  step?: number;
  style?: ViewStyle;
  children?: ReactNode;
}) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  return (
    <View style={style} onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
      {size.w > 0 && (
        <Svg width={size.w} height={size.h} style={{ position: "absolute", left: 0, top: 0 }} pointerEvents="none">
          <Path d={steppedPath(size.w, size.h, step)} fill={fill} stroke={stroke} strokeWidth={stroke ? 2 : 0} />
        </Svg>
      )}
      {children}
    </View>
  );
}

/** Main button: stepped corners, a small press pulse and (on phones) a light vibration. */
export function StepButton({
  title,
  onPress,
  fill,
  ink,
  stroke,
  loading,
  left,
  accessibilityLabel,
  expanded,
}: {
  title: string;
  onPress: () => void;
  fill: string;
  ink: string;
  stroke?: string;
  loading?: boolean;
  left?: ReactNode;
  accessibilityLabel?: string;
  expanded?: boolean;
}) {
  const reduced = useReducedMotion();
  const scale = useSharedValue(1);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ busy: !!loading, expanded }}
      disabled={loading}
      onPressIn={() => {
        if (!reduced) scale.value = withSpring(0.96, { damping: 18, stiffness: 420 });
        if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      }}
      onPressOut={() => {
        scale.value = withSpring(1, { damping: 14, stiffness: 300 });
      }}
      onPress={onPress}
      style={({ focused }: any) => (focused ? { outlineStyle: "solid", outlineWidth: 3, outlineColor: ink, outlineOffset: 3 } as any : null)}
    >
      {({ hovered }: any) => (
        <Animated.View style={anim}>
          <SteppedBox
            fill={fill}
            stroke={stroke}
            step={5}
            style={{ minHeight: 58, paddingHorizontal: 22, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 12, opacity: hovered ? 0.92 : 1 }}
          >
            {left}
            <Text style={{ fontFamily: fonts.bodyBold, fontSize: 17.5, color: ink }}>{loading ? "…" : title}</Text>
          </SteppedBox>
        </Animated.View>
      )}
    </Pressable>
  );
}
