/**
 * Shared by the three Bryntum screens (turn timeline, payment calendar, guarantee timeline). Web only: Bryntum draws
 * on the browser's DOM, so only the .web.tsx components import this file.
 */
const ASSETS = "/bryntum";

function loadCss(id: string, href: string): Promise<void> {
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

/** Escape text that goes into a tooltip (Bryntum tooltips are HTML). */
export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Loads Bryntum's styles for the current color mode, registers the license key and returns the Scheduler class. */
export async function loadScheduler(dark: boolean): Promise<any> {
  await Promise.all([
    loadCss("bryntum-core", `${ASSETS}/scheduler.css`),
    loadCss("bryntum-fa", `${ASSETS}/fontawesome/css/fontawesome.css`),
    loadCss("bryntum-fa-solid", `${ASSETS}/fontawesome/css/solid.css`),
  ]);
  await loadCss("bryntum-theme", `${ASSETS}/stockholm-${dark ? "dark" : "light"}.css`);
  // The key must be registered before the library loads. It is public by nature (it ships in the page).
  const key = process.env.EXPO_PUBLIC_BRYNTUM_LICENSE;
  if (key) ((globalThis as any).bryntum ??= {}).licenseKey = key;
  const { Scheduler } = await import("@bryntum/scheduler-enterprise");
  return Scheduler;
}

/** The time scale that fits the whole pasanaku: minutes in demo mode, weeks or months in real life. */
export function presetFor(startDate: Date, endDate: Date): string {
  const span = endDate.getTime() - startDate.getTime();
  const hour = 3600_000;
  if (span <= 6 * hour) return "minuteAndHour";
  if (span <= 4 * 24 * hour) return "hourAndDay";
  if (span <= 30 * 24 * hour) return "dayAndWeek";
  return "weekAndMonth";
}

/** Bryntum's theme sets no font: use the app's, so the screens do not look like another product. */
export const HOST_STYLE = { width: "100%", fontFamily: "Figtree_400Regular, system-ui, sans-serif", fontSize: 15 } as const;

/** The time window of each round (from the previous round's due date to its own) and the span that shows them all. */
export function roundWindows(rounds: { number: number; dueAt: string }[], startsAt: string | null) {
  const sorted = [...rounds].sort((a, b) => a.number - b.number);
  const dues = sorted.map((r) => new Date(r.dueAt).getTime());
  const gap = dues.length > 1 ? dues[1] - dues[0] : 7 * 86_400_000;
  const first = dues[0] ?? Date.now();
  const windows = new Map<number, { start: Date; end: Date }>();
  sorted.forEach((r, i) => windows.set(r.number, { start: new Date(i === 0 ? (startsAt ? new Date(startsAt).getTime() : first - gap) : dues[i - 1]), end: new Date(dues[i]) }));
  const firstStart = windows.get(sorted[0]?.number)?.start ?? new Date();
  const lastEnd = dues.length ? new Date(dues[dues.length - 1]) : new Date(Date.now() + 86_400_000);
  return { windows, gap, startDate: new Date(firstStart.getTime() - gap * 0.15), endDate: new Date(lastEnd.getTime() + gap * 0.15) };
}
