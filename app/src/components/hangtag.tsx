/**
 * A small hang tag (like the paper tags on clothes) pinned to the corner of a button, and the dialog it opens.
 * Both are drawn in the app's own palette so they look part of the page.
 */
import type { ReactNode } from "react";
import { Modal, Pressable, ScrollView, Text, useWindowDimensions, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { SteppedBox } from "@/components/stepped";
import { useScheme } from "@/lib/scheme";
import { useI18n } from "@/lib/i18n";
import { fonts, space } from "@/lib/theme";

const W = 118;
const H = 46;
/** Room a button needs above it so the tag hangs outside it, not over its text. */
export const TAG_ROOM = 28;

/**
 * The tag sits ABOVE the button and hangs from its top-right corner: the string ends exactly on that corner.
 * `dark` is an ink tag with light letters; the other is a light tag with a dark outline. `hole` is the colour behind it.
 */
export function HangTag({ label, dark, hole, open, onPress }: { label: string; dark?: boolean; hole: string; open: boolean; onPress: () => void }) {
  const { c } = useScheme();
  const body = dark ? c.ink : c.surface;
  const text = dark ? c.bg : c.ink;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ expanded: open }}
      hitSlop={6}
      onPress={onPress}
      // bottom-right of this box is the button's top-right corner, and the tag swings from there
      style={({ hovered, pressed }: any) => ({ position: "absolute", top: -H + 2, right: -4, width: W, height: H, zIndex: 2, transformOrigin: "100% 100%", transform: [{ rotate: hovered || pressed ? "-9deg" : "-4deg" }] })}
    >
      <Svg width={W} height={H} style={{ position: "absolute" }} pointerEvents="none">
        {/* the tag */}
        <Path d="M5 3H78L95 13V23L78 33H5Q2 33 2 30V6Q2 3 5 3Z" fill={body} stroke={c.ink} strokeWidth={2} strokeLinejoin="round" />
        <Circle cx={85} cy={18} r={3.6} fill={hole} stroke={c.ink} strokeWidth={1.6} />
        {/* the string: through the hole, down to the button's corner, ending in a knot */}
        <Path d="M85 18C92 30 104 30 112 41" stroke={c.ink} strokeWidth={2} fill="none" strokeLinecap="round" />
        <Circle cx={112} cy={42} r={3} fill={c.ink} />
      </Svg>
      <Text numberOfLines={1} style={{ position: "absolute", left: 12, top: 3, width: 62, height: 30, lineHeight: 30, fontFamily: fonts.bodyBold, fontSize: 14, letterSpacing: 0.3, color: text }}>
        {label}
      </Text>
    </Pressable>
  );
}

/** A centered dialog in the page's stepped style; tapping outside or the ✕ closes it. */
export function Dialog({ visible, title, onClose, children }: { visible: boolean; title: string; onClose: () => void; children: ReactNode }) {
  const { c } = useScheme();
  const { t } = useI18n();
  const { height } = useWindowDimensions();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: space(4) }}>
        <Pressable accessibilityRole="button" accessibilityLabel={t("close")} onPress={onClose} style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, backgroundColor: "rgba(12,12,34,0.62)" }} />
        <View accessibilityViewIsModal style={{ width: "100%", maxWidth: 480 }}>
          <SteppedBox fill={c.surface} stroke={c.ink} step={6} style={{ padding: space(5), gap: space(3) }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <Text accessibilityRole="header" style={{ flex: 1, fontFamily: fonts.displayHeavy, fontSize: 22, lineHeight: 28, color: c.ink }}>{title}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel={t("close")} onPress={onClose} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: c.line }}>
                <Text style={{ fontFamily: fonts.bodyBold, fontSize: 18, color: c.ink }}>✕</Text>
              </Pressable>
            </View>
            <ScrollView style={{ maxHeight: Math.max(240, height * 0.62) }} contentContainerStyle={{ gap: space(3) }}>{children}</ScrollView>
          </SteppedBox>
        </View>
      </View>
    </Modal>
  );
}
