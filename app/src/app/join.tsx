import { useEffect, useState } from "react";
import { useScheme } from "@/lib/scheme";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { Button, Field, FormHeader, Notice, Screen } from "@/components/ui";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { errorText } from "@/lib/errors";

/** Also reachable as a link: ayni://join?code=ABC123 or https://<web>/join?code=ABC123 */
export default function Join() {
  useScheme(); // re-render when the color mode changes
  const { t } = useI18n();
  const { me, loading } = useAuth();
  const params = useLocalSearchParams<{ code?: string }>();
  const [code, setCode] = useState(params.code ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // wait for the session: on web an invite link opens here before /me has answered
  useEffect(() => {
    if (!loading && !me) router.replace("/");
  }, [me, loading]);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const g = await api<{ id: string }>("/groups/join", { body: { code: code.trim() } });
      router.replace(`/groups/${g.id}`);
    } catch (e) {
      setError(errorText(e, t));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: t("join") }} />
      <FormHeader icon="pagar" hint={t("joinHint")} />
      <Field
        label={t("code")}
        value={code}
        onChangeText={(v) => {
          setCode(v.toUpperCase().replace(/\s/g, ""));
          setError(null);
        }}
        autoCorrect={false}
        returnKeyType="go"
        onSubmitEditing={() => code.length >= 4 && !busy && submit()}
        autoCapitalize="characters"
        placeholder="ABC123"
        maxLength={6}
      />
      {error && <Notice tone="error">{error}</Notice>}
      <Button title={t("joinBtn")} onPress={submit} loading={busy} disabled={code.length < 4} />
    </Screen>
  );
}
