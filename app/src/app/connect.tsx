import { useState } from "react";
import { Platform, Text, View } from "react-native";
import { Stack } from "expo-router";
import { Button, Card, Notice, P, Screen } from "@/components/ui";
import { useI18n } from "@/lib/i18n";
import { useScheme } from "@/lib/scheme";
import { api, API_URL } from "@/lib/api";
import { fonts } from "@/lib/theme";

/** Create (or revoke) the read-only key a member gives to their own AI assistant through MCP. */
export default function ConnectAssistant() {
  const { c } = useScheme();
  const { t } = useI18n();
  const [key, setKey] = useState<string | null>(null);
  const [busy, setBusy] = useState<"create" | "revoke" | null>(null);
  const [banner, setBanner] = useState<{ text: string; tone: "ok" | "error" } | null>(null);

  const create = async () => {
    setBusy("create");
    setBanner(null);
    try {
      setKey((await api<{ token: string }>("/me/mcp-token", { body: {} })).token);
    } catch {
      setBanner({ text: t("loadFailed"), tone: "error" });
    } finally {
      setBusy(null);
    }
  };
  const revoke = async () => {
    setBusy("revoke");
    setBanner(null);
    try {
      await api("/me/mcp-token", { method: "DELETE" });
      setKey(null);
      setBanner({ text: t("aiKeyRevoked"), tone: "ok" });
    } catch {
      setBanner({ text: t("loadFailed"), tone: "error" });
    } finally {
      setBusy(null);
    }
  };
  const copy = async () => {
    if (!key) return;
    try {
      if (Platform.OS === "web") await navigator.clipboard.writeText(key);
      else (await import("react-native")).Share.share({ message: key });
      setBanner({ text: t("aiKeyCopied"), tone: "ok" });
    } catch {
      /* the key is on screen and selectable */
    }
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: t("aiConnect") }} />
      <P muted>{t("aiConnectHint")}</P>
      {banner && <Notice tone={banner.tone}>{banner.text}</Notice>}
      {key ? (
        <Card>
          <Notice>{t("aiKeyWarn")}</Notice>
          <Text selectable style={{ fontFamily: fonts.body, fontSize: 12.5, lineHeight: 18, color: c.ink }}>
            {key}
          </Text>
          <Button compact title={t("aiKeyCopy")} onPress={copy} />
          <P muted>{t("aiKeySteps")}</P>
          <View style={{ gap: 2 }}>
            <Text selectable style={{ fontFamily: fonts.body, fontSize: 13.5, color: c.muted }}>AYNI_API_URL = {API_URL}</Text>
            <Text selectable style={{ fontFamily: fonts.body, fontSize: 13.5, color: c.muted }}>AYNI_MCP_TOKEN = {"<"}{t("aiKeyCopy").toLowerCase()}{">"}</Text>
            <Text selectable style={{ fontFamily: fonts.body, fontSize: 13.5, color: c.muted }}>npm run mcp  (backend/)</Text>
          </View>
        </Card>
      ) : (
        <Button title={t("aiKeyCreate")} loading={busy === "create"} onPress={create} />
      )}
      <Button kind="ghost" title={t("aiKeyRevoke")} loading={busy === "revoke"} onPress={revoke} />
    </Screen>
  );
}
