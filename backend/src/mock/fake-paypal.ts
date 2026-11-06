/**
 * Simulated PayPal for APP_MODE=mock. Same endpoints and response shapes that
 * src/paypal.ts uses, kept in memory, plus the pages a buyer would see
 * (log in, approve a payment). Every id starts with SIM- so nothing looks real.
 */
import express, { Router } from "express";

type Order = {
  id: string;
  intent: "CAPTURE" | "AUTHORIZE";
  amount: string;
  description: string;
  customId: string;
  returnUrl: string;
  cancelUrl: string;
  status: "CREATED" | "APPROVED" | "COMPLETED";
  captureId?: string;
  authorizationId?: string;
};

const orders = new Map<string, Order>();
const authorizations = new Map<string, { amount: string; status: string; captureId?: string }>();
const batches = new Map<string, { batchId: string; email: string; amount: string; note: string; createdAt: Date }>();
const invoices = new Map<string, { total: string; email: string; status: string }>();
const captures: { id: string; amount: string; description: string; createdAt: Date }[] = [];
let seq = 0;
// The mock database survives restarts but this counter does not: a per-run prefix keeps ids unique
// (paypalInvoiceId, order and capture ids are unique columns).
const RUN = Date.now().toString(36).slice(-4).toUpperCase();
const sim = (p: string) => `SIM-${p}-${RUN}${(++seq).toString().padStart(4, "0")}`;
const cents = (v: string) => Math.round(Number(v) * 100);

function page(title: string, body: string) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title><style>
:root{--bg:#f5f7fa;--card:#fff;--ink:#1b2430;--muted:#5d6b7c;--blue:#0a3d91;--line:#e1e6ee}
body{margin:0;background:var(--bg);font:16px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:var(--ink)}
main{max-width:420px;margin:0 auto;padding:24px 16px}
.tag{display:inline-block;background:#fff4d6;color:#7a5200;border:1px solid #f0d58c;border-radius:99px;padding:2px 10px;font-size:13px;font-weight:700}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:20px;margin-top:16px}
h1{font-size:22px;margin:12px 0 4px}.amount{font-size:36px;font-weight:800;margin:8px 0}
.muted{color:var(--muted);font-size:14px}a.btn,button{display:block;width:100%;box-sizing:border-box;text-align:center;border:0;border-radius:99px;padding:14px;font-size:16px;font-weight:700;margin-top:12px;text-decoration:none;cursor:pointer}
.pay{background:#ffc439;color:#111}.cancel{background:transparent;color:var(--blue);border:1px solid var(--line)!important}
table{width:100%;border-collapse:collapse;font-size:14px}td,th{text-align:left;padding:6px 4px;border-bottom:1px solid var(--line)}
</style></head><body><main><span class="tag">PayPal simulado · no se mueve dinero</span>${body}</main></body></html>`;
}

const addQuery = (url: string, q: Record<string, string>) => url + (url.includes("?") ? "&" : "?") + new URLSearchParams(q).toString();

export function fakePayPal(webBase: string): Router {
  const r = Router();
  r.use(express.urlencoded({ extended: false }));

  // ---------------- OAuth + Identity
  r.post("/v1/oauth2/token", (_req, res) => res.json({ access_token: sim("TOKEN"), expires_in: 32400 }));
  r.get("/v1/identity/oauth2/userinfo", (_req, res) =>
    res.json({ user_id: "sim-paypal-user", name: "Persona de prueba", emails: [{ value: "persona.prueba@simulado.ayni", primary: true }] })
  );
  r.get("/connect", (req, res) => {
    const redirect = String(req.query.redirect_uri ?? "");
    const back = addQuery(redirect, { code: sim("CODE"), state: String(req.query.state ?? "") });
    res.send(
      page(
        "Ingresar con PayPal (simulado)",
        `<div class="card"><h1>Ingresar con PayPal</h1><p class="muted">Ayni pide tu nombre y tu correo verificado.</p>
<a class="btn pay" href="${back}">Ingresar como "Persona de prueba"</a></div>`
      )
    );
  });

  // ---------------- Orders v2
  r.post("/v2/checkout/orders", (req, res) => {
    const pu = req.body.purchase_units?.[0] ?? {};
    const ctx = req.body.payment_source?.paypal?.experience_context ?? {};
    const o: Order = {
      id: sim("ORDER"),
      intent: req.body.intent === "AUTHORIZE" ? "AUTHORIZE" : "CAPTURE",
      amount: pu.amount?.value ?? "0.00",
      description: pu.description ?? "",
      customId: pu.custom_id ?? "",
      returnUrl: ctx.return_url ?? "",
      cancelUrl: ctx.cancel_url ?? "",
      status: "CREATED",
    };
    orders.set(o.id, o);
    res.status(201).json({ id: o.id, status: "PAYER_ACTION_REQUIRED", links: [{ rel: "payer-action", href: `${webBase}/checkoutnow?token=${o.id}` }] });
  });

  // The page the member sees instead of PayPal checkout
  r.get("/checkoutnow", (req, res) => {
    const o = orders.get(String(req.query.token));
    if (!o) return res.status(404).send(page("No encontrado", `<div class="card"><h1>Orden no encontrada</h1></div>`));
    const auth = o.intent === "AUTHORIZE";
    res.send(
      page(
        "PayPal (simulado)",
        `<div class="card"><p class="muted">${o.description}</p><div class="amount">$${o.amount} USD</div>
<p class="muted">${auth ? "Se autoriza el monto, pero no se cobra hasta que te acepten." : "Pagar con tu cuenta PayPal."}</p>
<a class="btn pay" href="${webBase}/checkoutnow/approve?token=${o.id}">${auth ? "Autorizar depósito" : "Pagar ahora"}</a>
<a class="btn cancel" href="${addQuery(o.cancelUrl, { token: o.id })}">Cancelar</a></div>`
      )
    );
  });
  r.get("/checkoutnow/approve", (req, res) => {
    const o = orders.get(String(req.query.token));
    if (!o) return res.status(404).end();
    if (o.status === "CREATED") o.status = "APPROVED";
    res.redirect(addQuery(o.returnUrl, { token: o.id, PayerID: "SIM-PAYER" }));
  });

  r.post("/v2/checkout/orders/:id/capture", (req, res) => {
    const o = orders.get(req.params.id);
    if (!o || o.status === "CREATED") return res.status(422).json({ name: "UNPROCESSABLE_ENTITY", details: [{ issue: "ORDER_NOT_APPROVED" }] });
    if (o.status === "COMPLETED") return res.status(422).json({ name: "UNPROCESSABLE_ENTITY", details: [{ issue: "ORDER_ALREADY_CAPTURED" }] });
    o.status = "COMPLETED";
    o.captureId = sim("CAPTURE");
    captures.push({ id: o.captureId, amount: o.amount, description: o.description, createdAt: new Date() });
    res.status(201).json({ id: o.id, status: "COMPLETED", purchase_units: [{ payments: { captures: [{ id: o.captureId, status: "COMPLETED", custom_id: o.customId }] } }] });
  });
  r.post("/v2/checkout/orders/:id/authorize", (req, res) => {
    const o = orders.get(req.params.id);
    if (!o || o.status === "CREATED") return res.status(422).json({ name: "UNPROCESSABLE_ENTITY", details: [{ issue: "ORDER_NOT_APPROVED" }] });
    if (!o.authorizationId) {
      o.authorizationId = sim("AUTH");
      authorizations.set(o.authorizationId, { amount: o.amount, status: "CREATED" });
      o.status = "COMPLETED";
    }
    res.status(201).json({ id: o.id, status: "COMPLETED", purchase_units: [{ payments: { authorizations: [{ id: o.authorizationId, status: "CREATED" }] } }] });
  });
  r.get("/v2/checkout/orders/:id", (req, res) => {
    const o = orders.get(req.params.id);
    if (!o) return res.status(404).json({ name: "RESOURCE_NOT_FOUND" });
    res.json({
      id: o.id,
      status: o.status,
      purchase_units: [{ payments: o.authorizationId ? { authorizations: [{ id: o.authorizationId }] } : {} }],
    });
  });

  // ---------------- Payments v2 (authorizations)
  r.post("/v2/payments/authorizations/:id/capture", (req, res) => {
    const a = authorizations.get(req.params.id);
    if (!a) return res.status(404).json({ name: "RESOURCE_NOT_FOUND" });
    if (!a.captureId) {
      a.captureId = sim("CAPTURE");
      a.status = "CAPTURED";
      captures.push({ id: a.captureId, amount: a.amount, description: "Depósito de admisión", createdAt: new Date() });
    }
    res.status(201).json({ id: a.captureId, status: "COMPLETED" });
  });
  r.post("/v2/payments/authorizations/:id/void", (req, res) => {
    const a = authorizations.get(req.params.id);
    if (a) a.status = "VOIDED";
    res.status(204).end();
  });

  // ---------------- Payouts v1 (same sender_batch_id is never paid twice)
  r.post("/v1/payments/payouts", (req, res) => {
    const sender = req.body.sender_batch_header?.sender_batch_id;
    const item = req.body.items?.[0] ?? {};
    if (batches.has(sender)) return res.status(400).json({ name: "USER_BUSINESS_ERROR", details: [{ issue: "SENDER_BATCH_ID_ALREADY_USED" }] });
    const batchId = sim("BATCH");
    batches.set(sender, { batchId, email: item.receiver, amount: item.amount?.value, note: item.note ?? "", createdAt: new Date() });
    res.status(201).json({ batch_header: { payout_batch_id: batchId, batch_status: "SUCCESS" } });
  });
  r.get("/v1/payments/payouts/:id", (req, res) => res.json({ batch_header: { payout_batch_id: req.params.id, batch_status: "SUCCESS" } }));

  // ---------------- Invoicing v2
  r.post("/v2/invoicing/invoices", (req, res) => {
    const id = sim("INV");
    const total = (req.body.items ?? []).reduce((s: number, i: any) => s + cents(i.unit_amount?.value ?? "0"), 0);
    invoices.set(id, { total: (total / 100).toFixed(2), email: req.body.primary_recipients?.[0]?.billing_info?.email_address ?? "", status: "DRAFT" });
    res.status(201).json({ id });
  });
  r.post("/v2/invoicing/invoices/:id/send", (req, res) => {
    const inv = invoices.get(req.params.id);
    if (inv) inv.status = "SENT";
    res.json({ href: `${webBase}/invoice/${req.params.id}` });
  });
  r.post("/v2/invoicing/invoices/:id/cancel", (req, res) => {
    const inv = invoices.get(req.params.id);
    if (inv) inv.status = "CANCELLED";
    res.status(204).end();
  });

  // ---------------- Disputes v1: one sample dispute on the first capture, so the screen has content
  r.get("/v1/customer/disputes", (_req, res) => res.json({ items: captures.length ? [{ dispute_id: "SIM-DISPUTE-0001" }] : [] }));
  r.get("/v1/customer/disputes/:id", (_req, res) =>
    res.json({
      dispute_id: "SIM-DISPUTE-0001",
      reason: "MERCHANDISE_OR_SERVICE_NOT_RECEIVED",
      status: "UNDER_REVIEW",
      dispute_life_cycle_stage: "INQUIRY",
      dispute_amount: { value: captures[0]?.amount ?? "0.00", currency_code: "USD" },
      create_time: (captures[0]?.createdAt ?? new Date()).toISOString(),
      disputed_transactions: captures[0] ? [{ seller_transaction_id: captures[0].id }] : [],
    })
  );

  r.post("/v1/notifications/verify-webhook-signature", (_req, res) => res.json({ verification_status: "SUCCESS" }));

  // ---------------- What "PayPal" has seen, to show in a demo
  r.get("/", (_req, res) => {
    const rows = (list: string[][]) => list.map((c) => `<tr>${c.map((x) => `<td>${x}</td>`).join("")}</tr>`).join("") || `<tr><td class="muted">—</td></tr>`;
    res.send(
      page(
        "Panel PayPal simulado",
        `<div class="card"><h1>Cobros</h1><table>${rows(captures.map((c) => [c.id, `$${c.amount}`, c.description]))}</table></div>
<div class="card"><h1>Envíos (Payouts)</h1><table>${rows([...batches.values()].map((b) => [b.batchId, `$${b.amount}`, b.email]))}</table></div>
<div class="card"><h1>Facturas</h1><table>${rows([...invoices.entries()].map(([id, i]) => [id, `$${i.total}`, i.status]))}</table></div>
<div class="card"><h1>Depósitos autorizados</h1><table>${rows([...authorizations.entries()].map(([id, a]) => [id, `$${a.amount}`, a.status]))}</table></div>`
      )
    );
  });

  r.use((req, res) => res.status(404).json({ name: "RESOURCE_NOT_FOUND", path: req.path }));
  return r;
}
