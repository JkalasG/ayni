import { useCallback, useEffect, useRef, useState } from "react";
import { FlatList, KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, P } from "@/components/ui";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { payContribution } from "@/lib/pay";
import { colors, radius } from "@/lib/theme";

type Msg = { id: string; role: "user" | "assistant" | "system"; userId: string | null; authorName: string | null; content: string };
type ChatAction = { type: "pay"; contributionId: string; amount: string };

export default function Chat() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useI18n();
  const { me } = useAuth();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [actions, setActions] = useState<ChatAction[]>([]);
  const list = useRef<FlatList<Msg>>(null);

  const load = useCallback(async () => setMsgs(await api<Msg[]>(`/groups/${id}/chat`)), [id]);

  useEffect(() => {
    load().catch(() => {});
    const timer = setInterval(() => load().catch(() => {}), 6000);
    return () => clearInterval(timer);
  }, [load]);

  const send = async () => {
    const body = text.trim();
    if (!body || sending) return;
    setText("");
    setSending(true);
    setMsgs((m) => [...m, { id: "tmp", role: "user", userId: me?.id ?? null, authorName: me?.name ?? null, content: body }]);
    try {
      const res = await api<{ reply: string; actions: ChatAction[] }>(`/groups/${id}/chat`, { body: { text: body } });
      setActions(res.actions);
      await load();
    } finally {
      setSending(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={["bottom"]}>
      <Stack.Screen options={{ title: t("chat") }} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={90}>
        <FlatList
          ref={list}
          data={msgs}
          keyExtractor={(m, i) => m.id + i}
          contentContainerStyle={{ padding: 16, gap: 10, maxWidth: 560, width: "100%", alignSelf: "center" }}
          onContentSizeChange={() => list.current?.scrollToEnd({ animated: true })}
          ListEmptyComponent={<P muted>{t("chatHint")}</P>}
          renderItem={({ item }) => <Bubble m={item} mine={item.userId === me?.id} />}
          ListFooterComponent={
            <View style={{ gap: 8, marginTop: 8 }}>
              {sending && <P muted>…</P>}
              {actions.map((a) =>
                a.type === "pay" ? (
                  <Button
                    key={a.contributionId}
                    kind="paypal"
                    title={`${t("payNow")} · $${a.amount}`}
                    onPress={async () => {
                      await payContribution(a.contributionId, id);
                      setActions([]);
                      load();
                    }}
                  />
                ) : null
              )}
            </View>
          }
        />
        <View style={{ flexDirection: "row", gap: 8, padding: 12, borderTopWidth: 1, borderColor: colors.line, backgroundColor: colors.surface }}>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder={t("chatHint")}
            placeholderTextColor={colors.muted}
            onSubmitEditing={send}
            style={{ flex: 1, backgroundColor: colors.bg, borderRadius: radius.lg, paddingHorizontal: 14, paddingVertical: 10, color: colors.ink, fontSize: 15 }}
          />
          <Pressable
            onPress={send}
            accessibilityRole="button"
            accessibilityLabel={t("send")}
            style={{ backgroundColor: colors.primary, borderRadius: radius.lg, paddingHorizontal: 16, justifyContent: "center" }}
          >
            <Text style={{ color: "#fff", fontWeight: "800" }}>{t("send")}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Bubble({ m, mine }: { m: Msg; mine: boolean }) {
  if (m.role === "system") {
    return (
      <View style={{ alignSelf: "center", backgroundColor: colors.surfaceAlt, borderRadius: radius.sm, padding: 8, maxWidth: "92%" }}>
        <Text style={{ color: colors.muted, fontSize: 13, textAlign: "center" }}>{m.content}</Text>
      </View>
    );
  }
  const assistant = m.role === "assistant";
  return (
    <View style={{ alignSelf: mine ? "flex-end" : "flex-start", maxWidth: "85%", gap: 2 }}>
      {!mine && (
        <Text style={{ fontSize: 12, color: colors.muted, fontWeight: "700" }}>{assistant ? "🤖 Ayni" : m.authorName}</Text>
      )}
      <View
        style={{
          backgroundColor: mine ? colors.primary : assistant ? colors.surface : colors.surfaceAlt,
          borderRadius: radius.md,
          padding: 12,
          borderWidth: assistant ? 1 : 0,
          borderColor: colors.line,
        }}
      >
        <Text style={{ color: mine ? "#fff" : colors.ink, fontSize: 15, lineHeight: 21 }}>{m.content}</Text>
      </View>
    </View>
  );
}
