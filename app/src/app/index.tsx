import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Redirect } from "expo-router";
import { Button, Card, H1, Loading, P, Screen, Stripe } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { api } from "@/lib/api";
import { colors } from "@/lib/theme";

type DemoUser = { id: string; name: string; email: string };

export default function Welcome() {
  const { me, loading, loginWithPayPal, loginAsDemo } = useAuth();
  const { t, lang, setLang } = useI18n();
  const [demoUsers, setDemoUsers] = useState<DemoUser[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<DemoUser[]>("/auth/demo/users").then(setDemoUsers).catch(() => setDemoUsers([]));
  }, []);

  if (loading) return <Loading />;
  if (me) return <Redirect href="/groups" />;

  return (
    <Screen>
      <View style={{ height: 40 }} />
      <Stripe height={10} />
      <View style={{ gap: 8 }}>
        <Text style={{ fontSize: 56, fontWeight: "900", color: colors.primary, letterSpacing: -1 }}>Ayni</Text>
        <P style={{ fontSize: 20, fontWeight: "700" }}>{t("tagline")}</P>
        <P muted>{t("ayniMeaning")}</P>
      </View>

      <Button
        kind="paypal"
        title={t("loginPaypal")}
        loading={busy}
        onPress={async () => {
          setBusy(true);
          try {
            await loginWithPayPal();
          } finally {
            setBusy(false);
          }
        }}
      />

      {demoUsers.length > 0 && (
        <Card>
          <P muted>{t("demoLogin")}</P>
          {demoUsers.map((u) => (
            <Button key={u.id} kind="secondary" title={u.name} onPress={() => loginAsDemo(u.id)} />
          ))}
        </Card>
      )}

      <Pressable onPress={() => setLang(lang === "es" ? "en" : "es")} style={{ alignSelf: "center", padding: 12 }}>
        <Text style={{ color: colors.primary, fontWeight: "700" }}>{t("language")}</Text>
      </Pressable>
    </Screen>
  );
}
