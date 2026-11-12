/**
 * The group the person is looking at, loaded once for all its screens (summary, turns, guarantee, chat...). The top
 * menu and the summary read it from here instead of each asking the server again; it refreshes every few seconds.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { LoadError, Loading } from "@/components/ui";
import type { TrustProfile } from "@/components/trust";
import type { PPPayout } from "@/components/paypal";
import { api } from "@/lib/api";
import { errorText } from "@/lib/errors";
import { useI18n } from "@/lib/i18n";

export type Contribution = {
  id: string;
  membershipId: string;
  // CLOSED = someone else's unpaid contribution, as the group sees it (details are private)
  status: "PENDING" | "PAID" | "COVERED" | "DEFAULTED" | "CLOSED";
  amountCents: number;
  lateFeeCents: number;
  paidAt?: string | null;
  paypalCaptureId?: string | null;
};
export type JoinReq = {
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
export type Round = {
  id: string;
  number: number;
  status: "UPCOMING" | "COLLECTING" | "READY" | "PAID_OUT";
  dueAt: string;
  recipientId: string;
  recipient: { user: { name: string } };
  contributions: Contribution[];
};
export type Member = {
  id: string;
  userId: string;
  turn: number | null;
  retentionPct: number;
  retentionHeldCents: number;
  isNewcomer: boolean;
  user: { id: string; name: string; country?: string | null };
};
export type Action = { id: string; type: string; summary: string; expiresAt: string; payload: any };
export type Group = {
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

type Ctx = { g: Group; reload: () => Promise<void> };
const GroupCtx = createContext<Ctx | null>(null);

export function useGroup(): Ctx {
  const v = useContext(GroupCtx);
  if (!v) throw new Error("useGroup must be used inside a group screen");
  return v;
}

/** Loads the group and shows a loading or an error screen (with "retry") until it is there. */
export function GroupProvider({ id, children }: { id: string; children: ReactNode }) {
  const { t } = useI18n();
  const [g, setG] = useState<Group | null>(null);
  const [error, setError] = useState<string | null>(null);

  const current = useRef(id);
  current.current = id;
  const reload = useCallback(async () => {
    const next = await api<Group>(`/groups/${id}`);
    // an answer for the group the person already left must not replace the one on screen
    if (current.current !== id) return;
    setG(next);
    setError(null);
  }, [id]);
  const first = useCallback(() => {
    setError(null);
    reload().catch((e) => setError(errorText(e, t)));
  }, [reload, t]);

  useEffect(() => {
    // Another group: the old one stays mounted under a loading cover. Unmounting the screens here made the router lose
    // the new address and bounce back to the previous group.
    setError(null);
    first();
    // live updates while any screen of the group is open; a failed refresh of a group already on screen is ignored
    const timer = setInterval(() => reload().catch(() => {}), 5000);
    return () => clearInterval(timer);
  }, [id]);

  const value = useMemo(() => (g ? { g, reload } : null), [g, reload]);
  const cover = error ? <LoadError text={error} retry={t("retry")} onRetry={first} back={t("myGroups")} onBack={() => router.replace("/groups")} /> : <Loading />;
  if (!value) return cover;
  return (
    <GroupCtx.Provider value={value}>
      {children}
      {g!.id !== id ? <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}>{cover}</View> : null}
    </GroupCtx.Provider>
  );
}
