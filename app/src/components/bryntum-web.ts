/**
 * Shared by the three Bryntum screens (turn timeline, payment calendar, guarantee timeline). Web only: Bryntum draws
 * on the browser's DOM, so only the .web.tsx components import this file.
 *
 * Bryntum brings its own look (gray, blue, English dates). Here it is dressed as Ayni:
 *  - the palette of the active sky, stepped corners, the app's fonts;
 *  - the time axis is the pasanaku itself: one column per ROUND ("Ronda 3 · vence 20:27"), not clock ticks;
 *  - every bar ends in a strip of woven cloth that depends on its state (twill = woven, loose threads = still to
 *    weave, hatch = late...), the same visual language as the weave on the group screen;
 *  - rows carry the member's woven avatar; the toolbar, summary row, round shading and scroll buttons are
 *    Bryntum features set up for this domain.
 */
import { dawn, night, type Palette } from "@/lib/theme";
import { hueOf, type SchedHue } from "@/lib/sched-colors";
import { wovenSvg } from "@/lib/woven-svg";

export { wovenSvg };

const ASSETS = "/bryntum";

export function loadCss(id: string, href: string): Promise<void> {
  return new Promise((resolve) => {
    let link = document.getElementById(id) as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement("link");
      link.id = id;
      link.rel = "stylesheet";
      document.head.appendChild(link);
    }
    if (link.getAttribute("href") === href) return resolve();
    link.onload = () => resolve();
    link.onerror = () => resolve(); // a missing stylesheet must not leave the screen empty forever
    link.setAttribute("href", href);
  });
}

/** Escape text that goes into HTML (Bryntum tooltips, headers and cells take HTML). */
export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

// ------------------------------------------------------------------------------------------------------ theme

const HUES: SchedHue[] = ["verde", "turquesa", "naranja", "rojo", "amarillo", "fucsia", "muted"];
export const TEXTURES = ["twill", "threads", "hatch", "dots", "hair"] as const;
export type Texture = (typeof TEXTURES)[number];
export const SHADES = [100, 99, 98, 97, 96, 95, 94, 93, 92, 91, 90, 85, 80, 75, 70, 65, 60, 55, 50, 45, 40, 35, 30, 25, 20, 15, 10, 5, 2, 1, 0];
/** A 2 px step at each corner, like the edge of the cloth (the same shape as SteppedBox, small enough for a bar). */
export const STEPPED =
  "polygon(4px 0,calc(100% - 4px) 0,calc(100% - 4px) 2px,calc(100% - 2px) 2px,calc(100% - 2px) 4px,100% 4px,100% calc(100% - 4px),calc(100% - 2px) calc(100% - 4px),calc(100% - 2px) calc(100% - 2px),calc(100% - 4px) calc(100% - 2px),calc(100% - 4px) 100%,4px 100%,4px calc(100% - 2px),2px calc(100% - 2px),2px calc(100% - 4px),0 calc(100% - 4px),0 4px,2px 4px,2px 2px,4px 2px)";
const STEPPED_BIG =
  "polygon(8px 0,calc(100% - 8px) 0,calc(100% - 8px) 4px,calc(100% - 4px) 4px,calc(100% - 4px) 8px,100% 8px,100% calc(100% - 8px),calc(100% - 4px) calc(100% - 8px),calc(100% - 4px) calc(100% - 4px),calc(100% - 8px) calc(100% - 4px),calc(100% - 8px) 100%,8px 100%,8px calc(100% - 4px),4px calc(100% - 4px),4px calc(100% - 8px),0 calc(100% - 8px),0 8px,4px 8px,4px 4px,8px 4px)";

export const svgUrl = (w: number, h: number, body: string) => `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}'>${body}</svg>`)}")`;

/** The woven strip along the bottom edge of a bar. Drawn on the same 3 px stitch grid as the rest of the app. */
function strip(t: Texture, col: string): string {
  switch (t) {
    case "twill": {
      let b = "";
      for (let y = 0; y < 2; y++) for (let x = 0; x < 3; x++) b += `<rect x='${x * 3 + 0.4}' y='${y * 3 + 0.4}' width='2.2' height='2.2' fill='${col}' opacity='${(x + y) % 3 === 0 ? 0.45 : 1}'/>`;
      return svgUrl(9, 6, b);
    }
    case "threads":
      return svgUrl(6, 6, `<rect width='6' height='2' fill='${col}'/><rect x='1' y='2' width='1.4' height='4' fill='${col}'/><rect x='4' y='2' width='1.4' height='2.5' fill='${col}'/>`);
    case "hatch":
      return svgUrl(8, 6, `<path d='M0 6L6 0H8L2 6Z' fill='${col}'/><path d='M6 6L8 4V6Z' fill='${col}'/><path d='M0 0H2L0 2Z' fill='${col}'/>`);
    case "dots":
      return svgUrl(6, 6, `<rect x='2' y='2' width='2' height='2' fill='${col}'/>`);
    default:
      return svgUrl(8, 6, `<rect x='3.5' width='1' height='6' fill='${col}' opacity='.7'/>`);
  }
}

/**
 * The whole bar as cloth: the state color is the warp and a weave in darker and lighter stitches covers it, on the same
 * 4 px stitch grid as the avatars. The text sits on a small plate so it stays readable over any weave.
 */
export function field(t: Texture, ink: string): string {
  const d = (x: number, y: number, o = 0.22) => `<rect x='${x}' y='${y}' width='4' height='4' fill='${ink}' opacity='${o}'/>`;
  const l = (x: number, y: number, o = 0.3) => `<rect x='${x}' y='${y}' width='4' height='4' fill='#fff' opacity='${o}'/>`;
  switch (t) {
    case "twill": {
      // diagonal twill: each row steps one stitch
      let b = "";
      for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) b += (x + y) % 3 === 0 ? d(x * 4, y * 4, 0.28) : (x + y) % 3 === 1 ? l(x * 4, y * 4, 0.22) : "";
      return svgUrl(12, 12, b);
    }
    case "threads": // loose warp threads: vertical runs with gaps, the cloth not yet woven
      return svgUrl(8, 12, d(0, 0, 0.3) + d(0, 8, 0.3) + l(4, 4, 0.35));
    case "hatch": // bold diagonal: something is wrong here
      return svgUrl(8, 8, `<path d='M0 8L8 0H12L4 12Z' fill='${ink}' opacity='.3'/><path d='M-4 8L0 4V8Z' fill='${ink}' opacity='.3'/>`);
    case "dots":
      return svgUrl(8, 8, d(0, 0, 0.18) + d(4, 4, 0.18));
    default: // still to come: pale, barely started
      return svgUrl(8, 8, l(0, 0, 0.3) + l(4, 4, 0.3));
  }
}

/** Bryntum's whole theme hangs on a scale of neutral shades (100 = page, 0 = text) and a few named variables. */
export function themeCss(c: Palette): string {
  const tint = c.scheme === "dark" ? 30 : 22;
  const gold = c.amarillo.fill;
  const shades = SHADES.map((n) => `--b-neutral-${n}: color-mix(in srgb, ${c.surface} ${n}%, ${c.ink});`).join("\n  ");
  const hues = HUES.map((h) => {
    const { fill, text } = hueOf(c, h);
    const textures = TEXTURES.map(
      (t) => `.ayni-sched .b-sch-event.ay-${h}.ay-t-${t}:not(.b-milestone) { background-image: ${strip(t, fill)} !important; background-repeat: repeat-x !important; background-position: 0 100% !important; background-size: auto 6px !important; }`
    ).join("\n");
    return `
.ayni-sched .b-sch-event.ay-${h}:not(.b-milestone) {
  background-color: color-mix(in srgb, ${fill} ${tint}%, ${c.surface}) !important;
  color: ${text} !important;
  border: 0 !important;
  box-shadow: none;
  clip-path: ${STEPPED};
}
${textures}
${TEXTURES.map((t) => `.ayni-sched .b-sch-event.ay-${h}.ay-card.ay-t-${t}.ay-card:not(.b-milestone) { background-color: ${fill} !important; background-image: ${field(t, c.ink)} !important; background-size: auto !important; background-repeat: repeat !important; background-position: 0 0 !important; box-shadow: none !important; }`).join(" ")}
.ayni-sched .b-sch-event.ay-${h} .ay-txt .ay-l { color: ${text}; }
.ayni-sched .b-sch-event.ay-${h}.ay-dashed:not(.b-milestone) { background-image: repeating-linear-gradient(135deg, color-mix(in srgb, ${fill} 14%, ${c.surface}) 0 6px, ${c.surface} 6px 12px) !important; background-size: auto !important; background-repeat: repeat !important; }
.ayni-sched .b-sch-event.ay-${h}.b-milestone { --b-primary: ${fill}; color: ${text} !important; }
/* a day-long event (guarantee used, returned...) is a diamond of the state color: the rhombus of the weave */
.ayni-sched .b-sch-event.ay-${h}.b-milestone { position: absolute; }
.ayni-sched .b-sch-event.ay-${h}.b-milestone::after { content: ""; position: absolute; left: 50%; top: 50%; width: 14px; height: 14px; transform: translate(-50%, -50%) rotate(45deg); background: ${fill}; box-shadow: 0 0 0 3px ${c.surface}; }
.ayni-chip.ay-${h} { background: color-mix(in srgb, ${fill} ${tint}%, ${c.surface}); color: ${text}; }`;
  }).join("\n");

  return `
:root:root:root {
  ${shades}
  --b-primary: ${c.fucsia.fill};
  --b-widget-color: ${c.ink};
  --b-widget-border-color: ${c.line};
  --b-grid-header-background: ${c.surfaceAlt};
  --b-grid-header-color: ${c.ink};
  --b-grid-header-font-weight: 700;
  --b-grid-cell-color: ${c.ink};
  --b-grid-cell-border-color: ${c.line};
  --b-grid-cell-hover-background: ${c.surfaceAlt};
  --b-grid-cell-selected-background: ${c.surfaceAlt};
  --b-grid-cell-hover-selected-background: ${c.surfaceAlt};
  --b-widget-border-radius: 0;
}
.ayni-sched, .ayni-sched .b-grid, .ayni-sched .b-grid-body-container, .ayni-sched .b-timeline-subgrid { background: ${c.surface}; font-family: Figtree_400Regular, system-ui, sans-serif; }
.ayni-sched { border: 2px solid ${c.line}; clip-path: ${STEPPED_BIG}; --b-sch-event-padding-inline: 0; }

/* toolbar */
.ayni-sched .b-toolbar { background: ${c.surfaceAlt}; border-bottom: 2px solid ${c.line}; padding: 6px 10px; gap: 8px; }
.ayni-sched .b-toolbar .b-button { font-family: Figtree_700Bold, system-ui, sans-serif; font-weight: 700; font-size: 14px; min-height: 36px; border-radius: 0; }
.ayni-sched .b-toolbar .b-button:not(.b-pressed) { background: ${c.surface}; color: ${c.ink}; }
.ayni-sched .b-toolbar .b-button.b-pressed { background: ${c.fucsia.fill}; color: ${c.onAction}; }
.ayni-sched .b-toolbar .b-field { font-size: 14px; }
.ayni-sched .b-toolbar .b-field .b-field-inner { background: ${c.surface}; border-radius: 0; }

/* time axis: round headers */
.ayni-sched .b-grid-header { font-family: Figtree_700Bold, system-ui, sans-serif; }
.ayni-sched .b-sch-header-timeaxis-cell { color: ${c.ink}; font-size: 13.5px; }
.ayni-sched .b-sch-header-row-0 .b-sch-header-timeaxis-cell { font-weight: 700; text-transform: capitalize; }
.ayni-sched .b-sch-header-row-1 .b-sch-header-timeaxis-cell { font-weight: 700; }
.ayni-sched .b-sch-header-row-1 .b-sch-header-timeaxis-cell b { font-family: Figtree_700Bold, system-ui, sans-serif; }
.ayni-sched .b-sch-header-row-1 .b-sch-header-timeaxis-cell span { color: ${c.muted}; font-weight: 400; }

/* members: woven avatar, name, turn */
.ayni-sched .b-grid-cell.ay-member-cell { padding-inline: 12px; }
.ayni-sched .ay-member { display: flex; align-items: center; gap: 10px; min-width: 0; }
.ayni-sched .ay-av { flex: none; width: 34px; height: 34px; line-height: 0; }
.ayni-sched .ay-potico { display: grid; place-items: center; background: ${c.amarillo.fill}; color: #1A1A3A; font-size: 15px; clip-path: ${STEPPED}; }
.ayni-sched .ay-me .ay-av { outline: 2px solid ${c.fucsia.fill}; outline-offset: 2px; }
.ayni-sched .ay-mname { display: flex; flex-direction: column; min-width: 0; line-height: 1.2; }
.ayni-sched .ay-mname b { font-family: Figtree_700Bold, system-ui, sans-serif; font-size: 15px; font-weight: 700; color: ${c.ink}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ayni-sched .ay-mname small { font-size: 13px; color: ${c.muted}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ayni-sched .ay-me .ay-mname small { color: ${c.fucsia.text}; font-weight: 700; }

/* labels beside the diamonds: clear of the diamond itself */
.ayni-sched .b-sch-label-after { font-family: Figtree_700Bold, system-ui, sans-serif; font-size: 13px; color: ${c.ink}; }

/* status line */
.ayni-sched .ay-status { font-size: 13.5px; color: ${c.muted}; padding-inline: 4px; }
.ayni-sched .ay-status b { color: ${c.ink}; font-family: Figtree_700Bold, system-ui, sans-serif; }
.ayni-sched .ay-sum-label { font-family: Figtree_700Bold, system-ui, sans-serif; font-size: 14px; font-weight: 700; padding-inline: 12px; }

/* progress column */
.ayni-sched .ay-prog { display: flex; align-items: center; gap: 8px; }
.ayni-sched .ay-prog-bar { position: relative; width: 56px; height: 8px; background: ${c.line}; flex: none; }
.ayni-sched .ay-prog-bar i { position: absolute; inset: 0 auto 0 0; background: ${c.verde.fill}; }
.ayni-sched .ay-prog b { font-family: Figtree_700Bold, system-ui, sans-serif; font-size: 14px; font-weight: 700; font-variant-numeric: tabular-nums; }

/* bars */
.ayni-sched .b-sch-event { font-family: Figtree_700Bold, system-ui, sans-serif; font-size: 13px; font-weight: 700; container-type: inline-size; }
.ayni-sched .b-sch-event .b-sch-event-content { padding: 0; overflow: hidden; }
.ayni-sched .ay-cell { display: flex; align-items: center; gap: 7px; height: 100%; padding: 0 9px 6px 9px; white-space: nowrap; overflow: hidden; }
.ayni-sched .ay-cell .ay-ic { flex: none; font-size: 12px; }
.ayni-sched .ay-cell .ay-amt { font-variant-numeric: tabular-nums; }
.ayni-sched .ay-cell .ay-word { overflow: hidden; text-overflow: ellipsis; font-weight: 400; opacity: .95; }
.ayni-sched .ay-cell .ay-star { margin-left: auto; flex: none; font-size: 12px; color: ${gold}; }
@container (max-width: 150px) { .ayni-sched .ay-cell .ay-word { display: none; } }
@container (max-width: 198px) { .ayni-sched .ay-cell.ay-turn .ay-word { display: none; } }
/* the payment cards: cloth with a plate for the text */
.ayni-sched .b-sch-event.ay-card:not(.b-milestone) { border-radius: 0; }
.ayni-sched .ay-card .ay-cell { padding: 0 7px; gap: 6px; }
.ayni-sched .ay-card .ay-txt { display: flex; flex-direction: column; justify-content: center; gap: 1px; min-width: 0; line-height: 1.15; padding: 4px 10px 5px; background: ${c.surface}; clip-path: ${STEPPED}; }
.ayni-sched .ay-card .ay-l { display: flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 700; letter-spacing: .03em; text-transform: uppercase; }
.ayni-sched .ay-card .ay-word { font-weight: 700; }
.ayni-sched .ay-card .ay-amt { font-size: 16px; font-weight: 800; color: ${c.ink}; }
.ayni-sched .ay-card .ay-star { margin-left: auto; font-size: 13px; padding: 5px; background: ${c.surface}; color: ${c.amarillo.text}; clip-path: ${STEPPED}; }
.ayni-sched .ay-cell .ay-count { margin-left: auto; flex: none; font-size: 12.5px; font-variant-numeric: tabular-nums; }
@container (max-width: 76px) { .ayni-sched .ay-cell .ay-ic { display: none; } }
.ayni-sched .b-sch-event.ay-recipient:not(.b-milestone) { box-shadow: inset 0 0 0 2px ${gold}; }
.ayni-sched .b-sch-event.ay-drag:not(.b-sch-event-readonly) { cursor: grab; }
.ayni-sched .b-sch-event:hover:not(.b-milestone) { filter: brightness(1.08); }

/* the round in progress, and "now" */
.ayni-sched .ay-current-round { background: color-mix(in srgb, ${c.fucsia.fill} 8%, transparent); border-inline: 1px dashed color-mix(in srgb, ${c.fucsia.fill} 55%, transparent); }
.ayni-sched .b-sch-current-time { --b-primary: ${c.fucsia.fill}; --b-secondary: ${c.fucsia.fill}; border-color: ${c.fucsia.fill}; }
.ayni-sched .b-sch-current-time label, .ayni-sched .b-time-ranges-header-canvas .b-sch-current-time { display: none; }

/* pot passing from one turn to the next */
.ayni-sched .b-sch-dependency { stroke: ${c.muted}; stroke-width: 2; stroke-dasharray: 4 3; opacity: .85; }
.ayni-sched .b-sch-dependency-arrow { fill: ${c.muted}; }

/* percent bar inside a bar (turn timeline) */
.ayni-sched .b-task-percent-bar-outer { background: transparent !important; }
.ayni-sched .b-task-percent-bar { background: color-mix(in srgb, currentColor 30%, transparent) !important; }

/* summary row: collected per round */
.ayni-sched .b-grid-footer, .ayni-sched .b-sch-summary { background: ${c.surfaceAlt}; border-top: 2px solid ${c.line}; }
.ayni-sched .ay-sum { display: flex; align-items: baseline; gap: 4px; padding-inline: 8px; font-variant-numeric: tabular-nums; white-space: nowrap; }
.ayni-sched .ay-sum b { font-family: Figtree_700Bold, system-ui, sans-serif; font-size: 14px; color: ${c.ink}; }
.ayni-sched .ay-sum small { font-size: 13px; color: ${c.muted}; }
.ayni-sched .ay-sum.ay-full b { color: ${c.verde.text}; }

/* tooltip card */
.b-tooltip .ay-tip { display: grid; gap: 6px; min-width: 190px; font-family: Figtree_400Regular, system-ui, sans-serif; font-size: 14px; color: ${c.ink}; }
.b-tooltip .ay-tip-h { display: flex; align-items: center; gap: 8px; }
.b-tooltip .ay-tip-h svg { flex: none; }
.b-tooltip .ay-tip b { font-family: Figtree_700Bold, system-ui, sans-serif; }
.b-tooltip .ay-tip small { color: ${c.muted}; font-size: 13px; }
.ayni-chip { display: inline-flex; align-items: center; gap: 5px; padding: 2px 8px; font: 700 12.5px Figtree_700Bold, system-ui, sans-serif; clip-path: ${STEPPED}; }
${hues}
`;
}

/** Loads Bryntum's styles for the current color mode, dresses them as Ayni, registers the license key and returns the Scheduler class. */
let schedulerLib: Promise<any> | null = null;
/**
 * The library itself (the heavy part). Asked for early (see lib/prefetch), so by the time a chart is opened it is there.
 * The key must be registered before it loads; it is public by nature (it ships in the page).
 */
export function preloadScheduler(): Promise<any> {
  schedulerLib ??= (async () => {
    const key = process.env.EXPO_PUBLIC_BRYNTUM_LICENSE;
    if (key) ((globalThis as any).bryntum ??= {}).licenseKey = key;
    return (await import("@bryntum/scheduler-enterprise")).Scheduler;
  })();
  return schedulerLib;
}

export async function loadScheduler(dark: boolean): Promise<any> {
  // Stylesheets and library travel together: the links are created in order (the theme after the base sheet, so it wins)
  // and the library starts downloading at the same time instead of after them.
  const sheets = Promise.all([
    loadCss("bryntum-core", `${ASSETS}/scheduler.css`),
    loadCss("bryntum-fa", `${ASSETS}/fontawesome/css/fontawesome.css`),
    loadCss("bryntum-fa-solid", `${ASSETS}/fontawesome/css/solid.css`),
    loadCss("bryntum-theme", `${ASSETS}/stockholm-${dark ? "dark" : "light"}.css`),
  ]);
  const lib = preloadScheduler();
  await sheets;
  // After the theme file, so these values win; replaced when the color mode changes.
  let style = document.getElementById("ayni-bryntum") as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement("style");
    style.id = "ayni-bryntum";
  }
  style.textContent = themeCss(dark ? night : dawn);
  document.head.appendChild(style); // appending an existing node moves it to the end
  return lib;
}

export const paletteOf = (dark: boolean): Palette => (dark ? night : dawn);

// ---------------------------------------------------------------------------------------------------- time axis

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/**
 * The time window of each round. Every window ends on the round's due date and starts on the previous one's, so the
 * windows are the same size and the chart can have exactly one column per round (the first one reaches back by one
 * round, which is when its contributions opened).
 */
export function roundWindows<R extends { number: number; dueAt: string }>(rounds: R[]) {
  const sorted = [...rounds].sort((a, b) => a.number - b.number);
  const dues = sorted.map((r) => new Date(r.dueAt).getTime());
  const gap = dues.length > 1 ? dues[1] - dues[0] : 7 * DAY;
  const windows = new Map<number, { start: Date; end: Date }>();
  sorted.forEach((r, i) => windows.set(r.number, { start: new Date(i === 0 ? dues[0] - gap : dues[i - 1]), end: new Date(dues[i]) }));
  const startDate = dues.length ? new Date(dues[0] - gap) : new Date();
  const endDate = dues.length ? new Date(dues[dues.length - 1]) : new Date(Date.now() + DAY);
  return { sorted, windows, gap, startDate, endDate };
}

/** Width of the member column: the avatar and two lines of text need room; narrower on a phone. */
export const memberColumnWidth = (hostWidth: number) => (hostWidth < 520 ? 168 : 212);

let presetSeq = 0;

/**
 * The time scale of a pasanaku: ONE COLUMN PER ROUND. The tick is the length of a round (minutes in demo mode, days or
 * weeks in real life, a month for monthly circles) and its header reads "Ronda 3 · vence jue 19 nov". The width fills
 * the screen, but a round never gets narrower than `minRoundPx`: below that the chart scrolls sideways.
 */
export function roundPreset(o: {
  windows: Map<number, { start: Date; end: Date }>;
  gap: number;
  hostWidth: number;
  locale: string;
  roundWord: string;
  dueWord: string;
  minRoundPx?: number;
}) {
  const { windows, gap, hostWidth, locale } = o;
  const count = Math.max(windows.size, 1);
  const monthly = gap >= 26 * DAY;
  const unit: "minute" | "hour" | "day" | "month" = monthly ? "month" : gap % DAY === 0 ? "day" : gap % HOUR === 0 ? "hour" : "minute";
  const inc = monthly ? 1 : unit === "day" ? gap / DAY : unit === "hour" ? gap / HOUR : Math.max(1, Math.round(gap / MIN));
  const available = Math.max(280, hostWidth - memberColumnWidth(hostWidth) - 4);
  const tickWidth = Math.max(o.minRoundPx ?? 150, available / count);

  const f = (opts: Intl.DateTimeFormatOptions) => (d: Date) => d.toLocaleString(locale, opts);
  const entries = [...windows.entries()];
  const roundAt = (d: Date) => {
    const mid = d.getTime() + gap / 2;
    return entries.find(([, w]) => mid >= w.start.getTime() && mid < w.end.getTime() + 1)?.[0];
  };
  const dueText = (n: number) => {
    const end = windows.get(n)!.end;
    return gap < DAY ? f({ hour: "2-digit", minute: "2-digit", hour12: false })(end) : f({ day: "numeric", month: "short" })(end);
  };
  const dueFull = (n: number) => f({ weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", hour12: false })(windows.get(n)!.end);
  // context row above the rounds: the day (for rounds of minutes or hours), the month, the year
  const top = gap < DAY ? { unit: "day", text: f({ weekday: "long", day: "numeric", month: "long" }) } : gap <= 8 * DAY ? { unit: "month", text: f({ month: "long", year: "numeric" }) } : { unit: "year", text: f({ year: "numeric" }) };

  return {
    base: "hourAndDay",
    id: `ayni-round-${++presetSeq}`,
    tickWidth,
    headers: [
      { unit: top.unit, align: "start", dateFormat: "", renderer: (start: Date) => top.text(start) },
      {
        unit,
        increment: inc,
        dateFormat: "",
        renderer: (start: Date) => {
          const n = roundAt(start);
          // short on the chart (it must fit in one column); the full "Vence jue 19 nov" is in the hover title
          return n == null ? "" : `<span title="${esc(o.dueWord)} ${esc(dueFull(n))}"><b>${esc(o.roundWord)} ${n}</b><span> · ${esc(dueText(n))}</span></span>`;
        },
      },
    ],
  };
}

const SCALES: { unit: "minute" | "hour" | "day" | "week" | "month"; inc: number; ms: number }[] = [
  ...[1, 5, 10, 15, 30].map((inc) => ({ unit: "minute" as const, inc, ms: inc * MIN })),
  ...[1, 2, 3, 6, 12].map((inc) => ({ unit: "hour" as const, inc, ms: inc * HOUR })),
  { unit: "day", inc: 1, ms: DAY },
  { unit: "week", inc: 1, ms: 7 * DAY },
  { unit: "month", inc: 1, ms: 30.44 * DAY },
];

/**
 * A continuous time scale for charts that are not made of rounds (the guarantee timeline). The unit is chosen from
 * the data; the width fills the screen but a round never gets narrower than `minRoundPx`.
 */
export function schedulePreset(o: { startDate: Date; endDate: Date; roundMs: number; hostWidth: number; locale: string; minRoundPx?: number }) {
  const { startDate, endDate, roundMs, hostWidth, locale } = o;
  const span = Math.max(endDate.getTime() - startDate.getTime(), MIN);
  const available = Math.max(280, hostWidth - memberColumnWidth(hostWidth) - 4);
  const minPerMs = (o.minRoundPx ?? 124) / Math.max(roundMs, MIN);
  const pick = (pxPerMs: number) => SCALES.find((s) => s.ms * pxPerMs >= 54) ?? SCALES[SCALES.length - 1];
  let pxPerMs = Math.max(minPerMs, available / span);
  let scale = pick(pxPerMs);
  pxPerMs = Math.max(minPerMs, available / (span + scale.ms));
  scale = pick(pxPerMs);
  const tickWidth = scale.ms * pxPerMs;

  const f = (opts: Intl.DateTimeFormatOptions) => (d: Date) => d.toLocaleString(locale, opts);
  const time = f({ hour: "2-digit", minute: "2-digit", hour12: false });
  const bottom: Record<typeof scale.unit, (d: Date) => string> = {
    minute: time,
    hour: time,
    day: f({ weekday: "short", day: "numeric" }),
    week: f({ day: "numeric", month: "short" }),
    month: f({ month: "short" }),
  };
  const top: Record<typeof scale.unit, { unit: string; text: (d: Date) => string }> = {
    minute: { unit: "day", text: f({ weekday: "long", day: "numeric", month: "long" }) },
    hour: { unit: "day", text: f({ weekday: "long", day: "numeric", month: "long" }) },
    day: { unit: "month", text: f({ month: "long", year: "numeric" }) },
    week: { unit: "month", text: f({ month: "long", year: "numeric" }) },
    month: { unit: "year", text: f({ year: "numeric" }) },
  };
  return {
    base: "hourAndDay",
    id: `ayni-${scale.unit}-${scale.inc}-${++presetSeq}`,
    tickWidth,
    headers: [
      { unit: top[scale.unit].unit, align: "start", dateFormat: "", renderer: (start: Date) => top[scale.unit].text(start) },
      { unit: scale.unit, increment: scale.inc, dateFormat: "", renderer: (start: Date) => bottom[scale.unit](start) },
    ],
  };
}

// ----------------------------------------------------------------------------------------------- columns, toolbar

/** Fields every member row carries (see each chart's buildData). */
export type MemberRow = { id: string; name: string; avatarId: string; sub: string; isMe: boolean; isPot?: boolean; paid?: number; total?: number; held?: string };

/** The first column: the member's woven avatar, their name and one line about them (turn, guarantee...). */
export function memberColumn(text: string, width: number, c: Palette, summaryLabel?: string) {
  return {
    text,
    // the summary row at the bottom names what it adds up
    ...(summaryLabel ? { sum: "count", summaryRenderer: () => `<span class="ay-sum-label">${esc(summaryLabel)}</span>` } : {}),
    field: "name",
    width,
    htmlEncode: false,
    sortable: false,
    cellCls: "ay-member-cell",
    renderer: ({ record }: { record: MemberRow }) =>
      record.isPot
        ? // the pot is not a person: a gold coin purse instead of an avatar
          `<span class="ay-member"><span class="ay-av ay-potico"><i class="fa fa-coins"></i></span><span class="ay-mname"><b>${esc(record.name)}</b><small>${esc(record.sub)}</small></span></span>`
        : `<span class="ay-member${record.isMe ? " ay-me" : ""}"><span class="ay-av">${wovenSvg(record.avatarId, c, 34)}</span><span class="ay-mname"><b>${esc(record.name)}</b><small>${esc(record.sub)}</small></span></span>`,
  };
}

/** "2/5" with a small bar: how many of the rounds this member has settled. */
export function progressColumn(text: string, width = 120) {
  return {
    text,
    field: "paid",
    width,
    htmlEncode: false,
    sortable: false,
    renderer: ({ record }: { record: MemberRow }) => {
      if (record.isPot) return "";
      const total = record.total ?? 0;
      const pct = total ? Math.round(((record.paid ?? 0) / total) * 100) : 0;
      return `<span class="ay-prog"><span class="ay-prog-bar"><i style="width:${pct}%"></i></span><b>${record.paid ?? 0}/${total}</b></span>`;
    },
  };
}

export type ToolbarLabels = { now: string; search: string; mine: string };

/**
 * The toolbar of every chart: jump to the round in progress, find a member, show only me.
 * Filtering uses Bryntum's own store filters, so it also works while the data refreshes.
 */
export function chartToolbar(getScheduler: () => any, L: ToolbarLabels, compact: boolean, focusDate: () => Date | null) {
  const state = { q: "", mine: false };
  const apply = () => {
    const s = getScheduler();
    if (!s) return;
    s.resourceStore.filter({
      id: "ayni",
      // the pot row (when there is one) always stays
      filterBy: (r: any) => !!r.isPot || ((!state.mine || r.isMe) && (!state.q || String(r.name).toLowerCase().includes(state.q))),
    });
  };
  // typing, pasting, emptying with the keyboard and the clear button each fire a different event: listen to all of them
  const setQuery = (value: unknown) => {
    state.q = String(value ?? "").trim().toLowerCase();
    apply();
  };
  const btn = (text: string, icon: string, onClick: () => void) => ({ type: "button", text: compact ? undefined : text, icon, tooltip: text, ariaLabel: text, onClick });
  return [
    btn(L.now, "fa fa-crosshairs", () => {
      const d = focusDate();
      if (d) getScheduler()?.scrollToDate(d, { block: "start", animate: { duration: 300 } });
    }),
    "->",
    { type: "textfield", placeholder: L.search, ariaLabel: L.search, clearable: true, icon: "fa fa-magnifying-glass", width: compact ? 140 : 210, onChange: ({ value }: { value: string }) => setQuery(value), onInput: ({ value }: { value: string }) => setQuery(value), onClear: () => setQuery("") },
    { type: "button", text: compact ? undefined : L.mine, icon: "fa fa-user", tooltip: L.mine, ariaLabel: L.mine, toggleable: true, onToggle: ({ pressed }: { pressed: boolean }) => ((state.mine = pressed), apply()) },
  ];
}

/** The line at the bottom of every chart. Also keeps the trial badge off the last row. */
export const statusBar = (html: string) => [{ type: "widget", ref: "ayStatus", cls: "ay-status", html }];
export function setStatus(s: any, html: string) {
  try {
    const w = s?.widgetMap?.ayStatus;
    if (w) w.html = html;
  } catch {
    /* the chart is still usable without it */
  }
}

/** The card that shows when hovering a bar: who, what state, how much, when. */
export function tipHtml(o: { c: Palette; avatarId: string; name: string; chip: string; hue: SchedHue; lines: string[] }) {
  return `<div class="ay-tip"><div class="ay-tip-h">${wovenSvg(o.avatarId, o.c, 28)}<b>${esc(o.name)}</b><span class="ayni-chip ay-${o.hue}">${esc(o.chip)}</span></div>${o.lines.map((l) => `<div>${l}</div>`).join("")}</div>`;
}

/** Bryntum's theme sets no font: use the app's, so the screens do not look like another product. */
export const HOST_STYLE = { width: "100%", fontFamily: "Figtree_400Regular, system-ui, sans-serif", fontSize: 15 } as const;
