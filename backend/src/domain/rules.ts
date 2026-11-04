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
}

/**
 * Risk score based only on how the person has paid inside Ayni.
 * New members start at 50 (neutral). The AI writes the human explanation.
 */
export function riskScore(h: PaymentHistory): number {
  return clamp(50 - h.onTime * 8 + h.late * 12 + h.covered * 25, 5, 95);
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
