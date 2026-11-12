/**
 * PayPal in a small window over the app (web only). The window opens straight from the click, so browsers do not
 * block it, and shows a short "waiting" page while the app asks the server where to send it. When PayPal is done it
 * lands on /paypal-done, which tells this window how it went and closes itself.
 * If the browser blocks the window, the caller falls back to the full-page redirect it always had.
 */
const SIZE = { w: 480, h: 720 };
/** PayPal's pages may cut the link between the two windows (window.opener), so the landing page also speaks on a channel any same-origin window can hear. */
export const CHANNEL = "ayni-paypal";

/** Open the (still empty) window. Must be called synchronously from a click. Null = blocked. */
export function openBlankPopup(label: string): Window | null {
  const left = Math.max(0, Math.round(window.screenX + (window.outerWidth - SIZE.w) / 2));
  const top = Math.max(0, Math.round(window.screenY + (window.outerHeight - SIZE.h) / 2));
  const win = window.open("", "ayni-paypal", `popup=yes,width=${SIZE.w},height=${SIZE.h},left=${left},top=${top}`);
  if (!win) return null;
  try {
    win.document.title = "PayPal";
    win.document.body.style.cssText = "margin:0;display:grid;place-items:center;height:100vh;font:600 16px system-ui,sans-serif;color:#1A1A3A;background:#FFF6EA";
    win.document.body.textContent = label;
  } catch {
    /* a window that cannot be written to still gets navigated below */
  }
  return win;
}

/** Wait until the window reports back (params of the landing page) or the person closes it (null). */
export function waitForPopup(win: Window): Promise<Record<string, string> | null> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (value: Record<string, string> | null) => {
      if (done) return;
      done = true;
      window.removeEventListener("message", onMessage);
      channel?.close();
      clearInterval(timer);
      resolve(value);
    };
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.data?.type !== "ayni-paypal") return;
      finish((e.data.params ?? {}) as Record<string, string>);
    };
    window.addEventListener("message", onMessage);
    // same-origin only by design: nothing from another site can arrive here
    const channel = typeof BroadcastChannel === "function" ? new BroadcastChannel(CHANNEL) : null;
    if (channel) channel.onmessage = (e) => e.data?.type === "ayni-paypal" && finish((e.data.params ?? {}) as Record<string, string>);
    // closed by hand: leave a moment for a message that was already on its way
    const timer = setInterval(() => {
      if (win.closed) setTimeout(() => finish(null), 400);
    }, 500);
  });
}

/**
 * The whole trip. `prepare(redirect)` asks the server for the PayPal address, knowing where PayPal must send the
 * person back to. Returns what the landing page reported, null if they closed the window, or "blocked" when the
 * browser did not allow the window (the caller then does the redirect).
 */
export async function runInPopup(label: string, prepare: (redirect: string) => Promise<string | null>): Promise<Record<string, string> | null | "blocked"> {
  const win = openBlankPopup(label);
  if (!win) return "blocked";
  let url: string | null;
  try {
    url = await prepare(`${window.location.origin}/paypal-done`);
  } catch (e) {
    win.close();
    throw e;
  }
  if (!url) {
    win.close();
    return null;
  }
  win.location.href = url;
  return waitForPopup(win);
}
