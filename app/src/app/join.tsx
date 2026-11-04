import { useEffect, useState } from "react";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { Button, Field, P, Screen } from "@/components/ui";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { api, ApiError } from "@/lib/api";
import { colors } from "@/lib/theme";

/** Also reachable as a link: ayni://join?code=ABC123 or https://<web>/join?code=ABC123 */
export default function Join() {
  const { t } = useI18n();
  const { me } = useAuth();
  const params = useLocalSearchParams<{ code?: string }>();
  const [code, setCode] = useState(params.code ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!me) router.replace("/");
  }, [me]);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const g = await api<{ id: string }>("/groups/join", { body: { code } });
      router.replace(`/groups/${g.id}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.code : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: t("join") }} />
      <Field
        label={t("code")}
        value={code}
        onChangeText={(v) => setCode(v.toUpperCase())}
        autoCapitalize="characters"
        placeholder="ABC123"
        maxLength={6}
      />
      {error && <P style={{ color: colors.danger }}>{error}</P>}
      <Button title={t("joinBtn")} onPress={submit} loading={busy} disabled={code.length < 4} />
    </Screen>
  );
}
