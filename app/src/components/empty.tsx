/**
 * What a screen shows when it has nothing yet. Not a grey notice: a small woven piece (the loom with nothing on it
 * yet), a title that says what is going on, a line that says why and what would put something here, and when there is
 * an obvious next step, a button for it.
 */
import { Text, View } from "react-native";
import { AguayoBand } from "@/components/aguayo";
import { Button } from "@/components/ui";
import { Icon, type IconName } from "@/components/icons";
import { SteppedBox } from "@/components/stepped";
import { useScheme } from "@/lib/scheme";
import { fonts, space } from "@/lib/theme";

type Tone = "verde" | "turquesa" | "amarillo" | "fucsia" | "naranja";

export function Empty({ icon, title, body, tone = "turquesa", action }: { icon: IconName; title: string; body?: string; tone?: Tone; action?: { label: string; onPress: () => void } }) {
  const { c } = useScheme();
  const hue = c[tone];
  const [fu, , am, , tu] = c.threads;
  return (
    <SteppedBox fill={c.surface} stroke={c.line} step={5} style={{ overflow: "hidden" }}>
      <AguayoBand motif="zigzag" colors={[tu, am]} cell={3} />
      <View accessible accessibilityLabel={body ? `${title}. ${body}` : title} style={{ alignItems: "center", gap: space(3), paddingVertical: space(8), paddingHorizontal: space(6) }}>
        {/* the motif: the screen's own icon set in a diamond, between two loose threads */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <View style={{ width: 34, height: 3, backgroundColor: fu, opacity: 0.55 }} />
          <View style={{ width: 62, height: 62, alignItems: "center", justifyContent: "center" }}>
            <View style={{ position: "absolute", width: 46, height: 46, transform: [{ rotate: "45deg" }], backgroundColor: hue.fill + "26", borderWidth: 2, borderColor: hue.fill }} />
            <Icon name={icon} size={24} color={hue.text} />
          </View>
          <View style={{ width: 34, height: 3, backgroundColor: fu, opacity: 0.55 }} />
        </View>
        <Text accessibilityRole="header" style={{ fontFamily: fonts.display, fontSize: 18, lineHeight: 24, color: c.ink, textAlign: "center" }}>
          {title}
        </Text>
        {body ? <Text style={{ fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: c.muted, textAlign: "center", maxWidth: 460 }}>{body}</Text> : null}
        {action ? (
          <View style={{ marginTop: space(1) }}>
            <Button compact kind="secondary" title={action.label} onPress={action.onPress} />
          </View>
        ) : null}
      </View>
    </SteppedBox>
  );
}
