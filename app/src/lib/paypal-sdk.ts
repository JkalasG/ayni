/**
 * PayPal JavaScript SDK v6 (web only): the buyer approves in a small popup and never leaves Ayni.
 * Native keeps the in-app browser (see pay.ts). If the SDK can't load (mock mode, offline, blocked),
 * callers fall back to the full-page redirect, so paying never depends on this file.
 */
import { Platform } from "react-native";
import { api } from "./api";

export type PopupResult = "paid" | "cancelled" | "error";

let instance: any = null;
let loading: Promise<void> | null = null;

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector("script[data-paypal-sdk]")) return resolve();
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.dataset.paypalSdk = "1";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("paypal_sdk_load_failed"));
    document.head.appendChild(s);
  });
}

/**
 * Load the SDK ahead of time. The popup must open straight from the click (browsers block it
 * otherwise), so everything slow — the script, the config call — happens here, before the click.
 */
export function preloadPayPal(): Promise<void> {
  if (Platform.OS !== "web" || instance) return Promise.resolve();
  loading ??= (async () => {
    try {
      const cfg = await api<{ enabled: boolean; sdkUrl?: string; clientId?: string }>("/paypal/sdk-config");
      if (!cfg.enabled || !cfg.sdkUrl) return;
      await loadScript(cfg.sdkUrl);
      instance = await (window as any).paypal.createInstance({
        clientId: cfg.clientId,
        components: ["paypal-payments"],
        pageType: "checkout",
        locale: document.documentElement.lang === "en" ? "en-US" : "es-ES",
      });
    } catch (e) {
      console.warn("PayPal popup unavailable, using redirect:", e);
      loading = null; // allow a retry on the next screen
    }
  })();
  return loading;
}

export const popupReady = () => Platform.OS === "web" && !!instance;

/**
 * Pay a contribution in a PayPal popup. Call it straight from the click handler: `start()` must run
 * in the same tick as the click, so the order is passed as a promise and never awaited first.
 */
export function payInPopup(contributionId: string): Promise<PopupResult> {
  return new Promise((resolve) => {
    const session = instance.createPayPalOneTimePaymentSession({
      async onApprove(data: { orderId: string }) {
        try {
          await api(`/contributions/${contributionId}/capture`, { body: { orderId: data.orderId } });
          resolve("paid");
        } catch (e) {
          console.error("capture failed", e);
          resolve("error");
        }
      },
      onCancel: () => resolve("cancelled"),
      onError: (e: unknown) => {
        console.error("PayPal popup error", e);
        resolve("error");
      },
    });
    const order = api<{ orderId: string }>(`/contributions/${contributionId}/checkout`, {
      body: { redirect: `${window.location.origin}/`, popup: true },
    }).then((r) => ({ orderId: r.orderId }));
    session.start({ presentationMode: "auto" }, order).catch((e: unknown) => {
      console.error("PayPal start failed", e);
      resolve("error");
    });
  });
}
