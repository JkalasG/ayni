import { useCallback, useEffect, useState } from "react";
import { Alert, Platform, RefreshControl, ScrollView, Share, Text, View } from "react-native";
import { Stack, router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { Avatar, Badge, Button, Card, H2, Loading, P, Stripe } from "@/components/ui";
import { useI18n, type Key } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { api, ApiError, money } from "@/lib/api";
import { payContribution } from "@/lib/pay";
import { colors } from "@/lib/theme";

type Contribution = { id: string; membershipId: string; status: "PENDING" | "PAID" | "COVERED"; amountCents: number; lateFeeCents: number };
type Round = {
  id: string;
  number: number;
  status: "UPCOMING" | "COLLECTING" | "READY" | "PAID_OUT";
  dueAt: string;
  recipientId: string;
  recipient: { user: { name: string } };
  contributions: Contribution[];
};
type Member = {
  id: string;
  userId: string;
  turn: number | null;
  retentionPct: number;
  retentionHeldCents: number;
  user: { id: string; name: string };
};
type Action = { id: string; type: string; summary: string; expiresAt: string; payload: any };
type Group = {
  id: string;
  name: string;
  status: "FORMING" | "ORDERING" | "ACTIVE" | "FINISHED";
  inviteCode: string;
  organizerId: string;
  contributionCents: number;
  frequency: string;
  orderMethod: "LOTTERY" | "AI" | "ORGANIZER";
  demoMode: boolean;
  memberships: Member[];
  rounds: Round[];
  actions: Action[];
  myMembershipId: string;
  isOrganizer: boolean;
  potCents: number;
};

const AVATAR_COLORS = [colors.primary, colors.corn, colors.leaf, colors.sky, "#8E5BA8", "#D27C5A"];

export default function GroupScreen() {
  const { id, status } = useLocalSearchParams<{ id: string; status?: string }>();
  const { t } = useI18n();
  const { me } = useAuth();
  const [g, setG] = useState<Group | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);

  const load = useCallback(async () => {
    setG(await api<Group>(`/groups/${id}`));
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load().catch(() => {});
      // live updates while the screen is open (great for the demo video)
      const timer = setInterval(() => load().catch(() => {}), 5000);
      return () => clearInterval(timer);
    }, [load])
  );

  // Web returns here from PayPal with ?status=paid|cancelled|error
  useEffect(() => {
    if (status === "paid") setBanner(t("paymentOk"));
    else if (status === "cancelled") setBanner(t("paymentCancel"));
    else if (status === "error") setBanner(t("paymentError"));
  }, [status, t]);

  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    try {
      await fn();
      await load();
    } catch (e) {
      const msg = e instanceof ApiError ? e.code : String(e);
      Platform.OS === "web" ? setBanner(msg) : Alert.alert("Ayni", msg);
    } finally {
      setBusy(null);
    }
  };

  if (!g || !me) return <Loading />;

  const current = g.rounds.find((r) => r.status === "COLLECTING" || r.status === "READY");
  const myContribution = current?.contributions.find((c) => c.membershipId === g.myMembershipId);
  const memberName = (membershipId: string) => g.memberships.find((m) => m.id === membershipId)?.user.name ?? "?";
  const settled = current ? current.contributions.filter((c) => c.status !== "PENDING").length : 0;

  return (
    <>
      <Stack.Screen options={{ title: g.name }} />
      <ScrollView
        style={{ backgroundColor: colors.bg }}
        contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 48, maxWidth: 560, width: "100%", alignSelf: "center" }}
        refreshControl={<RefreshControl refreshing={false} onRefresh={() => load().catch(() => {})} />}
      >
        {banner && (
          <Card style={{ backgroundColor: colors.leaf + "18", borderColor: colors.leaf }}>
            <P>{banner}</P>
          </Card>
        )}

        {/* Summary */}
        <Card>
          <Stripe />
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <View>
              <P muted>{t("pot")}</P>
              <Text style={{ fontSize: 34, fontWeight: "900", color: colors.ink }}>{money(g.potCents)}</Text>
              <P muted>
                {money(g.contributionCents)} {t("perRound")} · {t(g.frequency as Key)}
              </P>
            </View>
            <Badge text={t(`status_${g.status}` as Key)} color={g.status === "ACTIVE" ? colors.leaf : colors.corn} />
          </View>
        </Card>

        {/* Current round */}
        {current && (
          <Card>
            <H2>
              {t("round")} {current.number} {t("of")} {g.rounds.length}
            </H2>
            <P>
              🧺 {current.recipient.user.name} {t("receives")} · {t("due")}: {new Date(current.dueAt).toLocaleString()}
            </P>
            <View style={{ height: 10, backgroundColor: colors.surfaceAlt, borderRadius: 99, overflow: "hidden" }}>
              <View
                style={{
                  width: `${(settled / current.contributions.length) * 100}%`,
                  height: "100%",
                  backgroundColor: colors.leaf,
                }}
              />
            </View>
            {current.contributions.map((c) => (
              <View key={c.id} style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <P>{memberName(c.membershipId)}</P>
                <Badge
                  text={c.status === "PAID" ? t("paid") : c.status === "COVERED" ? t("covered") : t("pending")}
                  color={c.status === "PENDING" ? colors.corn : colors.leaf}
                />
              </View>
            ))}
            {myContribution?.status === "PENDING" && current.status === "COLLECTING" ? (
              <Button
                kind="paypal"
                title={`${t("payNow")} · ${money(myContribution.amountCents + myContribution.lateFeeCents)}`}
                loading={busy === "pay"}
                onPress={() =>
                  run("pay", async () => {
                    const r = await payContribution(myContribution.id, g.id);
                    if (r === "paid") setBanner(t("paymentOk"));
                    else if (r === "cancelled") setBanner(t("paymentCancel"));
                    else if (r === "error") setBanner(t("paymentError"));
                  })
                }
              />
            ) : myContribution ? (
              <P muted>{t("youPaid")}</P>
            ) : null}
          </Card>
        )}

        {/* Organizer decisions (human in the loop) */}
        {g.isOrganizer && g.actions.length > 0 && (
          <Card style={{ borderColor: colors.primary }}>
            <H2>📋 {t("pendingDecisions")}</H2>
            {g.actions.map((a) => (
              <View key={a.id} style={{ gap: 8 }}>
                <P>{a.summary}</P>
                {a.type === "APPROVE_ORDER" &&
                  (a.payload.order as string[]).map((mid, i) => (
                    <P key={mid} muted>
                      {i + 1}. {memberName(mid)}
                      {a.payload.reasons?.[mid] ? ` — ${a.payload.reasons[mid]}` : ""}
                    </P>
                  ))}
                <P muted style={{ fontSize: 12 }}>
                  {t("autoIn")}: {new Date(a.expiresAt).toLocaleString()}
                </P>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Button title={t("approve")} loading={busy === a.id} onPress={() => run(a.id, () => api(`/actions/${a.id}/approve`, { body: {} }))} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Button kind="danger" title={t("reject")} onPress={() => run(a.id + "r", () => api(`/actions/${a.id}/reject`, { body: {} }))} />
                  </View>
                </View>
              </View>
            ))}
          </Card>
        )}

        {/* Members */}
        <Card>
          <H2>{t("members")}</H2>
          {[...g.memberships]
            .sort((a, b) => (a.turn ?? 99) - (b.turn ?? 99))
            .map((m, i) => (
              <View key={m.id} style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <Avatar name={m.user.name} color={AVATAR_COLORS[i % AVATAR_COLORS.length]} />
                <View style={{ flex: 1 }}>
                  <P style={{ fontWeight: "700" }}>
                    {m.user.name}
                    {m.userId === me.id ? ` (${t("you")})` : ""}
                    {m.userId === g.organizerId ? ` · ${t("organizer")}` : ""}
                  </P>
                  {m.turn != null && (
                    <P muted>
                      {t("turn")} #{m.turn} · {t("guarantee")} {m.retentionPct}%
                      {m.retentionHeldCents > 0 ? ` · ${money(m.retentionHeldCents)} ${t("held")}` : ""}
                    </P>
                  )}
                </View>
              </View>
            ))}
        </Card>

        {/* Invite */}
        {g.status === "FORMING" && (
          <Card>
            <P muted>{t("inviteShare")}</P>
            <Text style={{ fontSize: 32, fontWeight: "900", letterSpacing: 6, color: colors.primary, textAlign: "center" }}>
              {g.inviteCode}
            </Text>
            {Platform.OS !== "web" && (
              <Button kind="secondary" title="Compartir / Share" onPress={() => Share.share({ message: `Ayni · ${g.name}: ${g.inviteCode}` })} />
            )}
          </Card>
        )}

        {/* Organizer controls */}
        {g.isOrganizer && (g.status === "FORMING" || g.status === "ORDERING") && (
          <Button
            kind="secondary"
            title={`${t("setOrder")} (${t(g.orderMethod as Key)})`}
            loading={busy === "order"}
            onPress={() => run("order", () => api(`/groups/${g.id}/order`, { body: {} }))}
          />
        )}
        {g.isOrganizer && g.status === "ORDERING" && g.memberships.every((m) => m.turn != null) && (
          <Button title={t("start")} loading={busy === "start"} onPress={() => run("start", () => api(`/groups/${g.id}/start`, { body: {} }))} />
        )}
        {g.isOrganizer && g.demoMode && g.status === "ACTIVE" && (
          <Button kind="ghost" title={`⏩ ${t("runEngine")}`} loading={busy === "tick"} onPress={() => run("tick", () => api(`/groups/${g.id}/tick`, { body: {} }))} />
        )}

        <Button title={`💬 ${t("chat")}`} onPress={() => router.push(`/groups/${g.id}/chat`)} />
      </ScrollView>
    </>
  );
}
