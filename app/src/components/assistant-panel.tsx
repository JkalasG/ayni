/**
 * The assistant on the group's first screen. It is not a chat: it reads the group and its PayPal payments, says how the
 * round is going and lists the steps worth taking now, each one a button that runs the real operation (pay with PayPal,
 * send the pot, send a PayPal invoice, send a reminder it writes). The server decides what is possible and checks every
 * number (see backend ai/briefing.ts); nothing runs until the person taps it.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import { Button } from "@/components/ui";
import { Icon } from "@/components/icons";
import { SteppedBox } from "@/components/stepped";
import { api } from "@/lib/api";
import { errorText } from "@/lib/errors";
import { useGroup } from "@/lib/group";
import { useI18n, type Key } from "@/lib/i18n";
import { useLayout } from "@/lib/layout";
import { useScheme } from "@/lib/scheme";
import { fonts, space } from "@/lib/theme";

type Action =
  | { type: "pay"; contributionId: string }
  | { type: "autopay" }
  | { type: "approve"; actionId: string }
  | { type: "review" }
  | { type: "nudge"; contributionId: string }
  | { type: "invoice"; contributionId: string }
  | { type: "retry_payout"; payoutId: string }
  | { type: "open"; tab: string };
type Briefing = {
  source: "claude" | "fallback" | "rules";
  health: "ok" | "watch" | "risk";
  headline: string;
  items: { key: string; title: string; why: string; action: Action }[];
};

export function AssistantPanel({ onPay }: { onPay: () => void }) {
  const { g, reload } = useGroup();
  const { t } = useI18n();
  const { c } = useScheme();
  const { wide } = useLayout();
  const [b, setB] = useState<Briefing | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<{ text: string; tone: "ok" | "error" } | null>(null);

  // Ask again only when something the assistant reads has changed (the group itself refreshes every few seconds).
  const signature = JSON.stringify([
    g.status,
    g.autoPay,
    g.actions.map((a) => a.id),
    g.failedPayouts.map((p) => p.id),
    g.rounds.map((r) => [r.status, r.contributions.map((x) => x.status + x.lateFeeCents)]),
  ]);
  const seq = useRef(0);
  const load = useCallback(() => {
    const mine = ++seq.current;
    api<Briefing>(`/groups/${g.id}/assistant`)
      .then((r) => {
        if (mine !== seq.current) return;
        setB(r);
        setFailed(false);
      })
      .catch(() => mine === seq.current && setFailed(true));
  }, [g.id]);
  useEffect(() => {
    load();
  }, [load, signature]);

  const run = async (key: string, a: Action) => {
    setNote(null);
    if (a.type === "pay") return onPay();
    if (a.type === "open") return router.navigate(`/groups/${g.id}/${a.tab}` as any);
    if (a.type === "review") return;
    setBusy(key);
    try {
      if (a.type === "approve") await api(`/actions/${a.actionId}/approve`, { body: {} });
      else if (a.type === "autopay") await api(`/groups/${g.id}/autopay`, { body: { enabled: true } });
      else if (a.type === "retry_payout") await api(`/payouts/${a.payoutId}/retry`, { body: {} });
      else {
        const r = await api<{ done: "nudge" | "invoice"; text?: string }>(`/groups/${g.id}/assistant/run`, { body: { type: a.type, contributionId: a.contributionId } });
        setNote({ text: r.done === "nudge" ? `${t("asDone_nudge")} “${r.text ?? ""}”` : t("asDone_invoice"), tone: "ok" });
      }
      if (a.type !== "nudge" && a.type !== "invoice") setNote({ text: t("asDone"), tone: "ok" });
      await reload().catch(() => {});
      load();
    } catch (e) {
      setNote({ text: errorText(e, t), tone: "error" });
    } finally {
      setBusy(null);
    }
  };

  if (failed && !b) return null;
  const tone = !b ? c.turquesa : b.health === "risk" ? c.rojo : b.health === "watch" ? c.naranja : c.verde;
  const bar = (w: string | number, h: number) => <View style={{ width: w as any, height: h, backgroundColor: c.line, opacity: 0.6 }} />;

  return (
    <SteppedBox fill={c.surface} stroke={c.turquesa.fill} step={5} style={{ padding: wide ? space(5) : space(4), gap: space(3) }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <View style={{ width: 34, height: 34, alignItems: "center", justifyContent: "center", backgroundColor: c.turquesa.fill }}>
          <Icon name="rayo" size={18} color={c.onAction} />
        </View>
        <View style={{ flex: 1, minWidth: 160 }}>
          <Text accessibilityRole="header" style={{ fontFamily: fonts.display, fontSize: 17, color: c.ink }}>
            {t("asTitle")}
          </Text>
          <Text style={{ fontFamily: fonts.body, fontSize: 13.5, color: c.muted }}>{b && b.source === "fallback" ? t("asNoAi") : t("asSub")}</Text>
        </View>
        {b ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: tone.fill + "22" }}>
            <View style={{ width: 8, height: 8, transform: [{ rotate: "45deg" }], backgroundColor: tone.text }} />
            <Text style={{ fontFamily: fonts.bodyBold, fontSize: 13.5, color: tone.text }}>{t(`asHealth_${b.health}` as Key)}</Text>
          </View>
        ) : null}
      </View>

      {!b ? (
        <View accessibilityLabel={t("asThinking")} style={{ gap: 10, paddingVertical: 4 }}>
          <Text style={{ fontFamily: fonts.body, fontSize: 14.5, color: c.muted }}>{t("asThinking")}</Text>
          {bar("92%", 14)}
          {bar("70%", 14)}
          {bar("100%", 44)}
        </View>
      ) : (
        <>
          <Text style={{ fontFamily: fonts.body, fontSize: wide ? 17 : 16, lineHeight: wide ? 25 : 23, color: c.ink }}>{b.headline}</Text>
          {b.items.length === 0 ? (
            <Text style={{ fontFamily: fonts.body, fontSize: 14.5, color: c.muted }}>{t("asNoSteps")}</Text>
          ) : (
            <View style={{ flexDirection: wide ? "row" : "column", gap: space(3), alignItems: "stretch" }}>
              {b.items.map((it, i) => (
                <View key={it.key} style={{ flex: wide ? 1 : undefined, minWidth: 0, gap: 8, padding: space(3), backgroundColor: c.surfaceAlt, borderLeftWidth: 4, borderColor: i === 0 ? c.turquesa.fill : c.line }}>
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <Text style={{ fontFamily: fonts.display, fontSize: 15, color: c.turquesa.text }}>{i + 1}</Text>
                    <Text style={{ flex: 1, fontFamily: fonts.bodyBold, fontSize: 15, lineHeight: 21, color: c.ink }}>{it.title}</Text>
                  </View>
                  <Text style={{ flex: 1, fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: c.muted }}>
                    <Text style={{ fontFamily: fonts.bodyBold, color: c.muted }}>{t("asWhy")}: </Text>
                    {it.why}
                  </Text>
                  {it.action.type === "review" ? (
                    <Text style={{ fontFamily: fonts.bodyBold, fontSize: 13.5, color: c.fucsia.text }}>{t("asDo_review")}</Text>
                  ) : (
                    <View style={{ alignSelf: "flex-start" }}>
                      <Button compact kind={i === 0 ? "primary" : "secondary"} title={t(`asDo_${it.action.type}` as Key)} loading={busy === it.key} onPress={() => run(it.key, it.action)} />
                    </View>
                  )}
                </View>
              ))}
            </View>
          )}
          {note ? (
            <Text accessibilityLiveRegion="polite" style={{ fontFamily: fonts.bodyBold, fontSize: 14.5, lineHeight: 21, color: note.tone === "ok" ? c.verde.text : c.rojo.text }}>
              {note.text}
            </Text>
          ) : null}
          <View style={{ flexDirection: "row", alignItems: "center", gap: space(4), flexWrap: "wrap" }}>
            <Text style={{ flex: 1, minWidth: 200, fontFamily: fonts.body, fontSize: 13, color: c.muted }}>{t("asYouDecide")}</Text>
            <Pressable accessibilityRole="link" onPress={() => router.navigate(`/groups/${g.id}/ai-log` as any)} style={{ minHeight: 36, justifyContent: "center" }}>
              <Text style={{ fontFamily: fonts.bodyBold, fontSize: 13.5, color: c.turquesa.text }}>{t("asLog")}</Text>
            </Pressable>
            <Pressable accessibilityRole="link" onPress={() => router.navigate(`/groups/${g.id}/chat` as any)} style={{ minHeight: 36, justifyContent: "center" }}>
              <Text style={{ fontFamily: fonts.bodyBold, fontSize: 13.5, color: c.turquesa.text }}>{t("asAsk")}</Text>
            </Pressable>
          </View>
        </>
      )}
    </SteppedBox>
  );
}
