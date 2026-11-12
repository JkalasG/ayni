import type { CellState, CellStatus } from "@/lib/calendar";

export type CalendarCell = { membershipId: string; status: CellStatus; amountCents: number; lateFeeCents: number; paidAt?: string | null };
export type CalendarRound = { number: number; status: string; dueAt: string; recipientId: string; contributions: CalendarCell[] };
export type CalendarMember = { id: string; /** The person (not the membership): the woven avatar is drawn from it, as everywhere in the app. */ userId?: string; name: string; turn: number | null };

export type CalendarProps = {
  rounds: CalendarRound[];
  members: CalendarMember[];
  startsAt: string | null;
  myMembershipId: string;
  isOrganizer: boolean;
  dark: boolean;
  locale: string;
  now: number;
  money: (cents: number) => string;
  labels: {
    member: string;
    round: string;
    /** "Turno" and "Recaudado": the turn line under each name and the label of the summary row. */
    turnWord: string;
    summary: string;
    /** The first row: "Pozo" and under it "Quién cobra". */
    pot: string;
    potSub: string;
    /** "Ronda 3 de 5" */
    roundOf: (n: number, total: number) => string;
    toolbar: { now: string; search: string; mine: string };
    due: string;
    mine: string;
    receives: string;
    lateFee: string;
    paidOn: string;
    state: Record<CellState, string>;
    /** The same states in one or two words, for the text inside a bar. */
    short: Record<CellState, string>;
  };
};
