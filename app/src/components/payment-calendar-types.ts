import type { CellState, CellStatus } from "@/lib/calendar";

export type CalendarCell = { membershipId: string; status: CellStatus; amountCents: number; lateFeeCents: number; paidAt: string | null };
export type CalendarRound = { number: number; status: string; dueAt: string; recipientId: string; contributions: CalendarCell[] };
export type CalendarMember = { id: string; name: string; turn: number | null };

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
    due: string;
    mine: string;
    receives: string;
    lateFee: string;
    paidOn: string;
    state: Record<CellState, string>;
  };
};
