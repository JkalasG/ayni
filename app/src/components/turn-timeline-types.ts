export type TimelineRound = {
  number: number;
  status: "UPCOMING" | "COLLECTING" | "READY" | "PAID_OUT";
  dueAt: string;
  /** Membership id of whoever receives the pot this round. */
  recipientId: string;
  /** Contributions already settled and how many there are, for the progress inside the bar. */
  paid?: number;
  total?: number;
};
export type TimelineMember = { id: string; userId?: string; name: string; turn: number | null };

export type TimelineProps = {
  rounds: TimelineRound[];
  members: TimelineMember[];
  startsAt: string | null;
  myMembershipId: string;
  /** Only the organizer can move turns, and only rounds that have not started. */
  canEdit: boolean;
  dark: boolean;
  locale: string;
  labels: {
    member: string;
    round: string;
    turnWord: string;
    /** "Ronda 3 de 5" */
    roundOf: (n: number, total: number) => string;
    toolbar: { now: string; search: string; mine: string };
    due: string;
    mine: string;
    status: Record<TimelineRound["status"], string>;
    /** The same states in one or two words, for the text inside a bar. */
    shortStatus: Record<TimelineRound["status"], string>;
    confirm: (a: string, b: string) => string;
    cannotSwap: string;
  };
  /** Ask the server to swap the turns of two members. Throws if it cannot be done. */
  onSwap: (aMembershipId: string, bMembershipId: string) => Promise<void>;
};
