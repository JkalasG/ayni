/**
 * A person's money calendar across ALL their pasanakus: what they pay and what they receive, day by day, with what is
 * already done (real dates and amounts) and what is still to come (estimated from the group's rules).
 *
 * Pure: it gets plain data and returns plain events, so every rule below is tested without a database.
 * The server decides what each person sees: only their own contributions and what they receive, never other members'.
 */
import { retentionCents } from "./rules";

export type CalContribution = { roundNumber: number; status: "PENDING" | "PAID" | "COVERED" | "DEFAULTED"; amountCents: number; lateFeeCents: number; paidAt: Date | null };
export type CalRound = { number: number; dueAt: Date; status: "UPCOMING" | "COLLECTING" | "READY" | "PAID_OUT"; recipientIsMe: boolean; retainedCents: number };
export type CalPayout = { roundNumber: number | null; kind: "POT" | "RETENTION_RELEASE" | "COMPENSATION"; status: "PENDING" | "SENT" | "SUCCEEDED" | "FAILED" | "UNKNOWN"; amountCents: number; createdAt: Date };
export type CalGroup = {
  id: string;
  name: string;
  status: "FORMING" | "ORDERING" | "ACTIVE" | "FINISHED" | "CANCELLED";
  contributionCents: number;
  members: number;
  myTurn: number | null;
  myRetentionPct: number;
  rounds: CalRound[];
  /** My contributions, one per round already opened. */
  mine: CalContribution[];
  /** What PayPal sent me from this group. */
  payouts: CalPayout[];
};

export type CalKind = "pay" | "receive" | "return";
export type CalStatus = "paid" | "covered" | "pending" | "late" | "unpaid" | "received" | "sending" | "failed" | "upcoming";
export type CalEvent = {
  id: string;
  groupId: string;
  groupName: string;
  round: number | null;
  kind: CalKind;
  status: CalStatus;
  /** The day it counts for: the real day when it already happened, the due day when it has not. */
  at: string;
  /** For something that has not happened: the day it is due. */
  dueAt: string | null;
  /** Always positive; the kind says which way the money goes. */
  amountCents: number;
  /** Receive only: how much of the pot is held back as guarantee (returned at the end). */
  heldCents?: number;
  /** True when the amount is an estimate from the rules, not a confirmed movement. */
  estimated: boolean;
};

const iso = (d: Date) => d.toISOString();

export function buildPersonalCalendar(groups: CalGroup[], now: Date): CalEvent[] {
  const out: CalEvent[] = [];
  for (const g of groups) {
    if (g.status === "CANCELLED" || g.rounds.length === 0) continue;
    const pot = g.contributionCents * g.members;
    const lastDue = g.rounds.reduce((d, r) => (r.dueAt > d ? r.dueAt : d), g.rounds[0].dueAt);
    let heldExpected = 0;

    for (const r of g.rounds) {
      const base = { groupId: g.id, groupName: g.name, round: r.number };
      // ------------------------------------------------ what I pay in this round
      const c = g.mine.find((x) => x.roundNumber === r.number);
      if (c) {
        const amountCents = c.amountCents + c.lateFeeCents;
        const status: CalStatus =
          c.status === "PAID" ? "paid" : c.status === "COVERED" ? "covered" : c.status === "DEFAULTED" ? "unpaid" : r.dueAt.getTime() < now.getTime() ? "late" : "pending";
        const done = status === "paid" || status === "covered";
        out.push({ id: `pay:${g.id}:${r.number}`, ...base, kind: "pay", status, at: iso(done && c.paidAt ? c.paidAt : r.dueAt), dueAt: done ? null : iso(r.dueAt), amountCents, estimated: false });
      } else {
        // a round not opened yet: I will owe one contribution (the recipient also contributes: the pot is everyone's)
        out.push({ id: `pay:${g.id}:${r.number}`, ...base, kind: "pay", status: "upcoming", at: iso(r.dueAt), dueAt: iso(r.dueAt), amountCents: g.contributionCents, estimated: true });
      }

      // ------------------------------------------------ what I receive in this round
      if (!r.recipientIsMe) continue;
      const pots = g.payouts.filter((p) => p.roundNumber === r.number && p.kind === "POT" && p.status !== "FAILED");
      if (r.status === "PAID_OUT" && pots.length > 0) {
        const sent = pots.reduce((s, p) => s + p.amountCents, 0);
        const done = pots.every((p) => p.status === "SUCCEEDED");
        out.push({ id: `receive:${g.id}:${r.number}`, ...base, kind: "receive", status: done ? "received" : "sending", at: iso(pots[0].createdAt), dueAt: null, amountCents: sent, heldCents: r.retainedCents, estimated: false });
        heldExpected += r.retainedCents;
      } else if (r.status === "PAID_OUT" && g.payouts.some((p) => p.roundNumber === r.number && p.kind === "POT" && p.status === "FAILED")) {
        const f = g.payouts.find((p) => p.roundNumber === r.number && p.kind === "POT" && p.status === "FAILED")!;
        out.push({ id: `receive:${g.id}:${r.number}`, ...base, kind: "receive", status: "failed", at: iso(f.createdAt), dueAt: iso(r.dueAt), amountCents: f.amountCents, heldCents: r.retainedCents, estimated: false });
      } else {
        // not sent yet: the pot minus what the rules hold back as guarantee
        const held = g.myTurn ? retentionCents(pot, g.myRetentionPct, g.contributionCents, g.myTurn, g.members) : 0;
        out.push({ id: `receive:${g.id}:${r.number}`, ...base, kind: "receive", status: "upcoming", at: iso(r.dueAt), dueAt: iso(r.dueAt), amountCents: pot - held, heldCents: held, estimated: true });
        heldExpected += held;
      }
    }

    // ------------------------------------------------ the guarantee coming back
    for (const p of g.payouts) {
      if (p.kind === "RETENTION_RELEASE" && p.status !== "FAILED")
        out.push({ id: `return:${g.id}:${p.createdAt.getTime()}`, groupId: g.id, groupName: g.name, round: null, kind: "return", status: p.status === "SUCCEEDED" ? "received" : "sending", at: iso(p.createdAt), dueAt: null, amountCents: p.amountCents, estimated: false });
      else if (p.kind === "COMPENSATION" && p.status !== "FAILED")
        out.push({ id: `receive:${g.id}:comp:${p.createdAt.getTime()}`, groupId: g.id, groupName: g.name, round: p.roundNumber, kind: "receive", status: p.status === "SUCCEEDED" ? "received" : "sending", at: iso(p.createdAt), dueAt: null, amountCents: p.amountCents, estimated: false });
    }
    const alreadyReturned = g.payouts.some((p) => p.kind === "RETENTION_RELEASE" && p.status !== "FAILED");
    if (!alreadyReturned && heldExpected > 0 && g.status !== "FINISHED") {
      // the guarantee goes back once the last contribution is in: the day the last round is due
      out.push({ id: `return:${g.id}:end`, groupId: g.id, groupName: g.name, round: null, kind: "return", status: "upcoming", at: iso(lastDue), dueAt: iso(lastDue), amountCents: heldExpected, estimated: true });
    }
  }
  return out.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : a.id < b.id ? -1 : 1));
}
