/**
 * The person's money calendar, as the app reads it: the events the server sends (see backend domain/personal-calendar)
 * grouped by LOCAL day, with what goes out and what comes in each day, and the balance up to any date.
 * Shared by the web chart (Bryntum Calendar) and the native list.
 */
export type CalKind = "pay" | "receive" | "return";
export type CalStatus = "paid" | "covered" | "pending" | "late" | "unpaid" | "received" | "sending" | "failed" | "upcoming";
export type CalEvent = {
  id: string;
  groupId: string;
  groupName: string;
  round: number | null;
  kind: CalKind;
  status: CalStatus;
  at: string;
  dueAt: string | null;
  amountCents: number;
  heldCents?: number;
  estimated: boolean;
};
export type CalGroup = { id: string; name: string; status: string; frequency: string; members: number; contributionCents: number; rounds: number; paidOutRounds: number; myTurn: number | null };
export type CalData = { now: string; groups: CalGroup[]; events: CalEvent[] };

/** yyyy-mm-dd of the person's own day (not UTC's). */
export const dayKey = (d: Date | string) => {
  const x = typeof d === "string" ? new Date(d) : d;
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
};
/** The local midnight of a yyyy-mm-dd key. */
export const fromKey = (k: string) => {
  const [y, m, d] = k.split("-").map(Number);
  return new Date(y, m - 1, d);
};

/** Money going out is negative, money coming in positive. A failed or unpaid movement moves nothing. */
export const signed = (e: CalEvent) => (e.status === "failed" || e.status === "unpaid" ? 0 : e.kind === "pay" ? -e.amountCents : e.amountCents);
/** Already happened (money really moved), as opposed to still to come. */
export const isDone = (e: CalEvent) => e.status === "paid" || e.status === "covered" || e.status === "received";

export type DayTotals = { outCents: number; inCents: number; netCents: number; events: CalEvent[] };

export function byDay(events: CalEvent[]): Map<string, DayTotals> {
  const map = new Map<string, DayTotals>();
  for (const e of events) {
    const k = dayKey(e.at);
    const t = map.get(k) ?? { outCents: 0, inCents: 0, netCents: 0, events: [] };
    const s = signed(e);
    if (s < 0) t.outCents += -s;
    else t.inCents += s;
    t.netCents += s;
    t.events.push(e);
    map.set(k, t);
  }
  return map;
}

/**
 * Where the person stands on a date. `done` is what already moved up to then (real history); `ahead` is what is still to
 * come between today and that date (pending contributions, pots and guarantees not yet sent): the money they will put in
 * and take out until then, and the net of both.
 */
export function standing(events: CalEvent[], now: Date, date: Date) {
  const today = dayKey(now);
  const upto = dayKey(date);
  let paid = 0, received = 0, owe = 0, will = 0;
  for (const e of events) {
    const k = dayKey(e.at);
    const s = signed(e);
    if (isDone(e)) {
      if (k <= upto) (s < 0 ? (paid += -s) : (received += s));
    } else if (upto >= today) {
      // what has not happened counts from today at the earliest: a late contribution is owed now, and a pot whose
      // day passed without being sent will arrive as soon as it is
      const eff = k < today ? today : k;
      if (eff <= upto) (s < 0 ? (owe += -s) : (will += s));
    }
  }
  return { paid, received, owe, will, aheadNet: will - owe, doneNet: received - paid };
}

/** The next days with something to pay or receive, for the list (native) and the summary cards. */
export function upcoming(events: CalEvent[], now: Date, days: number) {
  const from = dayKey(now);
  const to = dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() + days));
  // not done yet and not later than the window; what is overdue is treated as due today
  const pending = events.filter((e) => !isDone(e) && dayKey(e.at) <= to).map((e) => (dayKey(e.at) < from ? { ...e, at: now.toISOString() } : e));
  return [...byDay(pending).entries()].sort(([a], [b]) => (a < b ? -1 : 1));
}
