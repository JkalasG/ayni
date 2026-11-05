import { Pressable, Text, View } from "react-native";
import { Icon, type IconName } from "@/components/icons";
import { SteppedBox } from "@/components/stepped";
import { useI18n, type Key } from "@/lib/i18n";
import { useScheme, type SchemePref } from "@/lib/scheme";
import { fonts } from "@/lib/theme";

const SCHEMES: { pref: SchemePref; icon: IconName; label: Key }[] = [
  { pref: "system", icon: "sistema", label: "schemeSystem" },
  { pref: "light", icon: "claro", label: "schemeLight" },
  { pref: "dark", icon: "oscuro", label: "schemeDark" },
];

/** Language and color mode, always reachable at the top. */
export function Controls({ compact }: { compact?: boolean }) {
  const { t, lang, setLang } = useI18n();
  const { c, pref, setPref } = useScheme();
  return (
    <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("languageLabel")}
        onPress={() => setLang(lang === "es" ? "en" : "es")}
        style={({ hovered }: any) => ({ opacity: hovered ? 0.85 : 1 })}
      >
        <SteppedBox fill={c.surface} step={3} style={{ height: 44, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Icon name="idioma" size={20} color={c.ink} />
          {compact ? null : <Text style={{ fontFamily: fonts.bodyBold, fontSize: 15, color: c.ink }}>{t("language")}</Text>}
        </SteppedBox>
      </Pressable>
      <SteppedBox fill={c.surface} step={3} style={{ height: 44, flexDirection: "row", padding: 3, gap: 2 }}>
        <View accessibilityRole="radiogroup" accessibilityLabel={t("schemeLabel")} style={{ flexDirection: "row", gap: 2 }}>
          {SCHEMES.map((s) => {
            const on = pref === s.pref;
            return (
              <Pressable
                key={s.pref}
                accessibilityRole="radio"
                accessibilityLabel={t(s.label)}
                accessibilityState={{ checked: on }}
                onPress={() => setPref(s.pref)}
                style={{ width: 44, height: 38, alignItems: "center", justifyContent: "center", backgroundColor: on ? c.fucsia.fill : "transparent" }}
              >
                <Icon name={s.icon} size={18} color={on ? c.onAction : c.ink} />
              </Pressable>
            );
          })}
        </View>
      </SteppedBox>
    </View>
  );
}

