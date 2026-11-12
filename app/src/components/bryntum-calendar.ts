/**
 * Bryntum Calendar dressed as Ayni (web only). Same idea as the charts in bryntum-web.ts: the app's palette, fonts and
 * stepped corners, with every movement coloured like the rest of the app (green paid, orange pending, red late, gold the
 * pot you receive, turquoise the guarantee).
 */
import { dawn, night, type Palette } from "@/lib/theme";
import { hueOf } from "@/lib/sched-colors";
import { SHADES, STEPPED, field, loadCss } from "./bryntum-web";

const ASSETS = "/bryntum";
const HUES = ["verde", "naranja", "rojo", "turquesa", "amarillo", "muted"] as const;

export function calendarCss(c: Palette): string {
  const shades = SHADES.map((n) => `--b-neutral-${n}: color-mix(in srgb, ${c.surface} ${n}%, ${c.ink});`).join("\n  ");
  const hues = HUES.map((h) => {
    const { fill, text } = hueOf(c, h);
    const weave = field(h === "muted" ? "hair" : h === "rojo" ? "hatch" : h === "naranja" ? "threads" : "twill", c.ink);
    return `
.ayni-cal .b-cal-event-wrap.ay-ev.ay-h-${h} .b-cal-event, .ayni-cal .b-cal-event-wrap.ay-h-${h} { --ay-fill: ${fill}; --ay-text: ${text}; }
.ayni-cal .ay-ev.ay-h-${h} .b-cal-event { background-color: ${fill} !important; background-image: ${weave} !important; color: ${c.ink} !important; }
.ayni-cal .ay-ev.ay-h-${h}.ay-est .b-cal-event { background-color: color-mix(in srgb, ${fill} 28%, ${c.surface}) !important; background-image: ${field("hair", c.ink)} !important; border: 1.5px dashed ${fill}; }`;
  }).join("\n");
  const tipHues = HUES.map((h) => `.ay-tip-head.ay-h-${h} { --ay-fill: ${hueOf(c, h).fill}; }`).join("\n");
  return `
:root:root:root {
  ${shades}
  --b-primary: ${c.fucsia.fill};
  --b-widget-color: ${c.ink};
  --b-widget-border-color: ${c.line};
  --b-widget-border-radius: 0;
}
.ayni-cal, .ayni-cal .b-widget { font-family: Figtree_400Regular, system-ui, sans-serif; }
.ayni-cal { background: ${c.surface}; border: 2px solid ${c.line}; }
.ayni-cal .b-toolbar { background: ${c.surfaceAlt}; border-bottom: 2px solid ${c.line}; }
.ayni-cal .b-button { font-family: Figtree_700Bold, system-ui, sans-serif; font-weight: 700; border-radius: 0; }
.ayni-cal .b-calendar-sidebar { background: ${c.surfaceAlt}; border-inline-end: 2px solid ${c.line}; }
.ayni-cal .b-cal-event { clip-path: ${STEPPED}; border-radius: 0; font-family: Figtree_700Bold, system-ui, sans-serif; }
/* the text sits on a plate so it reads over the weave of the bar */
.ayni-cal .b-cal-event-body { padding: 2px 3px; }
.ayni-cal .ay-evc { display: flex; align-items: center; gap: 5px; min-width: 0; white-space: nowrap; overflow: hidden; background: ${c.surface}; color: ${c.ink}; padding: 2px 6px; clip-path: ${STEPPED}; font-size: 12px; }
.ayni-cal .ay-evi { flex: none; font-size: 11px; color: var(--ay-text, ${c.ink}); }
.ayni-cal .ay-eva { font-variant-numeric: tabular-nums; }
.ayni-cal .ay-evg { overflow: hidden; text-overflow: ellipsis; font-weight: 400; color: ${c.muted}; }
.ayni-cal .ay-evest { color: ${c.muted}; }
${hues}
/* the card of a movement */
.ay-evtip { border: 2px solid ${c.line}; border-radius: 0; background: ${c.surface}; box-shadow: 0 10px 28px rgba(0,0,0,.28); padding: 0; min-width: 300px; max-width: 340px; }
.ay-evtip .b-panel-header, .ay-evtip .b-tool { display: none !important; }
.ay-evtip .b-panel-body-wrap, .ay-evtip .b-tooltip-content { padding: 0; }
.ay-evtip, .ay-evtip *:not(i) { font-family: Figtree_400Regular, system-ui, sans-serif !important; }
.ay-evtip { color: ${c.ink}; }
.ay-tip-head { display: flex; align-items: center; gap: 10px; padding: 12px 14px; color: ${c.ink}; background-color: var(--ay-fill, ${c.line}); }
.ay-tip-head i { font-size: 16px; }
.ay-evtip .ay-tip-head b { font-family: Figtree_700Bold, system-ui, sans-serif !important; font-size: 24px; font-variant-numeric: tabular-nums; }
.ay-tip-head span { margin-left: auto; font-size: 12.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .03em; background: ${c.surface}; padding: 3px 8px; }
${tipHues}
.ay-tip-group { display: flex; flex-direction: column; gap: 3px; padding: 12px 14px; border-bottom: 1px solid ${c.line}; }
.ay-evtip .ay-tip-group b { font-family: Figtree_700Bold, system-ui, sans-serif !important; font-size: 16px; }
.ay-tip-group span { font-size: 13.5px; color: ${c.muted}; }
.ay-tip-bar { height: 6px; background: ${c.line}; margin-top: 4px; }
.ay-tip-bar i { display: block; height: 100%; background: ${c.verde.fill}; }
.ay-tip-sub { font-size: 12.5px !important; }
.ay-tip-rows { display: flex; flex-direction: column; padding: 6px 14px; }
.ay-tip-row { display: flex; justify-content: space-between; gap: 14px; padding: 6px 0; border-bottom: 1px solid ${c.line}; font-size: 14px; }
.ay-tip-row:last-child { border-bottom: 0; }
.ay-tip-row span:first-child { color: ${c.muted}; }
.ay-evtip .ay-tip-row b { font-family: Figtree_700Bold, system-ui, sans-serif !important; text-align: right; }
.ay-evtip .ay-tip-open { display: block; width: calc(100% - 28px); margin: 6px 14px 14px; padding: 10px; background: ${c.fucsia.fill}; color: ${c.onAction}; border: 0; font-family: Figtree_700Bold, system-ui, sans-serif !important; font-size: 14px; cursor: pointer; clip-path: ${STEPPED}; }
.ay-tip-open:hover { filter: brightness(1.1); }
`;
}

let calendarLib: Promise<{ Calendar: any; LocaleManager: any }> | null = null;
/** The library and the Spanish locale, kept: asked for early (see lib/prefetch) so opening the calendar finds them ready. */
export function preloadCalendar() {
  calendarLib ??= (async () => {
    const key = process.env.EXPO_PUBLIC_BRYNTUM_LICENSE;
    if (key) ((globalThis as any).bryntum ??= {}).licenseKey = key;
    const [mod, core] = await Promise.all([import("@bryntum/calendar-enterprise") as Promise<any>, import("@bryntum/core-enterprise") as Promise<any>]);
    try {
      // @ts-expect-error the locale files ship without type declarations
      await import("@bryntum/calendar-enterprise/locales/calendar.locale.Es.js");
    } catch (e) {
      console.warn("Calendar locale unavailable, using English:", e);
    }
    return { Calendar: mod.Calendar, LocaleManager: core.LocaleManager };
  })();
  return calendarLib;
}

export async function loadCalendar(dark: boolean, lang: "es" | "en"): Promise<any> {
  const sheets = Promise.all([
    loadCss("bryntum-core", `${ASSETS}/calendar/calendar.css`),
    loadCss("bryntum-fa", `${ASSETS}/fontawesome/css/fontawesome.css`),
    loadCss("bryntum-fa-solid", `${ASSETS}/fontawesome/css/solid.css`),
    loadCss("bryntum-theme", `${ASSETS}/calendar/stockholm-${dark ? "dark" : "light"}.css`),
  ]);
  const lib = preloadCalendar();
  await sheets;
  let style = document.getElementById("ayni-bryntum") as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement("style");
    style.id = "ayni-bryntum";
  }
  style.textContent = calendarCss(dark ? night : dawn);
  document.head.appendChild(style);
  const { Calendar, LocaleManager } = await lib;
  try {
    await LocaleManager.applyLocale(lang === "es" ? "Es" : "En");
  } catch {
    /* without the locale it stays in English */
  }
  return Calendar;
}
