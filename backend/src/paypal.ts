/**
 * Thin PayPal REST client (sandbox by default).
 * Used APIs: OAuth2, Orders v2, Payouts v1, Identity (Log in with PayPal), Webhook verification.
 */
import { config } from "./config";
import { formatUSD } from "./domain/rules";

const { apiBase, webBase, clientId, clientSecret } = config.paypal;
const basic = () => Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

let cachedToken: { value: string; expiresAt: number } | null = null;

async function appToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;
  const res = await fetch(`${apiBase}/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${basic()}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new PayPalError("oauth", res.status, await res.text());
  const json = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { value: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
  return json.access_token;
}

export class PayPalError extends Error {
  constructor(public op: string, public status: number, public body: string) {
    super(`PayPal ${op} failed (${status}): ${body.slice(0, 500)}`);
  }
}

async function call<T>(op: string, path: string, init: RequestInit & { idempotencyKey?: string } = {}): Promise<T> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${await appToken()}`,
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string>),
  };
  if (init.idempotencyKey) headers["PayPal-Request-Id"] = init.idempotencyKey;
  const res = await fetch(`${apiBase}${path}`, { ...init, headers });
  const text = await res.text();
  if (!res.ok) throw new PayPalError(op, res.status, text);
  return (text ? JSON.parse(text) : {}) as T;
}

// ---------- Orders v2: collecting a contribution ----------

export async function createOrder(p: {
  amountCents: number;
  description: string;
  customId: string; // our contribution id
  returnUrl: string;
  cancelUrl: string;
  locale?: string;
}): Promise<{ id: string; approveUrl: string }> {
  const order = await call<{ id: string; links: { rel: string; href: string }[] }>("createOrder", "/v2/checkout/orders", {
    method: "POST",
    idempotencyKey: `order-${p.customId}-${p.amountCents}`,
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id: p.customId,
          custom_id: p.customId,
          description: p.description.slice(0, 127),
          amount: { currency_code: "USD", value: formatUSD(p.amountCents) },
        },
      ],
      payment_source: {
        paypal: {
          experience_context: {
            brand_name: "Ayni",
            user_action: "PAY_NOW",
            shipping_preference: "NO_SHIPPING",
            locale: p.locale === "en" ? "en-US" : "es-ES",
            return_url: p.returnUrl,
            cancel_url: p.cancelUrl,
          },
        },
      },
    }),
  });
  const link = order.links.find((l) => l.rel === "payer-action" || l.rel === "approve");
  if (!link) throw new PayPalError("createOrder", 500, "No approval link returned");
  return { id: order.id, approveUrl: link.href };
}

export async function captureOrder(orderId: string): Promise<{ status: string; captureId?: string; customId?: string }> {
  const res = await call<any>("captureOrder", `/v2/checkout/orders/${orderId}/capture`, {
    method: "POST",
    idempotencyKey: `capture-${orderId}`,
    body: "{}",
  });
  const capture = res.purchase_units?.[0]?.payments?.captures?.[0];
  return { status: res.status, captureId: capture?.id, customId: capture?.custom_id };
}

export async function getOrder(orderId: string): Promise<{ status: string }> {
  return call("getOrder", `/v2/checkout/orders/${orderId}`, { method: "GET" });
}

// ---------- Payouts v1: delivering the pot / releasing retention ----------

export async function sendPayout(p: {
  senderBatchId: string; // our payout id, guarantees idempotency
  email: string;
  amountCents: number;
  note: string;
  subject: string;
}): Promise<{ batchId: string; status: string }> {
  const res = await call<any>("payout", "/v1/payments/payouts", {
    method: "POST",
    body: JSON.stringify({
      sender_batch_header: { sender_batch_id: p.senderBatchId, email_subject: p.subject },
      items: [
        {
          recipient_type: "EMAIL",
          receiver: p.email,
          amount: { value: formatUSD(p.amountCents), currency: "USD" },
          note: p.note,
          sender_item_id: p.senderBatchId,
        },
      ],
    }),
  });
  return { batchId: res.batch_header.payout_batch_id, status: res.batch_header.batch_status };
}

export async function getPayoutBatch(batchId: string): Promise<any> {
  return call("payoutStatus", `/v1/payments/payouts/${batchId}`, { method: "GET" });
}

// ---------- Log in with PayPal (Identity) ----------

export function loginUrl(redirectUri: string, state: string): string {
  const q = new URLSearchParams({
    flowEntry: "static",
    client_id: clientId,
    response_type: "code",
    scope: "openid profile email",
    redirect_uri: redirectUri,
    state,
  });
  return `${webBase}/connect?${q.toString()}`;
}

export async function exchangeLoginCode(code: string): Promise<string> {
  const res = await fetch(`${apiBase}/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${basic()}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "authorization_code", code }).toString(),
  });
  if (!res.ok) throw new PayPalError("loginExchange", res.status, await res.text());
  return ((await res.json()) as { access_token: string }).access_token;
}

export async function getUserInfo(userAccessToken: string): Promise<{ userId: string; name: string; email: string }> {
  const res = await fetch(`${apiBase}/v1/identity/oauth2/userinfo?schema=paypalv1.1`, {
    headers: { Authorization: `Bearer ${userAccessToken}` },
  });
  if (!res.ok) throw new PayPalError("userinfo", res.status, await res.text());
  const u = (await res.json()) as any;
  const email = u.emails?.find((e: any) => e.primary)?.value ?? u.emails?.[0]?.value ?? u.email;
  if (!email) throw new PayPalError("userinfo", 400, "PayPal did not return an email. Enable the Email scope in the Developer Dashboard.");
  return { userId: u.user_id ?? u.payer_id, name: u.name ?? email, email };
}

// ---------- Webhooks ----------

export async function verifyWebhook(headers: Record<string, string | string[] | undefined>, event: unknown): Promise<boolean> {
  if (!config.paypal.webhookId) return false;
  const h = (k: string) => String(headers[k] ?? "");
  const res = await call<{ verification_status: string }>("verifyWebhook", "/v1/notifications/verify-webhook-signature", {
    method: "POST",
    body: JSON.stringify({
      auth_algo: h("paypal-auth-algo"),
      cert_url: h("paypal-cert-url"),
      transmission_id: h("paypal-transmission-id"),
      transmission_sig: h("paypal-transmission-sig"),
      transmission_time: h("paypal-transmission-time"),
      webhook_id: config.paypal.webhookId,
      webhook_event: event,
    }),
  });
  return res.verification_status === "SUCCESS";
}
