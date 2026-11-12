/**
 * Room for explanations on a computer: the form (or the list) on the left and, beside it, a panel that tells someone
 * who has never seen Ayni what this screen is for and what happens next. On a phone the panel goes under the content.
 */
import type { ReactNode } from "react";
import { Text, View } from "react-native";
import { Icon, type IconName } from "@/components/icons";
import { SteppedBox } from "@/components/stepped";
import { useLayout } from "@/lib/layout";
import { useScheme } from "@/lib/scheme";
import { fonts, space } from "@/lib/theme";

export function TwoCol({ children, side, sideWidth = 400 }: { children: ReactNode; side: ReactNode; sideWidth?: number }) {
  const { wide } = useLayout();
  if (!wide) {
    return (
      <View style={{ gap: space(5) }}>
        {children}
        {side}
      </View>
    );
  }
  return (
    <View style={{ flexDirection: "row", gap: space(8), alignItems: "flex-start" }}>
      <View style={{ flex: 1, minWidth: 0, maxWidth: 760, gap: space(5) }}>{children}</View>
      <View style={{ width: sideWidth, gap: space(4), position: "sticky" as any, top: space(4) }}>{side}</View>
    </View>
  );
}

/** Numbered steps: "how this works", in a few words each. */
export function Guide({ title, steps, icon = "rayo", note }: { title: string; steps: { title: string; body: string }[]; icon?: IconName; note?: string }) {
  const { c } = useScheme();
  return (
    <SteppedBox fill={c.surface} stroke={c.line} step={5} style={{ padding: space(5), gap: space(4) }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Icon name={icon} size={18} color={c.turquesa.text} />
        <Text accessibilityRole="header" style={{ flex: 1, fontFamily: fonts.display, fontSize: 16.5, color: c.ink }}>
          {title}
        </Text>
      </View>
      {steps.map((s, i) => (
        <View key={i} style={{ flexDirection: "row", gap: 12 }}>
          <View style={{ width: 26, height: 26, alignItems: "center", justifyContent: "center", backgroundColor: c.turquesa.fill + "26" }}>
            <Text style={{ fontFamily: fonts.display, fontSize: 13, color: c.turquesa.text }}>{i + 1}</Text>
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ fontFamily: fonts.bodyBold, fontSize: 14.5, color: c.ink }}>{s.title}</Text>
            <Text style={{ fontFamily: fonts.body, fontSize: 13.5, lineHeight: 19, color: c.muted }}>{s.body}</Text>
          </View>
        </View>
      ))}
      {note ? <Text style={{ fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: c.muted, borderTopWidth: 1, borderColor: c.line, paddingTop: space(3) }}>{note}</Text> : null}
    </SteppedBox>
  );
}

/** A titled group of fields inside a form, with a number so the order is obvious. */
export function FormSection({ n, title, hint, children }: { n: number; title: string; hint?: string; children: ReactNode }) {
  const { c } = useScheme();
  return (
    <SteppedBox fill={c.surface} stroke={c.line} step={5} style={{ padding: space(5), gap: space(4) }}>
      <View style={{ gap: 2 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <View style={{ width: 26, height: 26, alignItems: "center", justifyContent: "center", backgroundColor: c.fucsia.fill }}>
            <Text style={{ fontFamily: fonts.display, fontSize: 13, color: c.onAction }}>{n}</Text>
          </View>
          <Text accessibilityRole="header" style={{ flex: 1, fontFamily: fonts.display, fontSize: 17, color: c.ink }}>
            {title}
          </Text>
        </View>
        {hint ? <Text style={{ fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: c.muted, marginLeft: 36 }}>{hint}</Text> : null}
      </View>
      {children}
    </SteppedBox>
  );
}
