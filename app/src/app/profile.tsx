import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Platform, Pressable, ScrollView, Share, Text, View } from "react-native";
import { Stack, router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming } from "react-native-reanimated";
import { LinkRow, Loading, Notice, Weave } from "@/components/ui";
import { Icon } from "@/components/icons";
import { StepButton, SteppedBox } from "@/components/stepped";
import { WovenAvatar, WovenEmblem } from "@/components/woven-avatar";
import { Confetti } from "@/components/celebrations";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { useLayout } from "@/lib/layout";
import { useScheme } from "@/lib/scheme";
import { api } from "@/lib/api";
import { getValue, setValue } from "@/lib/flags";
import { ACHIEVEMENTS, LEVELS, levelOf, type Profile } from "@/lib/levels";
import { fonts, space, type Palette } from "@/lib/theme";

/** "Mi pasaporte de confianza": the person's record of keeping their word, with pride. */
export default function Passport() {
  const { t, lang } = useI18n();
  const { me } = useAuth();
  const { c } = useScheme();
  const { wide } = useLayout();
  const insets = useSafeAreaInsets();
  const [p, setP] = useState<Profile | null>(null);
  const [levelUp, setLevelUp] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);

  useFocusEffect(
    useCallback(() => {
      api<Profile>("/me/profile").then(setP).catch(() => {});
    }, [])
  );

  // A level reached since the last visit on this device gets its moment.
  useEffect(() => {
    if (!p || !me) return;
    const { level } = levelOf(p);
    const key = `ayni_level_${me.id}`;
    getValue(key).then((v) => {
      if (v != null && Number(v) < level) setLevelUp(level);
      if (v == null || Number(v) !== level) setValue(key, String(level));
    });
  }, [p, me]);

  if (!p || !me) return <Loading />;

  const { level, next, missing } = levelOf(p);
  const locale = lang === "en" ? "en-US" : "es-BO";
  const since = new Date(Date.now() - p.accountAgeDays * 86_400_000).toLocaleDateString(locale, { month: "long", year: "numeric" });
  const streak = p.streak ?? 0;
  const [fu, , am, ve, tu] = c.threads;

  const share = async () => {
    const text = `${me.name}: ${t("level")} ${t(LEVELS[level].key)}. ${p.completed} ${t("completedPasanakus").toLowerCase()}, ${p.onTimePct ?? 0}% ${t("onTimeShort")}, ${t("streak").toLowerCase()} ${streak}.${
      p.paypalVerified ? ` ${t("verified")}.` : ""
    } Ayni`;
    if (Platform.OS !== "web") return void Share.share({ message: text });
    const nav: any = globalThis.navigator;
    if (nav?.share) return void nav.share({ title: t("passportTitle"), text }).catch(() => {});
    await nav?.clipboard?.writeText(text).catch(() => {});
    setCopied(true);
  };

  const missingText = missing
    .map((m) => (m.key === "needCompleted" ? `${m.n} ${m.n === 1 ? t("needCompletedOne") : t("needCompletedMany")}` : m.key === "needOnTime" ? `${m.n}% ${t("onTimeShort")}` : t("needNoGuarantee")))
    .join(` ${t("and")} `);

  // ---------------------------------------------------------------- blocks

  const hero = (
    <SteppedBox fill={c.surface} stroke={c.line} step={6} style={{ overflow: "hidden" }}>
      <Weave cell={4} motif="rombos" />
      <View style={{ padding: space(5), flexDirection: "row", gap: space(4), alignItems: "center" }}>
        <WovenAvatar id={me.id} name={me.name} size={wide ? 96 : 76} />
        <View style={{ flex: 1, gap: 4 }}>
          <Text accessibilityRole="header" style={{ fontFamily: fonts.displayHeavy, fontSize: wide ? 34 : 26, lineHeight: wide ? 40 : 31, color: c.ink }}>
            {me.name}
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Icon name={p.paypalVerified ? "aprobar" : "rechazar"} size={15} color={p.paypalVerified ? c.turquesa.text : c.rojo.text} />
            <Text style={{ fontFamily: fonts.bodyBold, fontSize: 14.5, color: p.paypalVerified ? c.turquesa.text : c.rojo.text }}>{p.paypalVerified ? t("verified") : t("notVerified")}</Text>
          </View>
          <Text style={{ fontFamily: fonts.body, fontSize: 14, color: c.muted }}>
            {t("inAyniSince")} {since}
          </Text>
        </View>
      </View>
    </SteppedBox>
  );

  const levelCard = (
    <Panel c={c}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text accessibilityRole="header" style={{ fontFamily: fonts.display, fontSize: 20, color: c.ink }}>
          {t("level")} {t(LEVELS[level].key)}
        </Text>
        <Text style={{ fontFamily: fonts.body, fontSize: 14, color: c.muted }}>
          {level + 1} {t("of")} {LEVELS.length}
        </Text>
      </View>
      <LevelTrack c={c} level={level} />
      <Text style={{ fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: c.muted }}>
        {next == null ? (
          t("topLevel")
        ) : (
          <>
            {t("toReach")} <Text style={{ fontFamily: fonts.bodyBold, color: c.amarillo.text }}>{t(LEVELS[next].key)}</Text> {t("youNeed")} {missingText}.
          </>
        )}
      </Text>
    </Panel>
  );

  const stats = (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space(3) }}>
      <Stat c={c} value={p.onTimePct == null ? "—" : `${p.onTimePct}%`} label={t("onTimePayments")} color={c.verde.text} />
      <Stat c={c} value={String(streak)} label={t("streakLabel")} color={c.amarillo.text} icon={<Icon name="racha" size={22} color={c.amarillo.text} />} />
      <Stat c={c} value={String(p.completed)} label={t("completedPasanakus")} color={c.ink} />
      <Stat c={c} value={String(p.covered)} label={t("timesGuarantee")} color={c.turquesa.text} />
    </View>
  );

  const achievements = (
    <Panel c={c}>
      <Text accessibilityRole="header" style={{ fontFamily: fonts.display, fontSize: 18, color: c.ink }}>
        {t("achievements")}
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", rowGap: space(4) }}>
        {ACHIEVEMENTS.map((a, i) => {
          const got = a.got(p);
          return (
            <View
              key={a.key}
              accessible
              accessibilityLabel={`${t(a.key)}: ${got ? t("unlocked") : t("locked")}`}
              style={{ width: "33.33%", alignItems: "center", gap: 6, paddingHorizontal: 4 }}
            >
              <WovenEmblem motif={a.motif} size={wide ? 60 : 52} colors={[[fu, am, ve, tu][i % 4], [am, tu, fu, ve][i % 4], c.surfaceAlt]} locked={!got} lockedColor={c.line} />
              <Text style={{ fontFamily: got ? fonts.bodyBold : fonts.body, fontSize: 13, lineHeight: 17, color: got ? c.ink : c.muted, textAlign: "center" }}>{t(a.key)}</Text>
              {!got && <Text style={{ fontFamily: fonts.body, fontSize: 12, color: c.muted }}>{t("locked")}</Text>}
            </View>
          );
        })}
      </View>
    </Panel>
  );

  const history = (
    <Panel c={c}>
      <Text accessibilityRole="header" style={{ fontFamily: fonts.display, fontSize: 18, color: c.ink }}>
        {t("history")}
      </Text>
      {[
        [t("activeGroups"), String(p.activeGroups)],
        [t("onTimeCount"), String(p.onTime)],
        [t("lates"), String(p.late)],
        [t("abandoned"), String(p.abandoned)],
        [t("accountAge"), `${p.accountAgeDays} ${t("days")}`],
      ].map(([k, v], i, all) => (
        <View key={k} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 10, borderBottomWidth: i < all.length - 1 ? 1 : 0, borderColor: c.line }}>
          <Text style={{ fontFamily: fonts.body, fontSize: 15, color: c.muted }}>{k}</Text>
          <Text style={{ fontFamily: fonts.bodyBold, fontSize: 15, color: c.ink, fontVariant: ["tabular-nums"] }}>{v}</Text>
        </View>
      ))}
      <Text style={{ fontFamily: fonts.body, fontSize: 13.5, lineHeight: 19, color: c.muted }}>{t("profileHint")}</Text>
    </Panel>
  );

  const shareBtn = (
    <StepButton title={t("sharePassport")} fill={c.fucsia.fill} ink={c.onAction} left={<Icon name="compartir" size={20} color={c.onAction} />} onPress={share} />
  );

  const paymentsLink = (
    <View style={{ borderTopWidth: 1, borderBottomWidth: 1, borderColor: c.line }}>
      <LinkRow title={t("myPayments")} hint={t("myPaymentsShort")} onPress={() => router.push("/payments" as any)} />
      <LinkRow title={t("aiConnect")} hint={t("aiConnectShort")} onPress={() => router.push("/connect" as any)} last />
    </View>
  );

  const top = (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space(3) }}>
      {!wide && router.canGoBack() && (
        <Pressable accessibilityRole="button" accessibilityLabel={t("back")} onPress={() => router.back()}>
          <SteppedBox fill={c.surface} stroke={c.line} step={3} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
            <Icon name="atras" size={18} color={c.ink} />
          </SteppedBox>
        </Pressable>
      )}
      <Text accessibilityRole="header" style={{ flex: 1, fontFamily: fonts.display, fontSize: wide ? 30 : 20, color: c.ink }}>
        {t("passportTitle")}
      </Text>
      <Pressable accessibilityRole="button" accessibilityLabel={t("sharePassport")} onPress={share}>
        <SteppedBox fill={c.surface} stroke={c.line} step={3} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
          <Icon name="compartir" size={18} color={c.ink} />
        </SteppedBox>
      </Pressable>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: t("passportTitle"), headerShown: false }} />
      <ScrollView contentContainerStyle={{ paddingTop: wide ? space(10) : insets.top + space(3), paddingHorizontal: wide ? space(10) : space(4), paddingBottom: space(12) }}>
        <View style={{ maxWidth: wide ? 1100 : 600, width: "100%", alignSelf: "center", gap: space(5) }}>
          {top}
          {copied && <Notice tone="ok">{t("copied")}</Notice>}
          {wide ? (
            <View style={{ flexDirection: "row", gap: space(6), alignItems: "flex-start" }}>
              <View style={{ flex: 1, gap: space(5) }}>
                {hero}
                {levelCard}
                {stats}
                {paymentsLink}
                {shareBtn}
              </View>
              <View style={{ flex: 1, gap: space(5) }}>
                {achievements}
                {history}
              </View>
            </View>
          ) : (
            <>
              {hero}
              {levelCard}
              {stats}
              {paymentsLink}
              {achievements}
              {shareBtn}
              {history}
            </>
          )}
        </View>
      </ScrollView>
      {levelUp != null && <LevelUp level={levelUp} onClose={() => setLevelUp(null)} />}
    </View>
  );
}

function Panel({ c, children }: { c: Palette; children: ReactNode }) {
  return <View style={{ backgroundColor: c.surface, borderWidth: 1, borderColor: c.line, borderRadius: 10, padding: space(5), gap: space(4) }}>{children}</View>;
}

function Stat({ c, value, label, color, icon }: { c: Palette; value: string; label: string; color: string; icon?: ReactNode }) {
  return (
    <View accessible accessibilityLabel={`${value} ${label}`} style={{ flexBasis: "46%", flexGrow: 1, backgroundColor: c.surface, borderWidth: 1, borderColor: c.line, borderRadius: 10, padding: space(4), gap: 4 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        {icon}
        <Text style={{ fontFamily: fonts.displayHeavy, fontSize: 32, lineHeight: 38, color, fontVariant: ["tabular-nums"] }}>{value}</Text>
      </View>
      <Text style={{ fontFamily: fonts.body, fontSize: 14, color: c.muted }}>{label}</Text>
    </View>
  );
}

/** Five levels on one thread: reached ones woven, the current one gold, the rest still open. */
function LevelTrack({ c, level }: { c: Palette; level: number }) {
  const { t } = useI18n();
  return (
    <View accessible accessibilityLabel={`${t("level")} ${level + 1} ${t("of")} ${LEVELS.length}: ${t(LEVELS[level].key)}`}>
      <View style={{ position: "absolute", left: "10%", right: "10%", top: 15, height: 2, backgroundColor: c.line }} />
      <View style={{ position: "absolute", left: "10%", width: `${(level / (LEVELS.length - 1)) * 80}%`, top: 15, height: 2, backgroundColor: c.amarillo.fill }} />
      <View style={{ flexDirection: "row" }}>
        {LEVELS.map((l, i) => {
          const reached = i <= level;
          const current = i === level;
          const size = current ? 22 : 16;
          return (
            <View key={l.key} style={{ flex: 1, alignItems: "center", gap: 8 }}>
              <View style={{ height: 32, justifyContent: "center" }}>
                <View
                  style={{
                    width: size,
                    height: size,
                    transform: [{ rotate: "45deg" }],
                    backgroundColor: current ? c.amarillo.fill : reached ? c.fucsia.fill : c.surface,
                    borderWidth: 2,
                    borderColor: reached ? (current ? c.amarillo.fill : c.fucsia.fill) : c.muted,
                  }}
                />
              </View>
              <Text style={{ fontFamily: current ? fonts.bodyBold : fonts.body, fontSize: 12, lineHeight: 15, color: current ? c.ink : c.muted, textAlign: "center" }}>{t(l.key)}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

/** "Nivel nuevo": the emblem weaves itself in. One tap closes it. */
function LevelUp({ level, onClose }: { level: number; onClose: () => void }) {
  const { t } = useI18n();
  const { c } = useScheme();
  const reduced = useReducedMotion();
  const p = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    if (!reduced) p.value = withDelay(150, withTiming(1, { duration: 900, easing: Easing.out(Easing.back(1.6)) }));
  }, []);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: 0.3 + p.value * 0.7 }, { rotate: `${(1 - p.value) * -90}deg` }], opacity: p.value }));
  const [fu, , am, ve] = c.threads;
  return (
    <Pressable
      accessibilityViewIsModal
      accessibilityRole="button"
      accessibilityLabel={`${t("newLevel")}: ${t(LEVELS[level].key)}. ${t("keepWeaving")}`}
      onPress={onClose}
      style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, backgroundColor: c.bg, alignItems: "center", justifyContent: "center", gap: space(5), padding: space(6), zIndex: 100 }}
    >
      <Confetti />
      <Text style={{ fontFamily: fonts.bodyBold, fontSize: 16, color: c.verde.text }}>{t("newLevel")}</Text>
      <Animated.View style={style}>
        <WovenEmblem motif={LEVELS[level].motif} size={160} colors={[am, fu, ve]} lockedColor={c.line} />
      </Animated.View>
      <Text style={{ fontFamily: fonts.displayHeavy, fontSize: 40, color: c.ink, textAlign: "center" }}>{t(LEVELS[level].key)}</Text>
      <Text style={{ fontFamily: fonts.body, fontSize: 16, color: c.muted, textAlign: "center", maxWidth: 360 }}>{t("newLevelHint")}</Text>
      <Text style={{ fontFamily: fonts.bodyBold, fontSize: 15, color: c.fucsia.text }}>{t("keepWeaving")}</Text>
    </Pressable>
  );
}
