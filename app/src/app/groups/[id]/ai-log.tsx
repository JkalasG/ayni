import { useCallback, useState } from "react";
import { useScheme } from "@/lib/scheme";
import { Pressable, View } from "react-native";
import { Stack, useFocusEffect, useLocalSearchParams } from "expo-router";
import { Badge, Card, Chips, H2, Loading, Notice, P, Screen } from "@/components/ui";
import { Guide, TwoCol } from "@/components/guide";
import { useLayout } from "@/lib/layout";
import { useI18n, type Key } from "@/lib/i18n";
import { api } from "@/lib/api";
import { colors } from "@/lib/theme";
import { Empty } from "@/components/empty";

type Entry = { id: string; kind: string; source: string; subject: string; consulted: unknown; output: string; createdAt: string };

const sourceColor = (s: string) => ({ claude: colors.magenta, fallback: colors.muted, rules: colors.sky } as Record<string, string>)[s] ?? colors.muted;

/** What a tool call / data source looked like, in one short line. */
function consultedSummary(consulted: unknown): string[] {
  if (Array.isArray(consulted)) {
    return consulted.slice(0, 8).map((c: any) => {
      if (c?.tool) return `${c.tool}${c.input && Object.keys(c.input).length ? ` ${JSON.stringify(c.input)}` : ""}`;
      if (c?.name) return `${c.name}${c.riskScore != null ? ` · riesgo ${c.riskScore}` : ""}${c.newcomer ? " · nuevo" : ""}`;
      if (c?.memberName) return `${c.memberName} · $${c.amount} · ${c.reason}`;
      return `${JSON.stringify(c).slice(0, 120)}`;
    });
  }
  if (consulted && typeof consulted === "object") {
    const o = consulted as any;
    const lines: string[] = [];
    if (o.profile) lines.push(`Perfil: ${o.profile.completed} completados, ${o.profile.onTimePct ?? "–"}% a tiempo, ${o.profile.late} atrasos`);
    if (o.rules) lines.push(`Reglas: ≥${o.rules.minCompleted} completados, ≥${o.rules.minOnTimePct}% a tiempo, atrasos ≤${o.rules.maxLate ?? "∞"}`);
    if (o.failures?.length) lines.push(`No cumple: ${o.failures.join(", ")}`);
    return lines;
  }
  return [];
}

export default function AiLog() {
  useScheme(); // re-render when the color mode changes
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, lang } = useI18n();
  const [items, setItems] = useState<Entry[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [kind, setKind] = useState("all");
  const { wide } = useLayout();

  useFocusEffect(
    useCallback(() => {
      api<Entry[]>(`/groups/${id}/ai-log`).then(setItems).catch(() => setItems([]));
    }, [id])
  );

  if (!items) return <><Stack.Screen options={{ title: t("aiLog") }} /><Loading /></>;
  return (
    <Screen width={wide ? 1240 : 640}>
      <Stack.Screen options={{ title: t("aiLog") }} />
      <P muted>{t("aiLogHint")}</P>
      <TwoCol
        side={
          <Guide
            title={t("alGuide")}
            steps={[
              { title: t("alG1"), body: t("alG1b") },
              { title: t("alG2"), body: t("alG2b") },
              { title: t("alG3"), body: t("alG3b") },
              { title: t("alG4"), body: t("alG4b") },
            ]}
            note={t("alNote")}
          />
        }
      >
      {items.length === 0 ? (
        <Empty icon="rayo" title={t("emAi")} body={t("emAiBody")} />
      ) : (
        <Chips value={kind} onChange={setKind} options={[{ value: "all", label: `${t("lgAll")} (${items.length})` }, ...[...new Set(items.map((e) => e.kind))].map((k) => ({ value: k, label: t(`kind_${k}` as Key) }))]} />
      )}
      {items.filter((e) => kind === "all" || e.kind === kind).map((e) => {
        const lines = consultedSummary(e.consulted);
        return (
          <Pressable key={e.id} onPress={() => setOpen(open === e.id ? null : e.id)} accessibilityRole="button">
            <Card>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                <Badge text={t(`kind_${e.kind}` as Key)} color={colors.ink} />
                <Badge text={t(`src_${e.source}` as Key)} color={sourceColor(e.source)} />
              </View>
              <H2>{e.subject}</H2>
              <P>{open === e.id ? e.output : e.output.split("\n")[0].slice(0, 160)}</P>
              {open === e.id && lines.length > 0 && (
                <View style={{ gap: 4, backgroundColor: colors.surfaceAlt, padding: 10, borderRadius: 10 }}>
                  <P muted bold>{t("consulted")}</P>
                  {lines.map((l, i) => (
                    <P key={i} muted style={{ fontSize: 13 }}>
                      {l}
                    </P>
                  ))}
                </View>
              )}
              <P muted style={{ fontSize: 13.5 }}>
                {new Date(e.createdAt).toLocaleString(lang === "en" ? "en-US" : "es-BO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
              </P>
            </Card>
          </Pressable>
        );
      })}
      </TwoCol>
    </Screen>
  );
}
