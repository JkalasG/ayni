import type { CalData } from "@/lib/personal-calendar";

export type PersonalCalendarProps = {
  data: CalData;
  dark: boolean;
  lang: "es" | "en";
  /** The day the screen is looking at. */
  selected: Date;
  onSelect: (d: Date) => void;
  /** The card of a movement leads to its pasanaku. */
  onOpenGroup: (groupId: string) => void;
  money: (cents: number) => string;
  labels: {
    pay: string;
    receive: string;
    guarantee: string;
    estimated: string;
    net: string;
    state: Record<string, string>;
    round: string;
    held: string;
    due: string;
    open: string;
    status: string;
    members: string;
    turn: string;
    paidOn: string;
    pot: string;
    youGet: string;
    progress: string;
    freq: Record<string, string>;
    groupState: Record<string, string>;
  };
};
