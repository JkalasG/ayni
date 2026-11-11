import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { AccessibilityInfo, Alert, Platform, Pressable, RefreshControl, ScrollView, Share, Text, View } from "react-native";
import { Stack, router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { Badge, Button, LinkRow, Loading, Notice, P, Weave } from "@/components/ui";
import { RuleChecklist, TrustCard, type TrustProfile } from "@/components/trust";
import { Tejido } from "@/components/tejido";
import { Confetti, PotCelebration } from "@/components/celebrations";
import { Icon } from "@/components/icons";
import { PayPalActivity, PayPalChip, PayPalWordmark, type PPPayout } from "@/components/paypal";
import { StepButton, SteppedBox } from "@/components/stepped";
import { WovenAvatar } from "@/components/woven-avatar";
import { Vasija } from "@/components/vasija";
import { countryName } from "@/lib/countries";
import { useI18n, type Key } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { useLayout } from "@/lib/layout";
import { useScheme } from "@/lib/scheme";
import { api, ApiError, money } from "@/lib/api";
import { payContribution } from "@/lib/pay";
import { preloadPayPal } from "@/lib/paypal-sdk";
import { getFlag, setFlag } from "@/lib/flags";
import { fonts, space, type Palette } from "@/lib/theme";

type Contribution = {
  id: string;
  membershipId: string;
  // CLOSED = someone else's unpaid contribution, as the group sees it (details are private)
  status: "PENDING" | "PAID" | "COVERED" | "DEFAULTED" | "CLOSED";
  amountCents: number;
  lateFeeCents: number;
  paidAt?: string | null;
  paypalCaptureId?: string | null;
};
type JoinReq = {
  id: string;
  name: string;
  message: string | null;
  profile: TrustProfile;
  failures: string[];
  meetsRules: boolean;
  aiRecommendation: "accept" | "reject" | null;
  aiReason: string | null;
  depositCents: number;
};
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
  isNewcomer: boolean;
  user: { id: string; name: string; country?: string | null };
};
type Action = { id: string; type: string; summary: string; expiresAt: string; payload: any };
type Group = {
  id: string;
  name: string;
  status: "FORMING" | "ORDERING" | "ACTIVE" | "FINISHED" | "CANCELLED";
  inviteCode: string;
  organizerId: string;
  contributionCents: number;
  country: string;
  frequency: string;
  orderMethod: "LOTTERY" | "AI" | "ORGANIZER";
  demoMode: boolean;
  isOpen: boolean;
  minCompleted: number;
  minOnTimePct: number;
  maxLate: number | null;
  acceptNewcomers: boolean;
  memberships: Member[];
  requests: JoinReq[];
  failedPayouts: { id: string; kind: string; status: "FAILED" | "UNKNOWN"; amountCents: number; name: string }[];
  failedRefunds: { id: string; amountCents: number; name: string }[];
  rounds: Round[];
  actions: Action[];
  myMembershipId: string;
  isOrganizer: boolean;
  potCents: number;
  payouts: PPPayout[];
  paypalMode: "live" | "mock";
  unreadChat: number;
  autoPay: boolean;
  hasSavedMethod: boolean;
};

const statusColor = (c: Palette, s: Group["status"]) =>
  ({ FORMING: c.naranja.text, ORDERING: c.turquesa.text, ACTIVE: c.verde.text, FINISHED: c.muted, CANCELLED: c.rojo.text })[s];

/** Server error codes the organizer can run into here, in plain words. Anything else shows a generic message. */
const ERRORS: Record<string, Key> = {
  group_already_started: "err_group_already_started",
  already_cancelled: "err_already_cancelled",
  not_failed: "err_not_failed",
  paypal_error: "err_paypal_error",
  organizer_only: "err_organizer_only",
  platform_balance_low: "err_platform_balance_low",
  no_saved_method: "err_no_saved_method",
};

/** The pot is the treasure: a solid gold block with dark ink, 10:1 contrast in both modes. */
const GOLD = "#FFC93C";
const GOLD_INK = "#1A1A3A";
const GOLD_SOFT = "#4D3B00";
const GOLD_ALERT = "#7A2300";
/** Threads that fill the vessel; fixed because the pot is always gold. */
const VASIJA_COLORS = { paid: ["#D4106B", "#0E9A64", "#E06A00", "#5B2BB8", "#C2261F"], covered: "#06708A", late: "#7A2300", accent: GOLD, empty: "#1A1A3A30" };

const firstName = (n: string) => n.replace(/^(Doña|Don)\s+/i, "").split(" ")[0];

export default function GroupScreen() {
  const { id, status } = useLocalSearchParams<{ id: string; status?: string }>();
  const { t, lang } = useI18n();
  const { me } = useAuth();
  const { c } = useScheme();
  const { wide } = useLayout();
  const insets = useSafeAreaInsets();
  const [g, setG] = useState<Group | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ text: string; tone: "ok" | "error" | "info" } | null>(null);
  const [confetti, setConfetti] = useState(0);
  const [pot, setPot] = useState<{ round: Round; streak: number | null } | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [saveMethod, setSaveMethod] = useState(false);
  const lastMine = useRef<string | null>(null);
  const load = useCallback(async () => {
    setG(await api<Group>(`/groups/${id}`));
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load().catch(() => {});
      // live updates while the screen is open
      const timer = setInterval(() => load().catch(() => {}), 5000);
      return () => clearInterval(timer);
    }, [load])
  );

  const celebratePayment = useCallback(() => {
    setConfetti((n) => n + 1);
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    AccessibilityInfo.announceForAccessibility?.(t("paymentReceived"));
  }, [t]);

  // Warm up the PayPal popup (web) so it can open straight from the click
  useEffect(() => {
    preloadPayPal();
  }, []);

  // Web returns here from PayPal with ?status=paid|cancelled|error
  useEffect(() => {
    if (status === "paid") {
      setBanner({ text: t("paymentOk"), tone: "ok" });
      celebratePayment();
    } else if (status === "cancelled") setBanner({ text: t("paymentCancel"), tone: "info" });
    else if (status === "error") setBanner({ text: t("paymentError"), tone: "error" });
  }, [status, t]);

  // My contribution just went from pending to paid (here or from another device): weave it and celebrate.
  const current = g?.rounds.find((r) => r.status === "COLLECTING" || r.status === "READY");
  const myContribution = current?.contributions.find((x) => x.membershipId === g?.myMembershipId);
  useEffect(() => {
    const key = myContribution ? `${myContribution.id}:${myContribution.status}` : null;
    const before = lastMine.current;
    lastMine.current = key;
    if (before && key && before.startsWith(myContribution!.id) && before.endsWith(":PENDING") && myContribution!.status !== "PENDING" && status !== "paid") celebratePayment();
  }, [myContribution?.id, myContribution?.status]);

  // I took the pot and haven't seen the celebration on this device yet.
  useEffect(() => {
    if (!g) return;
    const mine = g.rounds.find((r) => r.recipientId === g.myMembershipId && r.status === "PAID_OUT");
    if (!mine || pot) return;
    const flag = `ayni_pot_${mine.id}`;
    getFlag(flag).then(async (seen) => {
      if (seen) return;
      await setFlag(flag);
      const profile = await api<TrustProfile & { streak?: number }>("/me/profile").catch(() => null);
      setPot({ round: mine, streak: profile?.streak ?? null });
    });
  }, [g?.id, g?.rounds.map((r) => r.status).join()]);

  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    try {
      await fn();
      await load();
    } catch (e) {
      const msg = e instanceof ApiError ? (ERRORS[e.code] ? t(ERRORS[e.code]) : e.code) : String(e);
      Platform.OS === "web" ? setBanner({ text: msg, tone: "error" }) : Alert.alert("Ayni", msg);
    } finally {
      setBusy(null);
    }
  };

  if (!g || !me) return <Loading />;

  const locale = lang === "en" ? "en-US" : "es-BO";
  const day = (d: string) => new Date(d).toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "short" });
  const memberName = (membershipId: string) => g.memberships.find((m) => m.id === membershipId)?.user.name ?? "?";
  const settled = current ? current.contributions.filter((x) => x.status !== "PENDING").length : 0;
  const missing = current ? current.contributions.filter((x) => x.status === "PENDING").map((x) => firstName(memberName(x.membershipId))) : [];
  const rules = { minCompleted: g.minCompleted, minOnTimePct: g.minOnTimePct, maxLate: g.maxLate, acceptNewcomers: g.acceptNewcomers };
  const mustPay = myContribution?.status === "PENDING" && current?.status === "COLLECTING";
  const payAmount = myContribution ? myContribution.amountCents + myContribution.lateFeeCents : 0;
  const mine = g.memberships.find((m) => m.id === g.myMembershipId);
  const myTurnRound = g.rounds.find((r) => r.recipientId === g.myMembershipId);
  const isMyRound = current?.recipientId === g.myMembershipId;

  const pay = () =>
    run("pay", async () => {
      const r = await payContribution(myContribution!.id, g.id, saveMethod && !g.hasSavedMethod);
      if (r === "paid") {
        setBanner({ text: t("paymentOk"), tone: "ok" });
        celebratePayment();
      } else if (r === "cancelled") setBanner({ text: t("paymentCancel"), tone: "info" });
      else if (r === "error") setBanner({ text: t("paymentError"), tone: "error" });
    });

  // ------------------------------------------------------------------ blocks

  const sub = `${g.memberships.length} ${t("membersWord")}, ${t(g.frequency as Key).toLowerCase()}, ${money(g.contributionCents)} ${t("perRound")}`;

  const header = (
    <View style={{ gap: space(3) }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space(3) }}>
        {!wide && (
          <Pressable accessibilityRole="button" accessibilityLabel={t("back")} onPress={() => (router.canGoBack() ? router.back() : router.navigate("/groups"))}>
            <SteppedBox fill={c.surface} stroke={c.line} step={3} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
              <Icon name="atras" size={18} color={c.ink} />
            </SteppedBox>
          </Pressable>
        )}
        <View style={{ flex: 1, gap: 2 }}>
          <Text accessibilityRole="header" numberOfLines={2} style={{ fontFamily: fonts.display, fontSize: wide ? 30 : 19, lineHeight: wide ? 36 : 24, color: c.ink }}>
            {g.name}
          </Text>
          <Text style={{ fontFamily: fonts.body, fontSize: wide ? 16 : 14, color: c.muted }}>{sub}</Text>
        </View>
      </View>
      <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
        <Badge text={t(`status_${g.status}` as Key)} color={statusColor(c, g.status)} />
        {g.isOpen ? <Badge text={t("openBadge")} color={c.turquesa.text} /> : null}
        {g.demoMode ? <Badge text={t("demoBadge")} color={c.muted} /> : null}
        {g.isOrganizer ? <Badge text={t("organizer")} color={c.fucsia.text} /> : null}
      </View>
    </View>
  );

  const potAmount = (
    <Text style={{ fontFamily: fonts.displayHeavy, fontSize: wide ? 72 : 54, lineHeight: wide ? 80 : 62, color: GOLD_INK, fontVariant: ["tabular-nums"], letterSpacing: -1 }}>
      {money(g.potCents)}
    </Text>
  );

  /** The pot, with a vessel that fills with threads as each PayPal payment is confirmed. */
  const potCard = (
    <SteppedBox fill={GOLD} step={6} style={{ padding: wide ? space(7) : space(5), gap: space(3) }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Icon name="pozo" size={20} color={GOLD_INK} />
          <Text style={{ fontFamily: fonts.bodyBold, fontSize: 15, color: GOLD_SOFT }}>
            {current ? `${t("pot")}, ${t("round").toLowerCase()} ${current.number} ${t("of")} ${g.rounds.length}` : t("pot")}
          </Text>
        </View>
        {current && current.status === "COLLECTING" ? (
          <Text style={{ fontFamily: fonts.bodyBold, fontSize: 14.5, color: GOLD_ALERT }}>
            {t("dueShort")} {day(current.dueAt)}
          </Text>
        ) : null}
      </View>
      {potAmount}
      <View style={{ flexDirection: "row", alignItems: "center", gap: space(4) }}>
        <View style={{ flex: 1, gap: space(2) }}>
          {current ? (
            <Text style={{ fontFamily: fonts.body, fontSize: 17, color: GOLD_INK }}>
              {isMyRound ? (
                <Text style={{ fontFamily: fonts.bodyBold, color: GOLD_INK, textDecorationLine: "underline" }}>{t("youReceiveThisRound")}</Text>
              ) : (
                <>
                  {t("thisRoundReceives")} <Text style={{ fontFamily: fonts.bodyBold, color: GOLD_INK, textDecorationLine: "underline" }}>{current.recipient.user.name}</Text>
                </>
              )}
            </Text>
          ) : (
            <Text style={{ fontFamily: fonts.body, fontSize: 16, color: GOLD_SOFT }}>
              {money(g.contributionCents)} {t(`per_${g.frequency}` as Key)}
            </Text>
          )}
          {current && (
            <Text style={{ fontFamily: fonts.body, fontSize: 14.5, color: GOLD_SOFT }}>
              {settled} {t("of")} {current.contributions.length} {t("contributionsIn")}
              {missing.length ? `, ${t("missing")} ${joinNames(missing, t("and"))}` : ""}
            </Text>
          )}
        </View>
        {current ? (
          <Vasija
            slots={current.contributions.map((x) => ({ id: x.id, state: x.status === "PENDING" ? "EMPTY" : x.status === "COVERED" ? "COVERED" : "PAID" }))}
            size={wide ? 150 : 104}
            ink={GOLD_INK}
            colors={VASIJA_COLORS}
            label={`${t("vasijaLabel")}: ${settled} ${t("of")} ${current.contributions.length} ${t("contributionsIn")}`}
          />
        ) : null}
      </View>
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap", borderTopWidth: 1, borderColor: GOLD_INK + "44", paddingTop: space(3) }}>
        <PayPalChip mode={g.paypalMode} />
        <Text style={{ flex: 1, minWidth: 160, fontFamily: fonts.body, fontSize: 13.5, lineHeight: 19, color: GOLD_SOFT }}>{t("ppFlow")}</Text>
      </View>
    </SteppedBox>
  );

  const turnLine = mine?.turn != null && myTurnRound ? (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: c.amarillo.fill + "26", alignSelf: "flex-start" }}>
      <Icon name="turno" size={14} color={c.amarillo.text} />
      <Text style={{ fontFamily: fonts.bodyBold, fontSize: 13.5, color: c.amarillo.text }}>
        {t("yourTurnShort")}: R{myTurnRound.number}
      </Text>
    </View>
  ) : null;

  /** My contribution: the one action that matters. */
  const payPanel = myContribution && (
    <SteppedBox fill={c.surface} stroke={mustPay ? c.fucsia.fill : c.line} step={5} style={{ padding: space(4), gap: space(3) }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ fontFamily: fonts.body, fontSize: 14, color: c.muted }}>{t("yourContributionRound")}</Text>
          {mustPay ? (
            <Text style={{ fontFamily: fonts.display, fontSize: 19, color: c.ink }}>
              {money(payAmount)} <Text style={{ fontFamily: fonts.bodyBold, fontSize: 15, color: c.naranja.text }}>{t("pending").toLowerCase()}</Text>
            </Text>
          ) : (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Icon name={myContribution.status === "COVERED" ? "garantia" : "aprobar"} size={18} color={myContribution.status === "COVERED" ? c.turquesa.text : c.verde.text} />
              <Text style={{ flex: 1, fontFamily: fonts.bodyBold, fontSize: 16, lineHeight: 22, color: myContribution.status === "COVERED" ? c.turquesa.text : c.verde.text }}>
                {myContribution.status === "COVERED" ? t("coveredForYou") : t("youPaid")}
              </Text>
            </View>
          )}
        </View>
        {turnLine}
      </View>
      {mustPay && myContribution.lateFeeCents > 0 && (
        <Text style={{ fontFamily: fonts.body, fontSize: 14, color: c.rojo.text }}>
          {t("includesFee")} {money(myContribution.lateFeeCents)}
        </Text>
      )}
      {mustPay && (
        <StepButton
          title={`${t("payWith")} ${money(payAmount)}`}
          accessibilityLabel={`${t("payWith")} ${money(payAmount)} ${t("withPayPal")}`}
          fill={c.paypal}
          ink={c.paypalInk}
          loading={busy === "pay"}
          right={<PayPalWordmark size={22} />}
          onPress={pay}
        />
      )}
      {/* Offer to save the PayPal only while paying, and only when there is none saved yet. */}
      {mustPay && !g.hasSavedMethod && (
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: saveMethod }}
          accessibilityHint={t("apSaveHint")}
          onPress={() => setSaveMethod((v) => !v)}
          style={{ flexDirection: "row", gap: 12, alignItems: "flex-start", minHeight: 44 }}
        >
          <View style={{ width: 24, height: 24, borderWidth: 2, borderColor: saveMethod ? c.fucsia.fill : c.muted, backgroundColor: saveMethod ? c.fucsia.fill : "transparent", alignItems: "center", justifyContent: "center", marginTop: 2 }}>
            {saveMethod ? <Icon name="aprobar" size={14} color={c.onAction} /> : null}
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ fontFamily: fonts.bodyBold, fontSize: 15, lineHeight: 21, color: c.ink }}>{t("apSave")}</Text>
            <Text style={{ fontFamily: fonts.body, fontSize: 13.5, lineHeight: 19, color: c.muted }}>{t("apSaveHint")}</Text>
          </View>
        </Pressable>
      )}
      {mustPay && <Text style={{ fontFamily: fonts.body, fontSize: 13.5, lineHeight: 19, color: c.muted }}>{t("ppSecure")}</Text>}
      {!mustPay && mine?.turn != null && (
        <Text style={{ fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: c.muted }}>
          {mine.retentionPct > 0 ? `${t("guaranteeWithheld")} ${mine.retentionPct}%` : t("noGuarantee")}
          {mine.retentionHeldCents > 0 ? `, ${money(mine.retentionHeldCents)} ${t("held")}` : ""}
        </Text>
      )}
    </SteppedBox>
  );

  /** Automatic payment: one clear state, one button to change it, and a way to remove the saved PayPal. */
  const autoPayCard = g.status === "ACTIVE" && g.hasSavedMethod && (
    <SteppedBox fill={c.surface} stroke={g.autoPay ? c.verde.fill : c.line} step={5} style={{ padding: space(4), gap: space(3) }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Icon name="paypal" size={18} color={g.autoPay ? c.verde.text : c.muted} />
        <Text accessibilityRole="header" style={{ fontFamily: fonts.display, fontSize: 16, color: c.ink }}>
          {t("apTitle")}
        </Text>
      </View>
      <P muted>{g.autoPay ? t("apOn") : t("apOff")}</P>
      <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
        <Button
          compact
          kind={g.autoPay ? "secondary" : "primary"}
          title={g.autoPay ? t("apTurnOff") : t("apTurnOn")}
          loading={busy === "autopay"}
          onPress={() => run("autopay", () => api(`/groups/${g.id}/autopay`, { body: { enabled: !g.autoPay } }))}
        />
        <Button
          compact
          kind="ghost"
          title={t("apRemove")}
          loading={busy === "removepm"}
          onPress={() =>
            run("removepm", async () => {
              await api("/me/payment-method", { method: "DELETE" });
              setBanner({ text: t("apRemoved"), tone: "ok" });
            })
          }
        />
      </View>
    </SteppedBox>
  );

  const weave = g.rounds.length > 0 && (
    <SteppedBox fill={c.surface} stroke={c.line} step={5} style={{ padding: wide ? space(6) : space(4), gap: space(4) }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
        <Text accessibilityRole="header" style={{ fontFamily: fonts.display, fontSize: 18, color: c.ink }}>
          {t("weaveTitle")}
        </Text>
        <Text style={{ fontFamily: fonts.body, fontSize: 13.5, color: c.muted }}>{t("eachThread")}</Text>
      </View>
      <Tejido rounds={g.rounds} members={g.memberships} me={g.myMembershipId} cell={wide ? 50 : 38} onRoundComplete={() => setConfetti((n) => n + 1)} />
    </SteppedBox>
  );

  const decisions = g.isOrganizer && g.actions.length > 0 && (
    <SteppedBox fill={c.surface} stroke={c.fucsia.fill} step={5} style={{ padding: space(5), gap: space(4) }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Icon name="aprobar" size={20} color={c.fucsia.text} />
        <Text accessibilityRole="header" style={{ flex: 1, fontFamily: fonts.display, fontSize: 17, color: c.ink }}>
          {t("pendingDecisions")}
        </Text>
        <View style={{ backgroundColor: c.fucsia.fill, minWidth: 26, height: 26, alignItems: "center", justifyContent: "center", paddingHorizontal: 6 }}>
          <Text style={{ fontFamily: fonts.display, fontSize: 13, color: c.onAction }}>{g.actions.length}</Text>
        </View>
      </View>
      {g.actions.map((a, i) => (
        <View key={a.id} style={{ gap: space(3), paddingTop: i ? space(4) : 0, borderTopWidth: i ? 1 : 0, borderColor: c.line }}>
          <P bold>{a.summary}</P>
          {a.type === "ADMIT_MEMBER" &&
            (() => {
              const r = g.requests.find((x) => x.id === a.payload.requestId);
              if (!r) return null;
              return (
                <View style={{ gap: space(3) }}>
                  {r.message ? (
                    <View style={{ borderLeftWidth: 3, borderColor: c.line, paddingLeft: space(3) }}>
                      <P style={{ fontStyle: "italic" }}>{r.message}</P>
                    </View>
                  ) : null}
                  <TrustCard profile={r.profile} title={r.name} />
                  <RuleChecklist check={{ meets: r.meetsRules, borderline: false, failures: r.failures }} rules={rules} profile={r.profile} />
                  {r.aiRecommendation && (
                    <View style={{ borderLeftWidth: 4, borderColor: c.turquesa.fill, backgroundColor: c.turquesa.fill + "1A", padding: space(4), gap: 6 }}>
                      <Text style={{ fontFamily: fonts.bodyBold, fontSize: 15.5, color: c.turquesa.text }}>
                        {t("aiRecommends")} {r.aiRecommendation === "accept" ? t("accept") : t("rejectWord")}
                      </Text>
                      <P>{r.aiReason}</P>
                      <Text style={{ fontFamily: fonts.body, fontSize: 13.5, color: c.muted }}>{t("youDecide")}</Text>
                    </View>
                  )}
                  {r.depositCents > 0 && (
                    <P muted>
                      {t("deposit")}: {money(r.depositCents)}
                    </P>
                  )}
                </View>
              );
            })()}
          {a.type === "APPROVE_ORDER" &&
            (a.payload.order as string[]).map((mid, k) => (
              <P key={mid} muted>
                {k + 1}. {memberName(mid)}
                {a.payload.reasons?.[mid] ? `: ${a.payload.reasons[mid]}` : ""}
              </P>
            ))}
          <Text style={{ fontFamily: fonts.body, fontSize: 13.5, color: c.muted }}>
            {t("autoIn")} {new Date(a.expiresAt).toLocaleString(locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
          </Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Button compact title={t("approve")} left={<Icon name="aprobar" size={16} color={c.onAction} />} loading={busy === a.id} onPress={() => run(a.id, () => api(`/actions/${a.id}/approve`, { body: {} }))} />
            </View>
            <View style={{ flex: 1 }}>
              <Button compact kind="danger" title={t("reject")} left={<Icon name="rechazar" size={14} color={c.rojo.text} />} loading={busy === a.id + "r"} onPress={() => run(a.id + "r", () => api(`/actions/${a.id}/reject`, { body: {} }))} />
            </View>
          </View>
        </View>
      ))}
    </SteppedBox>
  );

  const failedRefunds = g.isOrganizer && g.failedRefunds.length > 0 && (
    <View style={{ borderLeftWidth: 4, borderColor: c.rojo.fill, backgroundColor: c.surface, padding: space(4), gap: space(3) }}>
      <Text style={{ fontFamily: fonts.display, fontSize: 16, color: c.ink }}>{t("failedRefunds")}</Text>
      {g.failedRefunds.map((r) => (
        <View key={r.id} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <View style={{ flex: 1 }}>
            <P bold>
              {r.name}, {money(r.amountCents)}
            </P>
          </View>
          <Button compact kind="secondary" title={t("retry")} loading={busy === r.id} onPress={() => run(r.id, () => api(`/refunds/${r.id}/retry`, { body: {} }))} />
        </View>
      ))}
    </View>
  );

  const failed = g.isOrganizer && g.failedPayouts.length > 0 && (
    <View style={{ borderLeftWidth: 4, borderColor: c.rojo.fill, backgroundColor: c.surface, padding: space(4), gap: space(3) }}>
      <Text style={{ fontFamily: fonts.display, fontSize: 16, color: c.ink }}>{t("failedPayouts")}</Text>
      {g.failedPayouts.map((p) => (
        <View key={p.id} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <View style={{ flex: 1 }}>
            <P bold>
              {p.name}, {money(p.amountCents)}
            </P>
            {p.status === "UNKNOWN" ? <P muted>{t("payoutUnknown")}</P> : null}
          </View>
          <Button compact kind="secondary" title={t("retry")} loading={busy === p.id} onPress={() => run(p.id, () => api(`/payouts/${p.id}/retry`, { body: {} }))} />
        </View>
      ))}
    </View>
  );

  const members = (
    <View style={{ gap: space(2) }}>
      <Text accessibilityRole="header" style={{ fontFamily: fonts.display, fontSize: 17, color: c.ink }}>
        {t("members")} ({g.memberships.length})
      </Text>
      {[...g.memberships]
        .sort((a, b) => (a.turn ?? 99) - (b.turn ?? 99))
        .map((m, i, all) => (
          <View key={m.id} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: space(2.5), borderBottomWidth: i < all.length - 1 ? 1 : 0, borderColor: c.line }}>
            <WovenAvatar id={m.user.id} name={m.user.name} size={40} />
            <View style={{ flex: 1, gap: 2 }}>
              <P bold>
                {m.user.name}
                {m.userId === me.id ? ` (${t("you")})` : ""}
              </P>
              <Text style={{ fontFamily: fonts.body, fontSize: 14, color: c.muted }}>
                {[m.userId === g.organizerId ? t("organizer") : null, m.user.country && m.user.country !== g.country ? `${t("paysFrom")} ${countryName(m.user.country, lang)}` : null, m.turn != null ? `${t("guarantee")} ${m.retentionPct}%` : null, m.isNewcomer ? t("newcomer") : null].filter(Boolean).join(", ")}
              </Text>
            </View>
            {m.turn != null && (
              <View style={{ alignItems: "center", minWidth: 40 }}>
                <Text style={{ fontFamily: fonts.displayHeavy, fontSize: 20, color: m.id === current?.recipientId ? c.amarillo.text : c.muted, fontVariant: ["tabular-nums"] }}>R{m.turn}</Text>
              </View>
            )}
          </View>
        ))}
    </View>
  );

  const invite = g.status === "FORMING" && (
    <SteppedBox fill={c.surfaceAlt} step={5} style={{ padding: space(6), gap: space(3), alignItems: "flex-start" }}>
      <P bold>{t("inviteShare")}</P>
      <Text selectable style={{ fontFamily: fonts.displayHeavy, fontSize: wide ? 48 : 38, letterSpacing: 8, color: c.ink }}>
        {g.inviteCode}
      </Text>
      {Platform.OS !== "web" && (
        <Button compact kind="light" title={t("share")} left={<Icon name="compartir" size={16} color={c.ink} />} onPress={() => Share.share({ message: `Ayni, ${g.name}: ${g.inviteCode}` })} />
      )}
    </SteppedBox>
  );

  const controls = g.isOrganizer && (
    <View style={{ gap: space(3) }}>
      {(g.status === "FORMING" || g.status === "ORDERING") && (
        <Button kind="secondary" title={`${t("setOrder")}: ${t(g.orderMethod as Key)}`} loading={busy === "order"} onPress={() => run("order", () => api(`/groups/${g.id}/order`, { body: {} }))} />
      )}
      {g.status === "ORDERING" && g.memberships.every((m) => m.turn != null) && (
        <Button title={t("start")} loading={busy === "start"} onPress={() => run("start", () => api(`/groups/${g.id}/start`, { body: {} }))} />
      )}
      {g.demoMode && g.status === "ACTIVE" && (
        <Button kind="ghost" title={t("runEngine")} loading={busy === "tick"} onPress={() => run("tick", () => api(`/groups/${g.id}/tick`, { body: {} }))} />
      )}
      {/* Cancelling is only possible before it starts, and always asks first: it cannot be undone. */}
      {(g.status === "FORMING" || g.status === "ORDERING") &&
        (confirmCancel ? (
          <View accessibilityRole="alert" style={{ borderLeftWidth: 4, borderColor: c.rojo.fill, backgroundColor: c.surface, padding: space(4), gap: space(3) }}>
            <P bold>{t("cancelAsk")}</P>
            <P muted>{t("cancelExplain")}</P>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Button compact kind="secondary" title={t("cancelNo")} onPress={() => setConfirmCancel(false)} />
              </View>
              <View style={{ flex: 1 }}>
                <Button
                  compact
                  kind="danger"
                  title={t("cancelYes")}
                  loading={busy === "cancel"}
                  onPress={() =>
                    run("cancel", async () => {
                      await api(`/groups/${g.id}/cancel`, { body: {} });
                      setConfirmCancel(false);
                    })
                  }
                />
              </View>
            </View>
          </View>
        ) : (
          <Button kind="ghost" title={t("cancelGroup")} onPress={() => setConfirmCancel(true)} />
        ))}
    </View>
  );

  const cancelledNote = g.status === "CANCELLED" ? <Notice>{t("cancelledNote")}</Notice> : null;

  const paypalPanel = g.status !== "FORMING" || g.payouts.length > 0 || g.rounds.length > 0 ? (
    <PayPalActivity
      rounds={g.rounds}
      payouts={g.payouts}
      nameOf={memberName}
      mode={g.paypalMode}
      recipientName={current && !isMyRound ? current.recipient.user.name : undefined}
      locale={locale}
    />
  ) : null;

  const links = (
    <View style={{ borderTopWidth: 1, borderColor: c.line }}>
      <LinkRow
        title={t("chat")}
        hint={g.unreadChat > 0 ? `${g.unreadChat} ${t(g.unreadChat === 1 ? "chNewOne" : "chNew")}` : t("chLinkHint")}
        onPress={() => router.push(`/groups/${g.id}/chat`)}
      />
      <LinkRow title={t("payments")} hint={t("paymentsShort")} onPress={() => router.push(`/groups/${g.id}/payments`)} />
      {g.status !== "FORMING" && <LinkRow title={t("claims")} hint={t("claimsShort")} onPress={() => router.push(`/groups/${g.id}/claims`)} />}
      <LinkRow title={t("aiLog")} hint={t("aiLogShort")} onPress={() => router.push(`/groups/${g.id}/ai-log`)} last={!g.isOrganizer} />
      {g.isOrganizer && g.status === "FORMING" && <LinkRow title={t("publish")} hint={g.isOpen ? t("isOpenNow") : t("publishHint")} onPress={() => router.push(`/groups/${g.id}/admission`)} />}
      {g.isOrganizer && g.status !== "FORMING" && <LinkRow title={t("checkDisputes")} hint={t("disputesHint")} onPress={() => router.push(`/groups/${g.id}/disputes`)} last />}
    </View>
  );

  const roundPot = (r: Round) => r.contributions.reduce((s, x) => s + (x.status === "PAID" || x.status === "COVERED" ? x.amountCents + x.lateFeeCents : 0), 0);
  const overlays = (
    <>
      {confetti > 0 && <Confetti key={confetti} onDone={() => setConfetti(0)} />}
      {pot && (
        <PotCelebration
          round={pot.round.number}
          groupName={g.name}
          amountCents={Math.max(0, roundPot(pot.round) - Math.min(mine?.retentionHeldCents ?? 0, roundPot(pot.round)))}
          guaranteeCents={Math.min(mine?.retentionHeldCents ?? 0, roundPot(pot.round))}
          streak={pot.streak}
          onClose={() => setPot(null)}
          onPassport={() => {
            setPot(null);
            router.navigate("/profile");
          }}
        />
      )}
    </>
  );

  // ------------------------------------------------------------------ layouts

  if (wide) {
    return (
      <View style={{ flex: 1 }}>
        {/* the sidebar is the navigation on wide screens: no header bar repeating the name */}
        <Stack.Screen options={{ title: g.name, headerShown: false }} />
        <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={{ padding: space(10), paddingBottom: space(16) }}>
          <View style={{ maxWidth: 1240, width: "100%", alignSelf: "center", gap: space(7) }}>
            {header}
            {banner && <Notice tone={banner.tone}>{banner.text}</Notice>}
            {cancelledNote}
            <View style={{ flexDirection: "row", gap: space(8), alignItems: "flex-start" }}>
              <View style={{ flex: 1, gap: space(7), minWidth: 0 }}>
                {potCard}
                {weave}
                {invite}
                {members}
                {controls}
              </View>
              <View style={{ width: 380, gap: space(6) }}>
                {payPanel}
                {autoPayCard}
                {decisions}
                {failed}
                {failedRefunds}
                {paypalPanel}
                {links}
              </View>
            </View>
          </View>
        </ScrollView>
        {overlays}
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: g.name, headerShown: false }} />
      <View style={{ paddingTop: insets.top + space(3), paddingHorizontal: space(4), paddingBottom: space(3), backgroundColor: c.bg, gap: space(3) }}>{header}</View>
      <Weave cell={3} />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: space(4), gap: space(5), paddingBottom: space(8), maxWidth: 640, width: "100%", alignSelf: "center" }}
        refreshControl={<RefreshControl refreshing={false} onRefresh={() => load().catch(() => {})} />}
      >
        {banner && <Notice tone={banner.tone}>{banner.text}</Notice>}
        {cancelledNote}
        {potCard}
        {decisions}
        {weave}
        {!mustPay && payPanel}
        {autoPayCard}
        {failed}
        {failedRefunds}
        {paypalPanel}
        {invite}
        {controls}
        {members}
        {links}
      </ScrollView>
      {/* phone: the payment stays within reach of the thumb, just above the tab bar */}
      {mustPay && <View style={{ paddingHorizontal: space(3), paddingVertical: space(2), backgroundColor: c.bg, borderTopWidth: 1, borderColor: c.line }}>{payPanel}</View>}
      {overlays}
    </View>
  );
}

function joinNames(names: string[], and: string) {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} ${and} ${names[names.length - 1]}`;
}
