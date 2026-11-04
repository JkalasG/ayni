import { type ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, radius, space, stripe } from "@/lib/theme";

export function Screen({ children, scroll = true }: { children: ReactNode; scroll?: boolean }) {
  return (
    <SafeAreaView style={s.screen} edges={["bottom"]}>
      {scroll ? (
        <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
          <View style={s.inner}>{children}</View>
        </ScrollView>
      ) : (
        <View style={[s.content, s.inner, { flex: 1 }]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

/** Thin aguayo-inspired band of colors. */
export function Stripe({ height = 6 }: { height?: number }) {
  return (
    <View style={{ flexDirection: "row", height, borderRadius: height, overflow: "hidden" }}>
      {stripe.map((c, i) => (
        <View key={i} style={{ flex: 1, backgroundColor: c }} />
      ))}
    </View>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[s.card, style]}>{children}</View>;
}

export function H1({ children }: { children: ReactNode }) {
  return <Text style={s.h1}>{children}</Text>;
}
export function H2({ children }: { children: ReactNode }) {
  return <Text style={s.h2}>{children}</Text>;
}
export function P({ children, muted, style }: { children: ReactNode; muted?: boolean; style?: object }) {
  return <Text style={[s.p, muted && { color: colors.muted }, style]}>{children}</Text>;
}

type BtnKind = "primary" | "secondary" | "paypal" | "ghost" | "danger";
export function Button({
  title,
  onPress,
  kind = "primary",
  loading,
  disabled,
}: {
  title: string;
  onPress: () => void;
  kind?: BtnKind;
  loading?: boolean;
  disabled?: boolean;
}) {
  const bg = {
    primary: colors.primary,
    secondary: colors.surfaceAlt,
    paypal: colors.paypal,
    ghost: "transparent",
    danger: colors.surface,
  }[kind];
  const fg = {
    primary: colors.primaryInk,
    secondary: colors.ink,
    paypal: colors.paypalInk,
    ghost: colors.primary,
    danger: colors.danger,
  }[kind];
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        s.btn,
        { backgroundColor: bg, opacity: disabled ? 0.5 : pressed ? 0.85 : 1 },
        kind === "danger" && { borderWidth: 1, borderColor: colors.danger },
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : <Text style={[s.btnText, { color: fg }]}>{title}</Text>}
    </Pressable>
  );
}

export function Field({ label, ...props }: TextInputProps & { label: string }) {
  return (
    <View style={{ gap: space(1.5) }}>
      <Text style={s.label}>{label}</Text>
      <TextInput placeholderTextColor={colors.muted} style={s.input} {...props} />
    </View>
  );
}

export function Chips<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <View style={{ gap: space(1.5) }}>
      <Text style={s.label}>{label}</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space(2) }}>
        {options.map((o) => {
          const on = o.value === value;
          return (
            <Pressable
              key={o.value}
              onPress={() => onChange(o.value)}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              style={[s.chip, on && { backgroundColor: colors.primary, borderColor: colors.primary }]}
            >
              <Text style={{ color: on ? colors.primaryInk : colors.ink, fontWeight: "600" }}>{o.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function Badge({ text, color }: { text: string; color: string }) {
  return (
    <View style={{ backgroundColor: color + "22", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 99 }}>
      <Text style={{ color, fontWeight: "700", fontSize: 12 }}>{text}</Text>
    </View>
  );
}

export function Avatar({ name, color = colors.corn }: { name: string; color?: string }) {
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <View style={[s.avatar, { backgroundColor: color }]}>
      <Text style={{ color: "#fff", fontWeight: "800" }}>{initials}</Text>
    </View>
  );
}

export function Loading() {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg }}>
      <ActivityIndicator color={colors.primary} size="large" />
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space(4), paddingBottom: space(10) },
  inner: { width: "100%", maxWidth: 560, alignSelf: "center", gap: space(4) },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: space(4),
    gap: space(3),
    borderWidth: 1,
    borderColor: colors.line,
  },
  h1: { fontSize: 28, fontWeight: "800", color: colors.ink },
  h2: { fontSize: 18, fontWeight: "700", color: colors.ink },
  p: { fontSize: 15, lineHeight: 22, color: colors.ink },
  label: { fontSize: 13, fontWeight: "700", color: colors.muted, textTransform: "uppercase", letterSpacing: 0.5 },
  btn: { minHeight: 50, borderRadius: radius.lg, alignItems: "center", justifyContent: "center", paddingHorizontal: space(5) },
  btnText: { fontSize: 16, fontWeight: "700" },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.sm,
    paddingHorizontal: space(3),
    paddingVertical: space(3),
    fontSize: 16,
    color: colors.ink,
  },
  chip: {
    paddingHorizontal: space(3.5),
    paddingVertical: space(2),
    borderRadius: 99,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
});
