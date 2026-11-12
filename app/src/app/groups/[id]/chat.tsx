/**
 * Group chat. One timeline with three things in it:
 *  - what members write to each other
 *  - cards for what happened with the money (PayPal confirmed a payment, the pot was sent…)
 *  - my own questions to Ayni and its answers, which only I can see
 * The switch above the text box says who will read what I am about to send.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useScheme } from "@/lib/scheme";
import { FlatList, KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, Chips, Notice, P, Toggle } from "@/components/ui";
import { Icon, type IconName } from "@/components/icons";
import { useI18n, type Key } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { api, ApiError, money } from "@/lib/api";
import { payContribution } from "@/lib/pay";
import { preloadPayPal } from "@/lib/paypal-sdk";
import { PayPalWordmark } from "@/components/paypal";
import { colors, radius, fonts, space } from "@/lib/theme";
import { Guide } from "@/components/guide";
import { useLayout } from "@/lib/layout";

type ChatEvent =
  | { type: "paid"; name: string; round: number }
  | { type: "pot"; name: string; round: number; amountCents: number; heldCents: number }
  | { type: "ready"; round: number }
  | { type: "joined"; name: string; newcomer: boolean }
  | { type: "dispute"; round: number }
  | { type: "finished" }
  | { type: "cancelled" };
type Msg = {
  id: string;
  role: "user" | "assistant" | "system";
  kind: "text" | "event";
  event: ChatEvent | null;
  userId: string | null;
  authorName: string | null;
  content: string;
  hidden: boolean;
  private: boolean;
  canHide: boolean;
  createdAt: string;
};
type ChatAction = { type: "pay"; contributionId: string; amount: string };
type To = "group" | "ayni";

const POLL_MS = 4000;
const QUESTIONS: Key[] = ["chQ1", "chQ2", "chQ3"];

export default function Chat() {
  useScheme(); // re-render when the color mode changes
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, lang } = useI18n();
  const { wide } = useLayout();
  const { me } = useAuth();
  const [msgs, setMsgs] = useState<Msg[] | null>(null);
  const [text, setText] = useState("");
  const [to, setTo] = useState<To>("group");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actions, setActions] = useState<ChatAction[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const list = useRef<FlatList<Msg>>(null);
  // Translator: other people's messages are shown in the language of my app. One request for all the new ones.
  const [translate, setTranslate] = useState(true);
  const [canTranslate, setCanTranslate] = useState(true);
  const [translated, setTranslated] = useState<Record<string, string>>({});
  const [original, setOriginal] = useState<Record<string, boolean>>({});
  const asked = useRef(new Set<string>());
  useEffect(() => {
    if (!translate || !canTranslate || !msgs) return;
    const ids = msgs.filter((m) => m.role === "user" && m.kind === "text" && !m.hidden && !m.private && m.userId !== me?.id && !asked.current.has(`${m.id}:${lang}`)).map((m) => m.id);
    if (!ids.length) return;
    ids.forEach((i) => asked.current.add(`${i}:${lang}`));
    api<{ available: boolean; translations: Record<string, string> }>(`/groups/${id}/chat/translate`, { body: { ids: ids.slice(-60), lang } })
      .then((r) => {
        setCanTranslate(r.available);
        setTranslated((prev) => ({ ...prev, ...Object.fromEntries(Object.entries(r.translations).map(([k, v]) => [`${k}:${lang}`, v])) }));
      })
      .catch(() => ids.forEach((i) => asked.current.delete(`${i}:${lang}`)));
  }, [msgs, lang, translate, canTranslate, id, me?.id]);
  const lastAt = useRef<string | null>(null);

  /** Full load the first time (and every so often, to pick up hidden messages); otherwise only what is new. */
  const load = useCallback(
    async (full = false) => {
      const after = !full && lastAt.current ? `?after=${encodeURIComponent(lastAt.current)}` : "";
      const rows = await api<Msg[]>(`/groups/${id}/chat${after}`);
      if (rows.length) lastAt.current = rows[rows.length - 1].createdAt;
      if (!after) setMsgs(rows);
      else if (rows.length) setMsgs((prev) => [...(prev ?? []).filter((m) => !rows.some((r) => r.id === m.id)), ...rows]);
      if (rows.some((m) => m.userId !== me?.id)) api(`/groups/${id}/chat/read`, { body: {} }).catch(() => {});
    },
    [id, me?.id]
  );

  useEffect(() => {
    preloadPayPal();
  }, []);

  useEffect(() => {
    let tick = 0;
    load(true).catch(() => setMsgs((m) => m ?? []));
    const timer = setInterval(() => load(++tick % 8 === 0).catch(() => {}), POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  const send = async (override?: string) => {
    const body = (override ?? text).trim();
    if (!body || sending) return;
    setError(null);
    setSending(true);
    try {
      const res = await api<{ reply: string | null; actions: ChatAction[] }>(`/groups/${id}/chat`, { body: { text: body, toAssistant: to === "ayni" } });
      if (!override) setText("");
      setActions(res.actions);
      await load();
    } catch (e) {
      setError(e instanceof ApiError && e.code === "too_many_messages" ? t("chTooFast") : t("chSendFailed"));
    } finally {
      setSending(false);
    }
  };

  const hide = async (messageId: string) => {
    setSelected(null);
    try {
      await api(`/groups/${id}/chat/${messageId}/hide`, { body: {} });
      await load(true);
    } catch {
      setError(t("chSendFailed"));
    }
  };

  const toAyni = to === "ayni";
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={["bottom"]}>
      <Stack.Screen options={{ title: t("chat") }} />
      {/* computer: the conversation in a framed column aligned with the group's menu, and beside it what this chat is for */}
      <View style={wide ? { flex: 1, flexDirection: "row", gap: space(8), width: "100%", maxWidth: 1240 + space(20), alignSelf: "center", paddingHorizontal: space(10), paddingTop: space(5), paddingBottom: space(5) } : { flex: 1 }}>
      <KeyboardAvoidingView style={[{ flex: 1, minWidth: 0 }, wide && { borderWidth: 2, borderColor: colors.line, backgroundColor: colors.bg }]} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={90}>
        <FlatList
          ref={list}
          data={msgs ?? []}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: wide ? 20 : 16, gap: 10, maxWidth: wide ? undefined : 560, width: "100%", alignSelf: "center" }}
          onContentSizeChange={() => list.current?.scrollToEnd({ animated: true })}
          ListEmptyComponent={msgs ? <P muted>{t("chEmpty")}</P> : undefined}
          renderItem={({ item }) => (
            <Bubble m={item} translation={translate ? translated[`${item.id}:${lang}`] : undefined} showOriginal={!!original[item.id]} onFlip={() => setOriginal((o) => ({ ...o, [item.id]: !o[item.id] }))} mine={item.userId === me?.id} selected={selected === item.id} onSelect={() => setSelected(selected === item.id ? null : item.id)} onHide={() => hide(item.id)} />
          )}
          ListFooterComponent={
            <View style={{ gap: 8, marginTop: 8 }}>
              {sending && toAyni && <P muted>{t("chThinking")}</P>}
              {actions.map((a) =>
                a.type === "pay" ? (
                  <Button
                    key={a.contributionId}
                    kind="paypal"
                    title={`${t("payWith")} · $${a.amount}`}
                    accessibilityLabel={`${t("payNow")} · $${a.amount}`}
                    right={<PayPalWordmark size={20} />}
                    onPress={async () => {
                      const r = await payContribution(a.contributionId, id);
                      if (r === "paid") setActions([]);
                      load().catch(() => {});
                    }}
                  />
                ) : null
              )}
            </View>
          }
        />
        <View style={{ borderTopWidth: 1, borderColor: colors.line, backgroundColor: colors.surface }}>
          <View style={{ padding: wide ? 16 : 12, gap: 10, maxWidth: wide ? undefined : 560, width: "100%", alignSelf: "center" }}>
            {error && <Notice tone="error">{error}</Notice>}
            {canTranslate && <Toggle label={t("chTranslate")} value={translate} onChange={setTranslate} />}
            <Chips
              value={to}
              onChange={(v) => {
                setTo(v);
                setError(null);
              }}
              options={[
                { value: "group", label: t("chToGroup") },
                { value: "ayni", label: t("chToAyni") },
              ]}
            />
            <Text style={{ fontFamily: fonts.body, fontSize: 13.5, lineHeight: 19, color: colors.muted }}>{toAyni ? t("chPrivateNote") : t("chGroupNote")}</Text>
            {toAyni && !text && (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {QUESTIONS.map((q) => (
                  <Pressable key={q} accessibilityRole="button" disabled={sending} onPress={() => send(t(q))} style={{ minHeight: 40, justifyContent: "center", paddingHorizontal: 12, borderWidth: 1, borderColor: colors.line, borderRadius: radius.pill, backgroundColor: colors.bg }}>
                    <Text style={{ fontFamily: fonts.body, fontSize: 14.5, color: colors.ink }}>{t(q)}</Text>
                  </Pressable>
                ))}
              </View>
            )}
            <View style={{ flexDirection: "row", gap: 8 }}>
              <TextInput
                value={text}
                onChangeText={setText}
                placeholder={toAyni ? t("chPhAyni") : t("chPhGroup")}
                placeholderTextColor={colors.muted}
                accessibilityLabel={toAyni ? t("chPhAyni") : t("chPhGroup")}
                maxLength={1000}
                onSubmitEditing={() => send()}
                style={{ flex: 1, minHeight: 44, backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.line, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 10, color: colors.ink, fontFamily: fonts.body, fontSize: 15.5 }}
              />
              <Pressable
                onPress={() => send()}
                disabled={sending || !text.trim()}
                accessibilityRole="button"
                accessibilityLabel={t("send")}
                accessibilityState={{ disabled: sending || !text.trim() }}
                style={{ backgroundColor: colors.primary, minHeight: 44, paddingHorizontal: 16, justifyContent: "center", opacity: sending || !text.trim() ? 0.5 : 1 }}
              >
                <Text style={{ color: colors.primaryInk, fontFamily: fonts.bodyBold, fontSize: 15 }}>{t("send")}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
      {wide ? (
        <View style={{ width: 360 }}>
          <Guide
            icon="chat"
            title={t("chGuide")}
            steps={[
              { title: t("chToGroup"), body: t("chG1") },
              { title: t("chToAyni"), body: t("chG2") },
              { title: t("chG3t"), body: t("chG3") },
              { title: t("chG4t"), body: t("chG4") },
            ]}
          />
        </View>
      ) : null}
      </View>
    </SafeAreaView>
  );
}

/** A card for something that happened, written in the reader's language from the event data. */
function EventCard({ m }: { m: Msg }) {
  const { t } = useI18n();
  const e = m.event;
  let icon: IconName = "avisos";
  let line = m.content; // older rows have no event data: show the stored text
  let detail: string | null = null;
  if (e?.type === "paid") {
    icon = "paypal";
    line = `${e.name} ${t("evPaid")} ${e.round}`;
  } else if (e?.type === "pot") {
    icon = "pozo";
    line = `${t("evPot")} ${e.round} ${t("evPotTo")} ${e.name}: ${money(e.amountCents)}`;
    detail = e.heldCents > 0 ? `${t("evHeld")}: ${money(e.heldCents)}` : null;
  } else if (e?.type === "ready") {
    icon = "aprobar";
    line = `${t("evReady")} ${e.round}`;
    detail = t("evReadyWait");
  } else if (e?.type === "joined") {
    icon = "grupos";
    line = `${e.name} ${t("evJoined")}`;
    detail = e.newcomer ? t("evNewcomer") : null;
  } else if (e?.type === "dispute") {
    icon = "garantia";
    line = `${t("evDispute")} ${e.round}`;
  } else if (e?.type === "finished") {
    icon = "racha";
    line = t("evFinished");
  } else if (e?.type === "cancelled") {
    icon = "rechazar";
    line = t("evCancelled");
  }
  return (
    <View accessible accessibilityLabel={`${line}${detail ? `. ${detail}` : ""}`} style={{ alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.surfaceAlt, borderRadius: radius.sm, paddingVertical: 8, paddingHorizontal: 12, maxWidth: "92%" }}>
      {e ? <Icon name={icon} size={16} color={colors.muted} /> : null}
      <View style={{ flexShrink: 1 }}>
        <Text style={{ color: colors.ink, fontFamily: fonts.body, fontSize: 13.5, lineHeight: 19, textAlign: e ? "left" : "center" }}>{line}</Text>
        {detail ? <Text style={{ color: colors.muted, fontFamily: fonts.body, fontSize: 12.5, lineHeight: 17 }}>{detail}</Text> : null}
      </View>
    </View>
  );
}

function Bubble({ m, mine, selected, onSelect, onHide, translation, showOriginal, onFlip }: { m: Msg; mine: boolean; selected: boolean; onSelect: () => void; onHide: () => void; translation?: string; showOriginal?: boolean; onFlip?: () => void }) {
  const { t } = useI18n();
  if (m.role === "system") return <EventCard m={m} />;
  const assistant = m.role === "assistant";
  const time = new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const label = [mine ? null : assistant ? "Ayni" : m.authorName, m.private ? t("chPrivate") : null, time].filter(Boolean).join("  ·  ");
  if (m.hidden) {
    return (
      <View style={{ alignSelf: mine ? "flex-end" : "flex-start", maxWidth: "78%", gap: 2 }}>
        <Text style={{ fontSize: 12.5, color: colors.muted, fontFamily: fonts.bodyBold }}>{label}</Text>
        <View style={{ borderRadius: radius.md, padding: 12, borderWidth: 1, borderColor: colors.line, borderStyle: "dashed" }}>
          <Text style={{ color: colors.muted, fontFamily: fonts.body, fontStyle: "italic", fontSize: 14.5 }}>{t("chHidden")}</Text>
        </View>
      </View>
    );
  }
  return (
    <View style={{ alignSelf: mine ? "flex-end" : "flex-start", maxWidth: "78%", gap: 2 }}>
      <Text style={{ fontSize: 12.5, color: colors.muted, fontFamily: fonts.bodyBold, textAlign: mine ? "right" : "left" }}>{label}</Text>
      <Pressable
        disabled={!m.canHide}
        onPress={onSelect}
        accessibilityRole={m.canHide ? "button" : undefined}
        accessibilityHint={m.canHide ? t("chHideHint") : undefined}
        style={{
          backgroundColor: mine ? colors.primary : assistant ? colors.surface : colors.surfaceAlt,
          borderRadius: radius.md,
          padding: 12,
          // a private exchange looks different from a message the whole group reads
          borderWidth: m.private ? 1 : 0,
          borderStyle: m.private ? "dashed" : "solid",
          borderColor: mine ? colors.primaryInk : colors.line,
        }}
      >
        <Text style={{ color: mine ? colors.primaryInk : colors.ink, fontFamily: fonts.body, fontSize: 15.5, lineHeight: 22 }}>{translation && !showOriginal ? translation : m.content}</Text>
      </Pressable>
      {translation ? (
        <Pressable onPress={onFlip} accessibilityRole="button" style={{ alignSelf: mine ? "flex-end" : "flex-start", minHeight: 28, justifyContent: "center" }}>
          <Text style={{ fontFamily: fonts.body, fontSize: 12.5, color: colors.muted }}>
            {showOriginal ? t("chTranslation") : `${t("chTranslated")} · ${t("chOriginal")}`}
          </Text>
        </Pressable>
      ) : null}
      {selected && m.canHide && (
        <Pressable onPress={onHide} accessibilityRole="button" style={{ alignSelf: mine ? "flex-end" : "flex-start", minHeight: 40, justifyContent: "center" }}>
          <Text style={{ fontFamily: fonts.bodyBold, fontSize: 14, color: colors.danger }}>{t("chHide")}</Text>
        </Pressable>
      )}
    </View>
  );
}
