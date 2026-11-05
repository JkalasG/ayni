/**
 * Base components of the "Andes" system. Every color comes from the active sky
 * (night or dawn), so screens follow the color mode without extra work.
 */
import { type ReactNode } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View, type TextInputProps, type TextStyle, type ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { fonts, space } from "@/lib/theme";
import { useLayout } from "@/lib/layout";
import { useScheme } from "@/lib/scheme";
import { AguayoBand } from "@/components/aguayo";
import { Icon, type IconName } from "@/components/icons";
import { SteppedBox } from "@/components/stepped";
import { WovenAvatar } from "@/components/woven-avatar";

/** Page container. Phones: full width with gutters. Wide web: a calm reading column. */
export function Screen({ children, scroll = true, width = 640 }: { children: ReactNode; scroll?: boolean; width?: number }) {
  const { wide } = useLayout();
  const { c } = useScheme();
  const inner: ViewStyle = { width: "100%", alignSelf: "center", gap: space(5), maxWidth: width, paddingHorizontal: wide ? space(10) : space(4) };
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={[]}>
      {scroll ? (
        <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={{ paddingTop: wide ? space(8) : space(4), paddingBottom: space(16) }} keyboardShouldPersistTaps="handled">
          <View style={inner}>{children}</View>
        </ScrollView>
      ) : (
        <View style={[inner, { flex: 1, paddingTop: space(4) }]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

/** A thin woven band (zigzag between stripes). The app's one ornament for headers and cards. */
export function Weave({ cell = 3, motif = "zigzag" as const }: { cell?: number; motif?: "zigzag" | "franjas" | "rombos" | "escalonado"; size?: number; count?: number }) {
  const { c } = useScheme();
  const [fu, na, am, ve, tu] = c.threads;
  return <AguayoBand motif={motif} colors={motif === "franjas" ? [fu, am] : motif === "rombos" ? [fu, am, ve] : [tu, na]} cell={cell} />;
}
/** Old name, same thing. */
export const Stripe = (_: { height?: number }) => <Weave />;

/** A panel with the cloth's stepped corner. Hierarchy from borders and color, never shadows. */
export function Card({ children, style, tone = "surface" }: { children: ReactNode; style?: ViewStyle; tone?: "surface" | "lilac" | "ink" }) {
  const { c } = useScheme();
  const bg = tone === "lilac" ? c.surfaceAlt : c.surface;
  const { borderColor, ...rest } = (style ?? {}) as ViewStyle;
  return (
    <SteppedBox fill={bg} stroke={(borderColor as string) ?? c.line} step={4} style={{ padding: space(5), gap: space(3), ...rest }}>
      {children}
    </SteppedBox>
  );
}

/** Top of a form: a woven band and one sentence saying what the screen is for. */
export function FormHeader({ hint, icon }: { hint: string; icon: IconName }) {
  const { c } = useScheme();
  return (
    <SteppedBox fill={c.surfaceAlt} step={5} style={{ overflow: "hidden" }}>
      <Weave cell={3} motif="rombos" />
      <View style={{ flexDirection: "row", gap: space(3), padding: space(4), alignItems: "flex-start" }}>
        <Icon name={icon} size={28} color={c.fucsia.text} />
        <Text style={{ flex: 1, fontFamily: fonts.body, fontSize: 15.5, lineHeight: 23, color: c.ink }}>{hint}</Text>
      </View>
    </SteppedBox>
  );
}

/** Section on the page: a title, an optional aside, no box. */
export function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  const { c } = useScheme();
  return (
    <View style={{ gap: space(3) }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <Text style={{ fontFamily: fonts.display, fontSize: 17, lineHeight: 22, color: c.ink }} accessibilityRole="header">
          {title}
        </Text>
        {aside}
      </View>
      {children}
    </View>
  );
}

export function Display({ children, size = 44, color, style }: { children: ReactNode; size?: number; color?: string; style?: TextStyle }) {
  const { c } = useScheme();
  return (
    <Text style={[{ fontFamily: fonts.displayHeavy, fontSize: size, lineHeight: size * 1.1, color: color ?? c.ink, letterSpacing: -0.5, fontVariant: ["tabular-nums"] }, style]}>
      {children}
    </Text>
  );
}
export function H1({ children, style }: { children: ReactNode; style?: TextStyle }) {
  const { c } = useScheme();
  return (
    <Text style={[{ fontFamily: fonts.display, fontSize: 26, lineHeight: 32, color: c.ink, letterSpacing: -0.3 }, style]} accessibilityRole="header">
      {children}
    </Text>
  );
}
export function H2({ children, style }: { children: ReactNode; style?: TextStyle }) {
  const { c } = useScheme();
  return (
    <Text style={[{ fontFamily: fonts.display, fontSize: 17, lineHeight: 22, color: c.ink }, style]} accessibilityRole="header">
      {children}
    </Text>
  );
}
export function P({ children, muted, style, bold }: { children: ReactNode; muted?: boolean; bold?: boolean; style?: object }) {
  const { c } = useScheme();
  return <Text style={[{ fontFamily: bold ? fonts.bodyBold : fonts.body, fontSize: 16, lineHeight: 24, color: muted ? c.muted : c.ink }, style]}>{children}</Text>;
}
/** Money in body text: tabular figures so columns line up. */
export function Money({ children, style }: { children: ReactNode; style?: TextStyle }) {
  const { c } = useScheme();
  return <Text style={[{ fontFamily: fonts.displayMedium, fontVariant: ["tabular-nums"], color: c.ink }, style]}>{children}</Text>;
}

type BtnKind = "primary" | "secondary" | "paypal" | "ghost" | "danger" | "light";
/** Buttons end in stepped corners, like the edge of a cloth. */
export function Button({
  title,
  onPress,
  kind = "primary",
  loading,
  disabled,
  compact,
  accessibilityLabel,
  left,
}: {
  title: string;
  onPress: () => void;
  kind?: BtnKind;
  loading?: boolean;
  disabled?: boolean;
  compact?: boolean;
  accessibilityLabel?: string;
  left?: ReactNode;
}) {
  const { c } = useScheme();
  const off = !!disabled && !loading;
  const fill = off ? c.surfaceAlt : { primary: c.fucsia.fill, secondary: c.surfaceAlt, paypal: c.paypal, ghost: "transparent", danger: "transparent", light: c.surface }[kind];
  const fg = off ? c.muted : { primary: c.onAction, secondary: c.ink, paypal: c.paypalInk, ghost: c.fucsia.text, danger: c.rojo.text, light: c.ink }[kind];
  const label = loading ? <ActivityIndicator color={fg} /> : <Text style={{ fontFamily: fonts.bodyBold, fontSize: compact ? 15.5 : 16.5, color: fg, textAlign: "center" }}>{title}</Text>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: !!disabled, busy: !!loading }}
      onPress={onPress}
      disabled={disabled || loading}
      style={({ focused }: any) => [focused && ({ outlineColor: c.ink, outlineWidth: 2, outlineStyle: "solid", outlineOffset: 2 } as any)]}
    >
      {({ pressed, hovered }: any) =>
        kind === "ghost" ? (
          <View style={{ minHeight: 44, justifyContent: "center", paddingHorizontal: space(2), opacity: pressed ? 0.7 : 1 }}>{label}</View>
        ) : (
          <SteppedBox
            fill={fill}
            stroke={off ? c.line : kind === "danger" ? c.rojo.fill : kind === "light" ? c.line : undefined}
            step={4}
            style={{
              minHeight: compact ? 44 : 52,
              paddingHorizontal: compact ? space(4) : space(6),
              flexDirection: "row",
              gap: 10,
              alignItems: "center",
              justifyContent: "center",
              opacity: pressed ? 0.8 : hovered ? 0.92 : 1,
            }}
          >
            {left}
            {label}
          </SteppedBox>
        )
      }
    </Pressable>
  );
}

/** A tappable row: label, optional hint, and a stitched chevron. */
export function LinkRow({ title, hint, onPress, last }: { title: string; hint?: string; onPress: () => void; last?: boolean }) {
  const { c } = useScheme();
  return (
    <Pressable
      accessibilityRole="link"
      onPress={onPress}
      style={({ pressed, hovered }: any) => [
        { flexDirection: "row", alignItems: "center", paddingVertical: space(3.5), paddingHorizontal: space(1), gap: 12, borderBottomWidth: last ? 0 : 1, borderColor: c.line, minHeight: 56 },
        (pressed || hovered) && { backgroundColor: c.surfaceAlt },
      ]}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontFamily: fonts.bodyBold, fontSize: 16, color: c.ink }}>{title}</Text>
        {hint ? <Text style={{ fontFamily: fonts.body, fontSize: 14, lineHeight: 19, color: c.muted }}>{hint}</Text> : null}
      </View>
      <View style={{ width: 8, height: 8, borderTopWidth: 2, borderRightWidth: 2, borderColor: c.muted, transform: [{ rotate: "45deg" }], marginRight: 6 }} />
    </Pressable>
  );
}

export function Field({ label, hint, ...props }: TextInputProps & { label: string; hint?: string }) {
  const { c } = useScheme();
  return (
    <View style={{ gap: space(1.5) }}>
      <Text style={{ fontFamily: fonts.bodyBold, fontSize: 14.5, color: c.ink }}>{label}</Text>
      <SteppedBox fill={c.surface} stroke={c.line} step={3} style={{ minHeight: props.multiline ? 96 : 50 }}>
        <TextInput
          placeholderTextColor={c.muted}
          style={[
            {
              paddingHorizontal: space(4),
              paddingVertical: space(3),
              fontSize: 16,
              fontFamily: fonts.body,
              color: c.ink,
              minHeight: props.multiline ? 96 : 50,
              position: "relative",
              zIndex: 1,
            },
            props.multiline && { textAlignVertical: "top" },
            { outlineStyle: "none" } as any,
          ]}
          accessibilityLabel={label}
          {...props}
        />
      </SteppedBox>
      {hint ? <Text style={{ fontFamily: fonts.body, fontSize: 14, lineHeight: 19, color: c.muted }}>{hint}</Text> : null}
    </View>
  );
}

/** Choice chips. Selected = fucsia, the action color. */
export function Chips<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label?: string;
}) {
  const { c } = useScheme();
  return (
    <View style={{ gap: space(1.5) }}>
      {label ? <Text style={{ fontFamily: fonts.bodyBold, fontSize: 14.5, color: c.ink }}>{label}</Text> : null}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space(2) }} accessibilityRole="radiogroup">
        {options.map((o) => {
          const on = o.value === value;
          return (
            <Pressable key={o.value} onPress={() => onChange(o.value)} accessibilityRole="radio" accessibilityState={{ selected: on, checked: on }}>
              <SteppedBox fill={on ? c.fucsia.fill : c.surface} stroke={on ? c.fucsia.fill : c.line} step={3} style={{ minHeight: 44, justifyContent: "center", paddingHorizontal: space(4) }}>
                <Text style={{ color: on ? c.onAction : c.ink, fontFamily: fonts.bodyBold, fontSize: 15 }}>{o.label}</Text>
              </SteppedBox>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** State marker: a small stitch in the state color plus the word. Never color alone. */
export function Badge({ text, color }: { text: string; color: string }) {
  return (
    <SteppedBox fill={color + "22"} step={2} style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 5, alignSelf: "flex-start" }}>
      <View style={{ width: 7, height: 7, backgroundColor: color, transform: [{ rotate: "45deg" }] }} />
      <Text style={{ color, fontFamily: fonts.bodyBold, fontSize: 13 }}>{text}</Text>
    </SteppedBox>
  );
}

/** Kept for older callers: the woven avatar, seeded by the name when no id is given. */
export function Avatar({ name, id, size = 40 }: { name: string; id?: string; color?: string; size?: number }) {
  return <WovenAvatar id={id ?? name} name={name} size={size} />;
}

export function Loading() {
  const { c } = useScheme();
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: c.bg, gap: 16 }}>
      <View style={{ width: 120 }}>
        <Weave cell={4} motif="rombos" />
      </View>
      <ActivityIndicator color={c.fucsia.fill} />
    </View>
  );
}

/** A plain message with a next step, for empty states and errors. */
export function Notice({ children, tone = "info" }: { children: ReactNode; tone?: "info" | "ok" | "error" }) {
  const { c } = useScheme();
  const col = tone === "ok" ? c.verde.fill : tone === "error" ? c.rojo.fill : c.turquesa.fill;
  return (
    <View accessibilityRole="alert" accessibilityLiveRegion="polite" style={{ borderLeftWidth: 4, borderColor: col, backgroundColor: col + "1A", paddingVertical: space(3), paddingHorizontal: space(4), borderRadius: 6 }}>
      <Text style={{ fontFamily: fonts.body, fontSize: 16, lineHeight: 24, color: c.ink }}>{children}</Text>
    </View>
  );
}

/** Small text styles for callers that compose their own Text. */
export const type = {
  get small(): TextStyle {
    return { fontFamily: fonts.body, fontSize: 14, lineHeight: 19 };
  },
  get label(): TextStyle {
    return { fontFamily: fonts.bodyBold, fontSize: 14.5 };
  },
};
