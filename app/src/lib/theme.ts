/**
 * "Tejido": Ayni's visual system. The aguayo (Andean woven cloth) as a structure:
 * indigo dye for ink, magenta for action, and a strict set of state colors that
 * always mean the same thing and are always paired with text.
 */
let active: Palette | null = null;
const cur = (): Palette => active ?? dawn;
/** Called by SchemeProvider before rendering, so `colors` always reflects the current sky. */
export function setActivePalette(p: Palette) {
  active = p;
}

/**
 * Older token names, read live from the active palette (night or dawn).
 * New code uses `useScheme().c` directly.
 */
const legacy = {
  ink: (p: Palette) => p.ink,
  inkSoft: (p: Palette) => p.muted,
  muted: (p: Palette) => p.muted,
  paper: (p: Palette) => p.bg,
  surface: (p: Palette) => p.surface,
  lilac: (p: Palette) => p.surfaceAlt,
  line: (p: Palette) => p.line,
  magenta: (p: Palette) => p.fucsia.fill,
  magentaInk: (p: Palette) => p.onAction,
  paid: (p: Palette) => p.verde.text,
  pending: (p: Palette) => p.naranja.text,
  covered: (p: Palette) => p.turquesa.text,
  closed: (p: Palette) => p.muted,
  danger: (p: Palette) => p.rojo.text,
  paypal: (p: Palette) => p.paypal,
  paypalInk: (p: Palette) => p.paypalInk,
  bg: (p: Palette) => p.bg,
  surfaceAlt: (p: Palette) => p.surfaceAlt,
  primary: (p: Palette) => p.fucsia.fill,
  primaryInk: (p: Palette) => p.onAction,
  corn: (p: Palette) => p.amarillo.text,
  leaf: (p: Palette) => p.verde.text,
  sky: (p: Palette) => p.turquesa.text,
};
export const colors = {} as { readonly [K in keyof typeof legacy]: string };
for (const k of Object.keys(legacy) as (keyof typeof legacy)[]) {
  Object.defineProperty(colors, k, { get: () => legacy[k](cur()), enumerable: true });
}

/** Thread colors of the woven band (decorative). */
export const threads: readonly string[] = new Proxy([] as string[], {
  get: (_t, prop) => (cur().threads as any)[prop],
});

export const fonts = {
  display: "Unbounded_700Bold",
  displayHeavy: "Unbounded_800ExtraBold",
  displayMedium: "Unbounded_500Medium",
  body: "Figtree_400Regular",
  bodyBold: "Figtree_700Bold",
};

/** Different radii for different jobs: hierarchy, not one value everywhere. */
export const radius = { stitch: 4, sm: 8, md: 14, lg: 22, pill: 999 };
export const space = (n: number) => n * 4;

export type ContributionState = "PAID" | "PENDING" | "COVERED" | "DEFAULTED" | "CLOSED";
export const stateColor = {} as Record<ContributionState, string>;
Object.defineProperties(stateColor, {
  PAID: { get: () => cur().verde.text, enumerable: true },
  PENDING: { get: () => cur().naranja.text, enumerable: true },
  COVERED: { get: () => cur().turquesa.text, enumerable: true },
  DEFAULTED: { get: () => cur().rojo.text, enumerable: true },
  CLOSED: { get: () => cur().muted, enumerable: true },
});



/* ------------------------------------------------------------------------------------------
 * Andes: two skies over the same cloth (see app/DESIGN.md).
 * Every hue has a `fill` (graphics, >= 3:1 on bg/surface/surfaceAlt) and a `text`
 * version (>= 4.5:1 on bg/surface/surfaceAlt). Contrast verified, numbers in DESIGN.md.
 * ---------------------------------------------------------------------------------------- */
export type Scheme = "light" | "dark";
type Hue = { fill: string; text: string };
export type Palette = {
  scheme: Scheme;
  bg: string;
  surface: string;
  surfaceAlt: string;
  ink: string;
  muted: string;
  line: string;
  fucsia: Hue; // main action, celebration
  rojo: Hue; // late, rejected
  naranja: Hue; // pending
  amarillo: Hue; // the pot, achievements
  verde: Hue; // paid, success
  turquesa: Hue; // information, guarantee coverage
  onAction: string; // text on a fucsia button
  paypal: string;
  paypalInk: string;
  /** Sky bands from the zenith down to the horizon. */
  sky: string[];
  mountains: { far: string; near: string; snow: string };
  ground: string;
  /** Decorative threads of the aguayo (never behind text). */
  threads: string[];
};

export const night: Palette = {
  scheme: "dark",
  bg: "#0B0E27",
  surface: "#151A3D",
  surfaceAlt: "#1E2452",
  ink: "#F7F3EA",
  muted: "#A6A9C9",
  line: "#2C3370",
  fucsia: { fill: "#FF4A97", text: "#FF4A97" },
  rojo: { fill: "#FF6153", text: "#FF6153" },
  naranja: { fill: "#FF8A1F", text: "#FF8A1F" },
  amarillo: { fill: "#FFD23F", text: "#FFD23F" },
  verde: { fill: "#2FD49A", text: "#2FD49A" },
  turquesa: { fill: "#29C6E0", text: "#29C6E0" },
  onAction: "#0B0E27",
  paypal: "#FFC439",
  paypalInk: "#111111",
  sky: ["#05071A", "#080B22", "#0B0E27", "#0F1330", "#13183B", "#181E47", "#1E2552"],
  mountains: { far: "#232A5C", near: "#151A3D", snow: "#C9CCE6" },
  ground: "#0B0E27",
  threads: ["#FF2E88", "#FF8A1F", "#FFD23F", "#2FD49A", "#29C6E0", "#F7F3EA"],
};

export const dawn: Palette = {
  scheme: "light",
  bg: "#FFF6EC",
  surface: "#FFFFFF",
  surfaceAlt: "#FBE9D7",
  ink: "#1A1A3A",
  muted: "#6B6585",
  line: "#EBD6BF",
  fucsia: { fill: "#D4106B", text: "#C20A60" },
  rojo: { fill: "#D2301F", text: "#BF2416" },
  naranja: { fill: "#D46400", text: "#A84E00" },
  amarillo: { fill: "#B07F00", text: "#8A6400" },
  verde: { fill: "#0E9A64", text: "#0A7A4F" },
  turquesa: { fill: "#0A8BA8", text: "#06708A" },
  onAction: "#FFFFFF",
  paypal: "#FFC439",
  paypalInk: "#111111",
  sky: ["#CFE3EE", "#DDE9EC", "#EEEDE4", "#FFF1DE", "#FFE3C7", "#FFD2AE", "#FFBE94"],
  mountains: { far: "#8C8FB8", near: "#4D4C7D", snow: "#FFFFFF" },
  ground: "#FFF6EC",
  threads: ["#D4106B", "#E06A00", "#F2B705", "#0E9A64", "#0A8BA8", "#1A1A3A"],
};

/** Tabular figures so amounts line up in columns. */
export const tabular = { fontVariant: ["tabular-nums" as const] };
