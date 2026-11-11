/**
 * Thin PayPal REST client (sandbox by default).
 * Used APIs: OAuth2, Orders v2 (capture + authorize), Payments v2 (capture / void authorizations),
 * Payouts v1, Invoicing v2, Disputes v1, Identity (Log in with PayPal), Webhook verification.
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

/** The client id is public by design (it identifies the app to the browser SDK); the secret never leaves the server. */
export const publicClientId = clientId;
export const sdkUrl = `${webBase}/web-sdk/v6/core`;

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
  // A hung request must not hang the engine; the caller decides what a timeout means (see Payouts).
  const res = await fetch(`${apiBase}${path}`, { ...init, headers, signal: AbortSignal.timeout(20_000) });
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
  /** AUTHORIZE = hold the money without charging it (admission deposit). */
  intent?: "CAPTURE" | "AUTHORIZE";
  /** Popup (JS SDK v6): the order carries no redirect urls; the SDK reports the approval to the page. */
  popup?: boolean;
}): Promise<{ id: string; approveUrl: string }> {
  const intent = p.intent ?? "CAPTURE";
  const order = await call<{ id: string; links: { rel: string; href: string }[] }>("createOrder", "/v2/checkout/orders", {
    method: "POST",
    idempotencyKey: `order-${intent}-${p.customId}-${p.amountCents}`,
    body: JSON.stringify({
      intent,
      purchase_units: [
        {
          reference_id: p.customId,
          custom_id: p.customId,
          description: p.description.slice(0, 127),
          amount: { currency_code: "USD", value: formatUSD(p.amountCents) },
        },
      ],
      ...(p.popup
        ? {}
        : {
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
    }),
  });
  const link = order.links.find((l) => l.rel === "payer-action" || l.rel === "approve");
  if (!link && !p.popup) throw new PayPalError("createOrder", 500, "No approval link returned");
  return { id: order.id, approveUrl: link?.href ?? "" };
}

/** "12.34" -> 1234. PayPal sends money as decimal strings; we keep integer cents. */
export function toCents(value: unknown): number | undefined {
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  const n = Math.round(Number(value) * 100);
  return Number.isFinite(n) ? n : undefined;
}

export type CaptureResult = {
  status: string;
  captureId?: string;
  customId?: string;
  /** PayPal's own numbers for this capture (seller_receivable_breakdown). Undefined when PayPal does not send them. */
  feeCents?: number;
  netCents?: number;
};

function readCapture(res: any): CaptureResult {
  const capture = res.purchase_units?.[0]?.payments?.captures?.[0];
  const b = capture?.seller_receivable_breakdown;
  return {
    status: res.status,
    captureId: capture?.id,
    customId: capture?.custom_id,
    feeCents: toCents(b?.paypal_fee?.value),
    netCents: toCents(b?.net_amount?.value),
  };
}

export async function captureOrder(orderId: string): Promise<CaptureResult> {
  const res = await call<any>("captureOrder", `/v2/checkout/orders/${orderId}/capture`, {
    method: "POST",
    idempotencyKey: `capture-${orderId}`,
    body: "{}",
  });
  return readCapture(res);
}

export async function getOrder(orderId: string): Promise<{ status: string }> {
  return call("getOrder", `/v2/checkout/orders/${orderId}`, { method: "GET" });
}

// ---------- Orders v2 (AUTHORIZE) + Payments v2: admission deposit ----------

/** After the buyer approves an AUTHORIZE order: place the hold. */
export async function authorizeOrder(orderId: string): Promise<{ status: string; authorizationId?: string }> {
  const res = await call<any>("authorizeOrder", `/v2/checkout/orders/${orderId}/authorize`, {
    method: "POST",
    idempotencyKey: `authorize-${orderId}`,
    body: "{}",
  });
  const auth = res.purchase_units?.[0]?.payments?.authorizations?.[0];
  return { status: auth?.status ?? res.status, authorizationId: auth?.id };
}

export async function getOrderAuthorization(orderId: string): Promise<string | undefined> {
  const res = await call<any>("getOrder", `/v2/checkout/orders/${orderId}`, { method: "GET" });
  return res.purchase_units?.[0]?.payments?.authorizations?.[0]?.id;
}

/** Request accepted: charge the held deposit (it becomes their first contribution). */
export async function captureAuthorization(authorizationId: string): Promise<{ captureId: string; status: string }> {
  const res = await call<any>("captureAuthorization", `/v2/payments/authorizations/${authorizationId}/capture`, {
    method: "POST",
    idempotencyKey: `capture-auth-${authorizationId}`,
    body: JSON.stringify({ final_capture: true }),
  });
  return { captureId: res.id, status: res.status };
}

/** Request rejected: release the hold, nothing is charged. */
export async function voidAuthorization(authorizationId: string): Promise<void> {
  await call("voidAuthorization", `/v2/payments/authorizations/${authorizationId}/void`, {
    method: "POST",
    idempotencyKey: `void-${authorizationId}`,
  });
}

// ---------- Payments v2: refunds ----------

/** Refund a capture in full. `requestId` makes it idempotent: the same id never refunds twice. */
export async function refundCapture(p: { captureId: string; requestId: string; note: string }): Promise<{ id: string; status: string }> {
  const res = await call<any>("refundCapture", `/v2/payments/captures/${encodeURIComponent(p.captureId)}/refund`, {
    method: "POST",
    idempotencyKey: p.requestId,
    body: JSON.stringify({ note_to_payer: p.note.slice(0, 255) }),
  });
  // PENDING = PayPal accepted it and will finish it (e.g. an eCheck); the webhook confirms.
  if (res.status !== "COMPLETED" && res.status !== "PENDING") throw new PayPalError("refundCapture", 422, JSON.stringify(res).slice(0, 500));
  return { id: res.id, status: res.status };
}

/**
 * Classify a refund error:
 *  - "already": the capture is already fully refunded, so the money IS back
 *  - "failed": PayPal answered with a definitive error
 *  - "unknown": timeout / network / 5xx, so it may or may not have been refunded
 */
export function refundErrorKind(e: unknown): "already" | "failed" | "unknown" {
  if (e instanceof PayPalError && e.status < 500) return /CAPTURE_FULLY_REFUNDED/i.test(e.body) ? "already" : "failed";
  return "unknown";
}

// ---------- Invoicing v2: formal invoice for overdue contributions ----------

export async function createAndSendInvoice(p: {
  reference: string; // our contribution id
  email: string;
  name: string;
  items: { name: string; amountCents: number }[];
  note: string;
  dueDate: Date;
}): Promise<string> {
  const invoice = await call<any>("createInvoice", "/v2/invoicing/invoices", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    idempotencyKey: `invoice-${p.reference}`,
    body: JSON.stringify({
      detail: {
        currency_code: "USD",
        reference: p.reference,
        note: p.note.slice(0, 4000),
        payment_term: { due_date: p.dueDate.toISOString().slice(0, 10) },
      },
      primary_recipients: [{ billing_info: { email_address: p.email, name: { full_name: p.name } } }],
      items: p.items.map((i) => ({
        name: i.name.slice(0, 200),
        quantity: "1",
        unit_amount: { currency_code: "USD", value: formatUSD(i.amountCents) },
        unit_of_measure: "AMOUNT",
      })),
    }),
  });
  const id: string = invoice.id ?? String(invoice.href ?? "").split("/").pop();
  if (!id) throw new PayPalError("createInvoice", 500, "No invoice id returned");
  await call("sendInvoice", `/v2/invoicing/invoices/${id}/send`, {
    method: "POST",
    idempotencyKey: `invoice-send-${id}`,
    body: JSON.stringify({ send_to_invoicer: false, send_to_recipient: true }),
  });
  return id;
}

/** The contribution was settled another way (checkout or guarantee): cancel the open invoice. */
export async function cancelInvoice(invoiceId: string): Promise<void> {
  await call("cancelInvoice", `/v2/invoicing/invoices/${invoiceId}/cancel`, {
    method: "POST",
    body: JSON.stringify({ send_to_recipient: true, note: "Paid / pagado. Gracias." }),
  });
}

// ---------- Disputes v1: context for the organizer and the mediator ----------

export type Dispute = {
  id: string;
  reason: string;
  status: string;
  amountCents: number;
  createdAt: string;
  sellerTransactionIds: string[];
  lifecycleStage?: string;
};

export async function listDisputes(max = 20): Promise<Dispute[]> {
  const list = await call<any>("listDisputes", `/v1/customer/disputes?page_size=${Math.min(50, max)}`, { method: "GET" });
  const items: any[] = (list.items ?? []).slice(0, max);
  const out: Dispute[] = [];
  for (const it of items) {
    const d = await call<any>("getDispute", `/v1/customer/disputes/${it.dispute_id}`, { method: "GET" });
    out.push({
      id: d.dispute_id,
      reason: d.reason,
      status: d.status,
      lifecycleStage: d.dispute_life_cycle_stage,
      amountCents: Math.round(Number(d.dispute_amount?.value ?? 0) * 100),
      createdAt: d.create_time,
      sellerTransactionIds: (d.disputed_transactions ?? []).map((t: any) => t.seller_transaction_id).filter(Boolean),
    });
  }
  return out;
}

// ---------- Payouts v1: delivering the pot / releasing retention ----------

/** Who receives a payout: the PayPal account that logged in when we know it, otherwise their email. */
export type PayoutRecipient = { email: string; paypalPayerId?: string | null };

export function payoutReceiver(to: PayoutRecipient): { recipient_type: "PAYPAL_ID" | "EMAIL"; receiver: string } {
  return to.paypalPayerId ? { recipient_type: "PAYPAL_ID", receiver: to.paypalPayerId } : { recipient_type: "EMAIL", receiver: to.email };
}

export async function sendPayout(p: {
  senderBatchId: string; // our payout id, guarantees idempotency
  to: PayoutRecipient;
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
          ...payoutReceiver(p.to),
          amount: { value: formatUSD(p.amountCents), currency: "USD" },
          note: p.note,
          sender_item_id: p.senderBatchId,
          // Pots and refunds between members are not a sale of goods or services.
          purpose: "NON_GOODS_OR_SERVICES",
        },
      ],
    }),
  });
  return { batchId: res.batch_header.payout_batch_id, status: res.batch_header.batch_status };
}

/**
 * Classify a Payouts error:
 *  - "duplicate": PayPal already has this sender_batch_id, so the money WAS sent
 *  - "failed": PayPal answered with a definitive error, so nothing was sent
 *  - "unknown": timeout / network / 5xx, so it may or may not have been sent
 */
export function payoutErrorKind(e: unknown): "duplicate" | "failed" | "unknown" {
  if (e instanceof PayPalError && e.status < 500) {
    return /SENDER_BATCH_ID_ALREADY_USED|DUPLICATE/i.test(e.body) ? "duplicate" : "failed";
  }
  return "unknown";
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

export async function getUserInfo(userAccessToken: string): Promise<{ userId: string; payerId: string | null; name: string; email: string }> {
  const res = await fetch(`${apiBase}/v1/identity/oauth2/userinfo?schema=paypalv1.1`, {
    headers: { Authorization: `Bearer ${userAccessToken}` },
  });
  if (!res.ok) throw new PayPalError("userinfo", res.status, await res.text());
  const u = (await res.json()) as any;
  const email = u.emails?.find((e: any) => e.primary)?.value ?? u.emails?.[0]?.value ?? u.email;
  if (!email) throw new PayPalError("userinfo", 400, "PayPal did not return an email. Enable the Email scope in the Developer Dashboard.");
  const payerId = typeof u.payer_id === "string" && /^[A-Z0-9]{8,20}$/.test(u.payer_id) ? u.payer_id : null;
  return { userId: u.user_id ?? u.payer_id, payerId, name: u.name ?? email, email };
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
