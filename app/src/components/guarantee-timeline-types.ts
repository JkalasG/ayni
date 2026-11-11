export type GuaranteeKind = "HELD" | "USED" | "RECOVERED" | "RETURNED" | "REFUND";
export type GuaranteeItem = {
  id: string;
  membershipId: string;
  kind: GuaranteeKind;
  at: string;
  /** HELD only: when it was returned. Null = still held. */
  until: string | null;
  amountCents: number;
  status: "DONE" | "IN_PROGRESS" | "FAILED";
  round: number | null;
  mine: boolean;
};
export type GuaranteeMember = { id: string; name: string; turn: number | null; heldCents: number };

export type GuaranteeProps = {
  items: GuaranteeItem[];
  members: GuaranteeMember[];
  startsAt: string | null;
  endsAt: string | null;
  myMembershipId: string;
  dark: boolean;
  locale: string;
  now: number;
  money: (cents: number) => string;
  labels: {
    member: string;
    round: string;
    mine: string;
    until: string;
    stillHeld: string;
    back: string;
    failed: string;
    kind: Record<GuaranteeKind, string>;
  };
};
