/**
 * Connect my own AI assistant (Claude or another) to Ayni through MCP, with a read-only key.
 * The screen explains itself for someone who has never heard of MCP: what it is for, the three steps, the exact
 * configuration to paste, and a live test that shows what an assistant can read with the key and that it cannot write.
 */
import { useState } from "react";
import { Platform, Share, Text, View } from "react-native";
import { Stack } from "expo-router";
import { Button, Notice, P, Screen } from "@/components/ui";
import { Icon, type IconName } from "@/components/icons";
import { SteppedBox } from "@/components/stepped";
import { useI18n, type Key } from "@/lib/i18n";
import { useLayout } from "@/lib/layout";
import { useScheme } from "@/lib/scheme";
import { api, API_URL, money } from "@/lib/api";
import { fonts, space } from "@/lib/theme";

type Probe = { groups: { name: string; status: string; contributionCents: number }[]; writeBlocked: boolean };

const TOOLS: { name: string; label: Key }[] = [
  { name: "list_my_groups", label: "mcpT1" },
  { name: "group_status", label: "mcpT2" },
  { name: "my_payments", label: "mcpT3" },
  { name: "group_payments", label: "mcpT4" },
  { name: "my_claims", label: "mcpT5" },
  { name: "my_trust_profile", label: "mcpT6" },
];

export default function ConnectAssistant() {
  const { c } = useScheme();
  const { t } = useI18n();
  const { wide } = useLayout();
  const [key, setKey] = useState<string | null>(null);
  const [busy, setBusy] = useState<"create" | "revoke" | "probe" | null>(null);
  const [banner, setBanner] = useState<{ text: string; tone: "ok" | "error" } | null>(null);
  const [probe, setProbe] = useState<Probe | null>(null);

  const config = JSON.stringify(
    { mcpServers: { ayni: { command: "npm", args: ["--silent", "--prefix", t("mcpPath"), "run", "mcp"], env: { AYNI_API_URL: API_URL, AYNI_MCP_TOKEN: key ?? t("mcpYourKey") } } } },
    null,
    2
  );

  const create = async () => {
    setBusy("create");
    setBanner(null);
    setProbe(null);
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
      setProbe(null);
      setBanner({ text: t("aiKeyRevoked"), tone: "ok" });
    } catch {
      setBanner({ text: t("loadFailed"), tone: "error" });
    } finally {
      setBusy(null);
    }
  };
  const copy = async (text: string, done: Key) => {
    try {
      if (Platform.OS === "web") await navigator.clipboard.writeText(text);
      else await Share.share({ message: text });
      setBanner({ text: t(done), tone: "ok" });
    } catch {
      /* the text is on screen and selectable */
    }
  };

  /** What an assistant holding this key gets: it reads my groups, and a write is refused by the server. */
  const test = async () => {
    if (!key) return;
    setBusy("probe");
    setBanner(null);
    try {
      const headers = { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
      const read = await fetch(`${API_URL}/groups`, { headers });
      if (!read.ok) throw new Error("read");
      const groups = (await read.json()) as Probe["groups"];
      // the same key, trying to create a pasanaku: the server must say no
      const write = await fetch(`${API_URL}/groups/draft`, { method: "POST", headers, body: JSON.stringify({ text: "prueba" }) });
      setProbe({ groups, writeBlocked: write.status === 403 });
    } catch {
      setBanner({ text: t("loadFailed"), tone: "error" });
    } finally {
      setBusy(null);
    }
  };

  const step = (n: number, icon: IconName, title: Key, body: Key) => (
    <View style={{ flex: wide ? 1 : undefined, flexDirection: "row", gap: 12, padding: space(4), backgroundColor: c.surfaceAlt, borderLeftWidth: 4, borderColor: c.turquesa.fill }}>
      <Text style={{ fontFamily: fonts.display, fontSize: 20, color: c.turquesa.text }}>{n}</Text>
      <View style={{ flex: 1, gap: 4 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Icon name={icon} size={16} color={c.ink} />
          <Text style={{ flex: 1, fontFamily: fonts.bodyBold, fontSize: 15.5, color: c.ink }}>{t(title)}</Text>
        </View>
        <Text style={{ fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: c.muted }}>{t(body)}</Text>
      </View>
    </View>
  );
  const code = (text: string) => (
    <View style={{ backgroundColor: c.surfaceAlt, padding: space(3) }}>
      <Text selectable style={{ fontFamily: Platform.OS === "web" ? "ui-monospace, Menlo, Consolas, monospace" : fonts.body, fontSize: 12.5, lineHeight: 18, color: c.ink }}>
        {text}
      </Text>
    </View>
  );
  const heading = (text: string) => (
    <Text accessibilityRole="header" style={{ fontFamily: fonts.display, fontSize: 17, color: c.ink }}>
      {text}
    </Text>
  );

  return (
    <Screen width={wide ? 920 : 640}>
      <Stack.Screen options={{ title: t("aiConnect") }} />

      <SteppedBox fill={c.surface} stroke={c.turquesa.fill} step={5} style={{ padding: space(5), gap: space(3) }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <View style={{ width: 34, height: 34, alignItems: "center", justifyContent: "center", backgroundColor: c.turquesa.fill }}>
            <Icon name="rayo" size={18} color={c.onAction} />
          </View>
          <Text accessibilityRole="header" style={{ flex: 1, fontFamily: fonts.display, fontSize: 19, lineHeight: 25, color: c.ink }}>
            {t("mcpWhat")}
          </Text>
        </View>
        <P>{t("mcpWhatBody")}</P>
        <View style={{ gap: 6 }}>
          {(["mcpEx1", "mcpEx2", "mcpEx3"] as Key[]).map((k) => (
            <View key={k} style={{ alignSelf: "flex-start", paddingHorizontal: 12, paddingVertical: 7, backgroundColor: c.turquesa.fill + "1F" }}>
              <Text style={{ fontFamily: fonts.body, fontSize: 14.5, color: c.ink }}>“{t(k)}”</Text>
            </View>
          ))}
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Icon name="garantia" size={16} color={c.verde.text} />
          <Text style={{ flex: 1, fontFamily: fonts.bodyBold, fontSize: 14, lineHeight: 20, color: c.verde.text }}>{t("mcpSafe")}</Text>
        </View>
      </SteppedBox>

      {heading(t("mcpHow"))}
      <View style={{ flexDirection: wide ? "row" : "column", gap: space(3) }}>
        {step(1, "aprobar", "mcpS1", "mcpS1b")}
        {step(2, "compartir", "mcpS2", "mcpS2b")}
        {step(3, "chat", "mcpS3", "mcpS3b")}
      </View>

      {banner && <Notice tone={banner.tone}>{banner.text}</Notice>}

      {key ? (
        <SteppedBox fill={c.surface} stroke={c.line} step={5} style={{ padding: space(5), gap: space(4) }}>
          {heading(t("mcpKeyTitle"))}
          <Notice>{t("aiKeyWarn")}</Notice>
          {code(key)}
          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
            <Button compact title={t("aiKeyCopy")} onPress={() => copy(key, "aiKeyCopied")} />
            <Button compact kind="secondary" title={t("mcpTest")} loading={busy === "probe"} onPress={test} />
          </View>

          {probe ? (
            <View accessibilityLiveRegion="polite" style={{ gap: space(2), padding: space(4), borderLeftWidth: 4, borderColor: c.verde.fill, backgroundColor: c.verde.fill + "14" }}>
              <Text style={{ fontFamily: fonts.bodyBold, fontSize: 15, color: c.ink }}>
                {t("mcpProbeRead")} ({probe.groups.length})
              </Text>
              {probe.groups.slice(0, 6).map((g, i) => (
                <Text key={i} style={{ fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: c.ink }}>
                  · {g.name} · {t(`status_${g.status}` as Key)} · {money(g.contributionCents)}
                </Text>
              ))}
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 }}>
                <Icon name={probe.writeBlocked ? "garantia" : "rechazar"} size={16} color={probe.writeBlocked ? c.verde.text : c.rojo.text} />
                <Text style={{ flex: 1, fontFamily: fonts.bodyBold, fontSize: 14, lineHeight: 20, color: probe.writeBlocked ? c.verde.text : c.rojo.text }}>{probe.writeBlocked ? t("mcpProbeBlocked") : t("mcpProbeOpen")}</Text>
              </View>
            </View>
          ) : null}

          {heading(t("mcpConfigTitle"))}
          <P muted>{t("mcpConfigHint")}</P>
          {code(config)}
          <View style={{ alignSelf: "flex-start" }}>
            <Button compact kind="secondary" title={t("mcpConfigCopy")} onPress={() => copy(config, "mcpConfigCopied")} />
          </View>
        </SteppedBox>
      ) : (
        <Button title={t("aiKeyCreate")} loading={busy === "create"} onPress={create} />
      )}

      <SteppedBox fill={c.surface} stroke={c.line} step={5} style={{ padding: space(5), gap: space(3) }}>
        {heading(t("mcpToolsTitle"))}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space(3) }}>
          {TOOLS.map((x) => (
            <View key={x.name} style={{ flexGrow: 1, flexBasis: wide ? "30%" : "100%", gap: 2 }}>
              <Text style={{ fontFamily: fonts.bodyBold, fontSize: 14.5, color: c.ink }}>{t(x.label)}</Text>
              <Text style={{ fontFamily: fonts.body, fontSize: 12.5, color: c.muted }}>{x.name}</Text>
            </View>
          ))}
        </View>
      </SteppedBox>

      <Button kind="ghost" title={t("aiKeyRevoke")} loading={busy === "revoke"} onPress={revoke} />
    </Screen>
  );
}
