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
`;
}

export async function loadCalendar(dark: boolean, lang: "es" | "en"): Promise<any> {
  await Promise.all([
    loadCss("bryntum-core", `${ASSETS}/calendar/calendar.css`),
    loadCss("bryntum-fa", `${ASSETS}/fontawesome/css/fontawesome.css`),
    loadCss("bryntum-fa-solid", `${ASSETS}/fontawesome/css/solid.css`),
  ]);
  await loadCss("bryntum-theme", `${ASSETS}/calendar/stockholm-${dark ? "dark" : "light"}.css`);
  let style = document.getElementById("ayni-bryntum") as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement("style");
    style.id = "ayni-bryntum";
  }
  style.textContent = calendarCss(dark ? night : dawn);
  document.head.appendChild(style);
  const key = process.env.EXPO_PUBLIC_BRYNTUM_LICENSE;
  if (key) ((globalThis as any).bryntum ??= {}).licenseKey = key;
  const mod: any = await import("@bryntum/calendar-enterprise");
  try {
    // @ts-expect-error the locale files ship without type declarations
    await import("@bryntum/calendar-enterprise/locales/calendar.locale.Es.js");
    const { LocaleManager } = await import("@bryntum/core-enterprise");
    await LocaleManager.applyLocale(lang === "es" ? "Es" : "En");
  } catch (e) {
    console.warn("Calendar locale unavailable, using English:", e);
  }
  return mod.Calendar;
}
