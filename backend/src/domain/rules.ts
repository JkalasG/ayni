/**
 * Pure pasanaku rules. No I/O here, so it is easy to test and to explain.
 * All money is in integer cents.
 */
import { randomInt } from "crypto";

export type Frequency = "WEEKLY" | "BIWEEKLY" | "MONTHLY";

/**
 * Base retention by turn: the first turn carries the most risk for the group
 * (they get the pot before paying almost anything), the last turn carries none.
 * Linear taper from maxPct (turn 1) to 0 (last turn).
 */
export function baseRetentionPct(turn: number, members: number, maxPct: number): number {
  if (members <= 1 || turn >= members) return 0;
  return Math.round((maxPct * (members - turn)) / (members - 1));
}

/**
 * The AI adjusts the base by up to ±10 points depending on the risk score
 * (0 = safest, 100 = riskiest). Last turn always stays at 0.
 */
export function adjustedRetentionPct(
  base: number,
  riskScore: number,
  maxPct: number,
  isLastTurn: boolean
): number {
  if (isLastTurn) return 0;
  const adjust = Math.round(((clamp(riskScore, 0, 100) - 50) / 50) * 10);
  return clamp(base + adjust, 0, maxPct + 10);
}

/**
 * How much of the pot is withheld. Never more than what the person still owes
 * the group (their remaining contributions after receiving the pot).
 */
export function retentionCents(
  potCents: number,
  retentionPct: number,
  contributionCents: number,
  turn: number,
  members: number
): number {
  const wanted = Math.floor((potCents * retentionPct) / 100);
  const remainingObligations = contributionCents * Math.max(0, members - turn);
  return Math.min(wanted, remainingObligations);
}

export function lateFeeCents(contributionCents: number, lateFeePct: number): number {
  return Math.round((contributionCents * lateFeePct) / 100);
}

export interface PaymentHistory {
  onTime: number;
  late: number;
  covered: number; // had to be covered with retention
  defaulted?: number; // never paid, not covered: the group had to absorb it
}

/**
 * Risk score based only on how the person has paid inside Ayni.
 * New members start at 50 (neutral). The AI writes the human explanation.
 */
export function riskScore(h: PaymentHistory): number {
  return clamp(50 - h.onTime * 8 + h.late * 12 + h.covered * 25 + (h.defaulted ?? 0) * 40, 5, 95);
}

// ------------------------------------------------------------------ trust profile

export type ContributionState = "PENDING" | "PAID" | "COVERED" | "DEFAULTED";

export interface HistoryInput {
  accountCreatedAt: Date;
  paypalVerified: boolean;
  now: Date;
  memberships: {
    groupStatus: string;
    contributions: { status: ContributionState; paidAt: Date | null; dueAt: Date }[];
  }[];
}

/**
 * Public trust profile. Built ONLY from payment behaviour inside Ayni:
 * never age, origin, gender or any other personal data.
 */
export interface TrustProfile {
  completed: number; // pasanakus finished without defaulting
  abandoned: number; // pasanakus where they left a contribution unpaid and uncovered
  activeGroups: number;
  onTime: number;
  late: number; // every late event (paid late or covered by guarantee)
  covered: number; // times their guarantee had to pay for them
  defaulted: number;
  onTimePct: number | null; // null = no history yet
  accountAgeDays: number;
  paypalVerified: boolean;
  isNewcomer: boolean;
  riskScore: number;
  /** On-time payments in a row, counting back from the most recent settled one. */
  streak: number;
}

export function buildTrustProfile(h: HistoryInput): TrustProfile {
  let onTime = 0, latePaid = 0, covered = 0, defaulted = 0;
  let completed = 0, abandoned = 0, activeGroups = 0;
  for (const m of h.memberships) {
    if (m.contributions.some((c) => c.status === "DEFAULTED")) abandoned++;
    else if (m.groupStatus === "FINISHED") completed++;
    else if (m.groupStatus === "ACTIVE") activeGroups++;
    for (const c of m.contributions) {
      if (c.status === "PAID") c.paidAt && c.paidAt > c.dueAt ? latePaid++ : onTime++;
      else if (c.status === "COVERED") covered++;
      else if (c.status === "DEFAULTED") defaulted++;
    }
  }
  const settled = onTime + latePaid + covered + defaulted;
  const history = h.memberships
    .flatMap((m) => m.contributions)
    .filter((c) => c.status !== "PENDING")
    .sort((a, b) => b.dueAt.getTime() - a.dueAt.getTime());
  let streak = 0;
  for (const c of history) {
    if (c.status === "PAID" && !(c.paidAt && c.paidAt > c.dueAt)) streak++;
    else break;
  }
  return {
    streak,
    completed,
    abandoned,
    activeGroups,
    onTime,
    late: latePaid + covered,
    covered,
    defaulted,
    onTimePct: settled ? Math.round((onTime * 100) / settled) : null,
    accountAgeDays: Math.max(0, Math.floor((h.now.getTime() - h.accountCreatedAt.getTime()) / 86_400_000)),
    paypalVerified: h.paypalVerified,
    isNewcomer: completed === 0 && settled === 0,
    riskScore: riskScore({ onTime, late: latePaid, covered, defaulted }),
  };
}

// ------------------------------------------------------------------ admission

export interface AdmissionRules {
  minCompleted: number;
  minOnTimePct: number;
  maxLate: number | null; // null = no limit
  acceptNewcomers: boolean;
}

export type AdmissionFailure =
  | "not_verified"
  | "has_abandoned"
  | "newcomers_not_accepted"
  | "min_completed"
  | "min_on_time"
  | "max_late";

export interface AdmissionCheck {
  meets: boolean;
  /** Misses exactly one soft rule by a small margin: a human (helped by the AI) should decide. */
  borderline: boolean;
  failures: AdmissionFailure[];
}

const HARD_FAILURES: AdmissionFailure[] = ["not_verified", "has_abandoned", "newcomers_not_accepted"];

export function checkAdmission(p: TrustProfile, r: AdmissionRules): AdmissionCheck {
  const failures: AdmissionFailure[] = [];
  let nearMisses = 0;
  if (!p.paypalVerified) failures.push("not_verified");
  if (p.abandoned > 0) failures.push("has_abandoned");
  if (p.isNewcomer) {
    // Newcomers skip the history rules: they join in the second half with an extra guarantee.
    if (!r.acceptNewcomers) failures.push("newcomers_not_accepted");
  } else {
    if (p.completed < r.minCompleted) {
      failures.push("min_completed");
      if (p.completed === r.minCompleted - 1) nearMisses++;
    }
    const pct = p.onTimePct ?? 0;
    if (r.minOnTimePct > 0 && pct < r.minOnTimePct) {
      failures.push("min_on_time");
      if (pct >= r.minOnTimePct - 10) nearMisses++;
    }
    if (r.maxLate != null && p.late > r.maxLate) {
      failures.push("max_late");
      if (p.late === r.maxLate + 1) nearMisses++;
    }
  }
  const hard = failures.some((f) => HARD_FAILURES.includes(f));
  return { meets: failures.length === 0, borderline: !hard && failures.length === 1 && nearMisses === 1, failures };
}

/**
 * Newcomers (no history in Ayni) never take a first-half turn when there are
 * enough experienced members to fill it. Keeps the relative order otherwise,
 * so a lottery or AI order stays as close as possible to what was decided.
 */
export function placeNewcomers(order: string[], isNewcomer: (id: string) => boolean): string[] {
  const half = Math.floor(order.length / 2);
  const firstHalf = order.filter((id) => !isNewcomer(id)).slice(0, half);
  const rest = order.filter((id) => !firstHalf.includes(id));
  return [...firstHalf, ...rest];
}

/** Extra guarantee for newcomers (never on the last turn). */
export function newcomerRetentionPct(pct: number, extraPct: number, isLastTurn: boolean): number {
  return isLastTurn ? 0 : clamp(pct + extraPct, 0, 60);
}

/**
 * How much of an overdue contribution the member's held guarantee can pay.
 * The contribution itself comes first; the late fee only from what is left.
 * Returns null when the guarantee does not even cover the contribution.
 */
export function coverageFromGuarantee(
  heldCents: number,
  amountCents: number,
  feeCents: number
): { amount: number; fee: number } | null {
  if (heldCents < amountCents) return null;
  return { amount: amountCents, fee: Math.min(feeCents, heldCents - amountCents) };
}

/** Traditional lottery, with a cryptographically fair shuffle. */
export function lotteryOrder<T>(items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function roundDueDate(
  start: Date,
  frequency: Frequency,
  roundIndex: number, // 0-based
  demo?: { minutes: number }
): Date {
  const d = new Date(start);
  if (demo) {
    d.setMinutes(d.getMinutes() + demo.minutes * (roundIndex + 1));
    return d;
  }
  const n = roundIndex + 1;
  if (frequency === "WEEKLY") d.setDate(d.getDate() + 7 * n);
  else if (frequency === "BIWEEKLY") d.setDate(d.getDate() + 14 * n);
  else d.setMonth(d.getMonth() + n);
  return d;
}

export type ReminderStage = "none" | "friendly" | "due" | "firm" | "final";

/**
 * Escalating reminders: friendly before the due date, firm after it,
 * final when the grace period is over (then retention covers the payment).
 * In demo mode the windows shrink proportionally.
 */
export function reminderStage(now: Date, dueAt: Date, graceMs: number, leadMs: number): ReminderStage {
  const t = now.getTime();
  const due = dueAt.getTime();
  if (t < due - leadMs) return "none";
  if (t < due) return "friendly";
  if (t < due + graceMs / 2) return "due";
  if (t < due + graceMs) return "firm";
  return "final";
}

export const STAGE_ORDER: ReminderStage[] = ["none", "friendly", "due", "firm", "final"];

/**
 * Money in AI-written text is always put by the code, never by the model.
 * The model writes {amount} (and optionally {fee}); any digit it writes itself
 * means it may have invented a number, so the text is discarded (null).
 */
export function fillAmounts(text: string, values: { amount: string; fee: string | null }): string | null {
  if (/\d/.test(text)) return null;
  if (!text.includes("{amount}")) return null;
  if (text.includes("{fee}") && !values.fee) return null;
  const unknown = text.match(/\{(\w+)\}/g)?.filter((t) => t !== "{amount}" && t !== "{fee}");
  if (unknown?.length) return null;
  return text.replaceAll("{amount}", `$${values.amount}`).replaceAll("{fee}", values.fee ? `$${values.fee}` : "");
}

export function generateInviteCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I confusion
  let code = "";
  for (let i = 0; i < 6; i++) code += alphabet[randomInt(alphabet.length)];
  return code;
}

export function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

export function formatUSD(cents: number): string {
  return (cents / 100).toFixed(2);
}
