/**
 * The Bryntum libraries are the heaviest part of the web app. Once someone is signed in, the browser downloads them while
 * it is idle, so the first time they open a schedule or the calendar nothing waits on the network. Skipped on a metered
 * connection ("save data").
 */
import { preloadScheduler } from "@/components/bryntum-web";
import { preloadCalendar } from "@/components/bryntum-calendar";

let started = false;
export function prefetchCharts() {
  if (started) return;
  started = true;
  if ((navigator as any).connection?.saveData) return;
  const idle: (cb: () => void) => void = (cb) => (typeof (window as any).requestIdleCallback === "function" ? (window as any).requestIdleCallback(cb, { timeout: 4000 }) : setTimeout(cb, 1500));
  // one after the other: the second shares most of the first (Bryntum's core and grid)
  idle(() => {
    preloadCalendar()
      .catch(() => {})
      .then(() => idle(() => preloadScheduler().catch(() => {})));
  });
}
