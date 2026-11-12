import type { CalData } from "@/lib/personal-calendar";

export type PersonalCalendarProps = {
  data: CalData;
  dark: boolean;
  lang: "es" | "en";
  /** The day the screen is looking at. */
  selected: Date;
  onSelect: (d: Date) => void;
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
  };
};
