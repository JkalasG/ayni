/**
 * Which color means what on the three timelines. One table, used by the bars (Bryntum, web) and by the legends
 * (React Native), so the legend can never disagree with the chart. Hues come from the active sky (night or dawn).
 */
import type { CellState } from "@/lib/calendar";
import type { Palette } from "@/lib/theme";

export type SchedHue = "verde" | "turquesa" | "naranja" | "rojo" | "amarillo" | "fucsia" | "muted";

export const hueOf = (c: Palette, h: SchedHue): { fill: string; text: string } => (h === "muted" ? { fill: c.muted, text: c.muted } : c[h]);

/** Payment calendar: one contribution to one round. */
export const CELL_HUE: Record<CellState, SchedHue> = { paid: "verde", covered: "turquesa", pending: "naranja", late: "rojo", upcoming: "muted", closed: "fucsia" };

/** Turn timeline: the state of the round in which someone receives the pot. */
export const ROUND_HUE = { UPCOMING: "muted", COLLECTING: "naranja", READY: "amarillo", PAID_OUT: "verde" } as const satisfies Record<string, SchedHue>;

/** Guarantee timeline. */
export const GUARANTEE_HUE = { HELD: "turquesa", USED: "naranja", RECOVERED: "rojo", RETURNED: "verde", REFUND: "fucsia" } as const satisfies Record<string, SchedHue>;
