/**
 * End-to-end test of Ayni's money flows against a fake PayPal (in-process HTTP server)
 * and a real, EMPTY Postgres. AI runs in fallback mode (no API key).
 *
 *   E2E_DATABASE_URL=postgresql://.../ayni_e2e npm run test:e2e
 *
 * Checks: idempotency (double webhooks / double clicks), defaults and guarantee coverage,
 * invoices, compensation, money in == money out, admission (deposit authorize/void/capture),
 * newcomer placement, disputes matching and the redirect allow-list.
 */
import http from "http";
import assert from "assert/strict";
import path from "path";
import { execSync } from "child_process";
import { pathToFileURL } from "url";

let PORT = 0; // a free port is picked at start
let n = 0;
const id = (p: string) => `${p}-${++n}`;
const orders = new Map<string, { intent: string; amount: string; customId: string; vault?: boolean }>();
const vaults = new Set<string>(); // payment methods members saved
const vaultCharges = new Map<string, unknown>(); // by PayPal-Request-Id: the same request never charges twice
let failNextVaultCharge = false;
let loseNextVaultResponse = false;
const captures: { id: string; amount: number; source: string }[] = [];
const payouts: { batch: string; email: string; amount: number; type: string; senderItemId: string }[] = [];
const voids: string[] = [];
const invoices: { id: string; total: number; cancelled: boolean }[] = [];
const auths = new Map<string, number>();
const seenBatches = new Set<string>();
const refunds: { id: string; capture: string; requestId: string }[] = [];
let loseNextRefundResponse = false; // PayPal refunds, but our request times out (503)
let failNextRefund = false; // PayPal answers with a definitive error
let searchUnavailable = false; // Transaction Search not enabled for the app (403)
const searchTamper = { omit: new Set<string>(), amount: new Map<string, number>(), extra: [] as { id: string; cents: number }[], status: new Map<string, string>() };
let balanceCents: number | null = 10_000_000; // platform account's available balance; null = the Balances API is not enabled (403)
const FEE_CENTS = 107; // what the fake PayPal reports as its fee on every capture
let loseNextPayoutResponse = false; // PayPal gets the payout but our request times out (503)

const server = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const j = body ? (() => { try { return JSON.parse(body); } catch { return {}; } })() : {};
    const u = req.url!.split("?")[0];
    const send = (code: number, obj?: unknown) => {
      res.writeHead(code, { "Content-Type": "application/json" });
      res.end(obj ? JSON.stringify(obj) : "");
    };
    let m: RegExpMatchArray | null;
    if (u === "/v1/oauth2/token") return send(200, { access_token: "tok", expires_in: 3600 });
    if (u === "/v2/checkout/orders" && req.method === "POST" && j.payment_source?.paypal?.vault_id) {
      // Merchant-initiated charge of a saved method: created and captured in one call.
      const requestId = String(req.headers["paypal-request-id"] ?? "");
      assert.ok(requestId, "automatic charges always carry an idempotency key");
      if (vaultCharges.has(requestId)) return send(201, vaultCharges.get(requestId));
      if (!vaults.has(j.payment_source.paypal.vault_id)) return send(422, { name: "UNPROCESSABLE_ENTITY", details: [{ issue: "PAYMENT_SOURCE_INFO_CANNOT_BE_VERIFIED" }] });
      if (failNextVaultCharge) {
        failNextVaultCharge = false;
        return send(422, { name: "UNPROCESSABLE_ENTITY", details: [{ issue: "INSTRUMENT_DECLINED" }] });
      }
      const pu = j.purchase_units[0];
      const oid = id("ORD");
      const cid = id("CAP");
      const gross = Math.round(Number(pu.amount.value) * 100);
      const usd = (c: number) => ({ currency_code: "USD", value: (c / 100).toFixed(2) });
      captures.push({ id: cid, amount: gross, source: "order" });
      const answer = {
        id: oid,
        status: "COMPLETED",
        purchase_units: [{ payments: { captures: [{ id: cid, custom_id: pu.custom_id, seller_receivable_breakdown: { gross_amount: usd(gross), paypal_fee: usd(FEE_CENTS), net_amount: usd(gross - FEE_CENTS) } }] } }],
      };
      vaultCharges.set(requestId, answer);
      if (loseNextVaultResponse) {
        loseNextVaultResponse = false;
        return send(503, { name: "SERVICE_UNAVAILABLE" });
      }
      return send(201, answer);
    }
    if ((m = u.match(/^\/v3\/vault\/payment-tokens\/([^/]+)$/)) && req.method === "DELETE") {
      vaults.delete(m[1]);
      return send(204);
    }
    if (u === "/v2/checkout/orders" && req.method === "POST") {
      const oid = id("ORD");
      const pu = j.purchase_units[0];
      orders.set(oid, { intent: j.intent, amount: pu.amount.value, customId: pu.custom_id, vault: !!j.payment_source?.paypal?.attributes?.vault });
      return send(201, { id: oid, links: [{ rel: "payer-action", href: `https://sandbox.paypal/approve/${oid}` }] });
    }
    if ((m = u.match(/^\/v2\/checkout\/orders\/([^/]+)\/capture$/))) {
      const o = orders.get(m[1])!;
      const cid = id("CAP");
      captures.push({ id: cid, amount: Math.round(Number(o.amount) * 100), source: "order" });
      const gross = Math.round(Number(o.amount) * 100);
      const usd = (c: number) => ({ currency_code: "USD", value: (c / 100).toFixed(2) });
      const seller_receivable_breakdown = { gross_amount: usd(gross), paypal_fee: usd(FEE_CENTS), net_amount: usd(gross - FEE_CENTS) };
      // The buyer agreed to save their PayPal in this checkout: PayPal answers with the vault token.
      const vaultId = o.vault ? id("VAULT") : undefined;
      if (vaultId) vaults.add(vaultId);
      return send(201, {
        status: "COMPLETED",
        purchase_units: [{ payments: { captures: [{ id: cid, custom_id: o.customId, seller_receivable_breakdown }] } }],
        ...(vaultId ? { payment_source: { paypal: { attributes: { vault: { id: vaultId, status: "VAULTED" } } } } } : {}),
      });
    }
    if ((m = u.match(/^\/v2\/checkout\/orders\/([^/]+)\/authorize$/))) {
      const o = orders.get(m[1])!;
      const aid = id("AUTH");
      auths.set(aid, Math.round(Number(o.amount) * 100));
      return send(201, { status: "COMPLETED", purchase_units: [{ payments: { authorizations: [{ id: aid, status: "CREATED" }] } }] });
    }
    if ((m = u.match(/^\/v2\/checkout\/orders\/([^/]+)$/))) return send(200, { status: "COMPLETED" });
    if ((m = u.match(/^\/v2\/payments\/authorizations\/([^/]+)\/capture$/))) {
      const cid = id("CAP");
      captures.push({ id: cid, amount: auths.get(m[1])!, source: "deposit" });
      return send(201, { id: cid, status: "COMPLETED" });
    }
    if ((m = u.match(/^\/v2\/payments\/authorizations\/([^/]+)\/void$/))) {
      voids.push(m[1]);
      return send(204);
    }
    if ((m = u.match(/^\/v2\/payments\/captures\/([^/]+)\/refund$/))) {
      const requestId = String(req.headers["paypal-request-id"] ?? "");
      assert.ok(requestId, "refunds always carry an idempotency key");
      // Like PayPal: the same request id returns the same refund, and a capture is refunded once.
      const same = refunds.find((r) => r.requestId === requestId);
      if (same) return send(201, { id: same.id, status: "COMPLETED" });
      if (failNextRefund) {
        failNextRefund = false;
        return send(422, { name: "UNPROCESSABLE_ENTITY", details: [{ issue: "REFUND_FAILED_INSUFFICIENT_FUNDS" }] });
      }
      if (refunds.some((r) => r.capture === m![1])) return send(422, { name: "UNPROCESSABLE_ENTITY", details: [{ issue: "CAPTURE_FULLY_REFUNDED" }] });
      const rid = id("REF");
      refunds.push({ id: rid, capture: m[1], requestId });
      if (loseNextRefundResponse) {
        loseNextRefundResponse = false;
        return send(503, { name: "SERVICE_UNAVAILABLE" });
      }
      return send(201, { id: rid, status: "COMPLETED" });
    }
    if (u === "/v1/reporting/transactions") {
      if (searchUnavailable) return send(403, { name: "NOT_AUTHORIZED" });
      const detail = (tid: string, cents: number, code = "T0006", status = "S") => ({ transaction_info: { transaction_id: tid, transaction_event_code: code, transaction_status: status, transaction_amount: { currency_code: "USD", value: (cents / 100).toFixed(2) } } });
      return send(200, {
        total_pages: 1,
        transaction_details: [
          ...captures.filter((c) => !searchTamper.omit.has(c.id)).map((c) => detail(c.id, searchTamper.amount.get(c.id) ?? c.amount, "T0006", searchTamper.status.get(c.id) ?? "S")),
          ...searchTamper.extra.map((x) => detail(x.id, x.cents)),
          detail("REFUND-LINE", -500, "T1107"), // refunds and fees are never counted as charges
          detail("FEE-LINE", 100, "T0300"),
        ],
      });
    }
    if (u === "/v1/reporting/balances") {
      if (balanceCents == null) return send(403, { name: "NOT_AUTHORIZED" });
      return send(200, { balances: [{ currency: "USD", available_balance: { currency_code: "USD", value: (balanceCents / 100).toFixed(2) } }] });
    }
    if (u === "/v1/payments/payouts") {
      const item = j.items[0];
      const senderBatch = j.sender_batch_header.sender_batch_id;
      assert.equal(item.purpose, "NON_GOODS_OR_SERVICES");
      // Like PayPal: the same sender_batch_id is never paid twice.
      if (seenBatches.has(senderBatch)) return send(400, { name: "USER_BUSINESS_ERROR", details: [{ issue: "SENDER_BATCH_ID_ALREADY_USED" }] });
      seenBatches.add(senderBatch);
      const b = id("BATCH");
      payouts.push({ batch: b, email: item.receiver, amount: Math.round(Number(item.amount.value) * 100), type: item.recipient_type, senderItemId: item.sender_item_id });
      if (loseNextPayoutResponse) {
        loseNextPayoutResponse = false;
        return send(503, { name: "SERVICE_UNAVAILABLE" });
      }
      return send(201, { batch_header: { payout_batch_id: b, batch_status: "PENDING" } });
    }
    if (u === "/v2/invoicing/invoices") {
      const iid = id("INV");
      const total = j.items.reduce((s: number, i: any) => s + Math.round(Number(i.unit_amount.value) * 100), 0);
      invoices.push({ id: iid, total, cancelled: false });
      return send(201, { id: iid });
    }
    if ((m = u.match(/^\/v2\/invoicing\/invoices\/([^/]+)\/send$/))) return send(200, {});
    if ((m = u.match(/^\/v2\/invoicing\/invoices\/([^/]+)\/cancel$/))) {
      invoices.find((i) => i.id === m![1])!.cancelled = true;
      return send(204);
    }
    if (u === "/v1/customer/disputes") return send(200, { items: [{ dispute_id: "PP-D-1" }, { dispute_id: "PP-D-2" }] });
    if (u === "/v1/customer/disputes/PP-D-1")
      return send(200, { dispute_id: "PP-D-1", reason: "MERCHANDISE_OR_SERVICE_NOT_RECEIVED", status: "OPEN", dispute_amount: { value: "20.00" }, create_time: "2026-11-04T00:00:00Z", disputed_transactions: [{ seller_transaction_id: captures[0].id }] });
    if (u === "/v1/customer/disputes/PP-D-2")
      return send(200, { dispute_id: "PP-D-2", reason: "UNAUTHORISED", status: "OPEN", dispute_amount: { value: "5.00" }, create_time: "2026-11-04T00:00:00Z", disputed_transactions: [{ seller_transaction_id: "OTHER-SHOP" }] });
    console.error("MOCK 404", req.method, u);
    send(404, { name: "NOT_FOUND" });
  });
});

async function main() {
  await new Promise<void>((r) => server.listen(0, r));
  PORT = (server.address() as import("net").AddressInfo).port;
  const url = process.env.E2E_DATABASE_URL;
  if (!url) throw new Error("Set E2E_DATABASE_URL to an EMPTY throwaway database (the test writes data).");
  Object.assign(process.env, {
    APP_MODE: "live", // this test brings its own fake PayPal, whatever backend/.env says
    DATABASE_URL: url,
    JWT_SECRET: "test",
    PUBLIC_API_URL: "http://localhost:4000",
    APP_WEB_URL: "http://localhost:8081",
    PAYPAL_CLIENT_ID: "x",
    PAYPAL_CLIENT_SECRET: "y",
    PAYPAL_API_BASE: `http://localhost:${PORT}`,
    ANTHROPIC_API_KEY: "",
    DEMO_MEMBER_EMAILS: "rosa@s.com,juan@s.com,marisol@s.com,efrain@s.com,wara@s.com,tomas@s.com,kusi@s.com",
  });
  const root = path.resolve(__dirname, "..");
  const sh = (cmd: string) => execSync(cmd, { cwd: root, env: process.env, stdio: "inherit" });
  sh("npx prisma db push --skip-generate");
  const B = pathToFileURL(root).href;
  const { db: probe } = await import(`${B}/src/db`);
  if ((await probe.group.count()) > 0) throw new Error("E2E_DATABASE_URL is not empty. Use a fresh throwaway database.");
  sh("npx tsx src/seed.ts");
  const { db } = await import(`${B}/src/db`);
  const groups = await import(`${B}/src/services/groups`);
  const payments = await import(`${B}/src/services/payments`);
  const actions = await import(`${B}/src/services/actions`);
  const engine = await import(`${B}/src/services/engine`);
  const admission = await import(`${B}/src/services/admission`);
  const trust = await import(`${B}/src/services/trust`);
  const disputes = await import(`${B}/src/services/disputes`);
  const auth = await import(`${B}/src/auth`);
  const ledger = await import(`${B}/src/services/ledger`);
  const chatSvc = await import(`${B}/src/services/chat`);
  const webhooks = await import(`${B}/src/services/webhooks`);
  const refundSvc = await import(`${B}/src/services/refunds`);
  const autopay = await import(`${B}/src/services/autopay`);
  const recon = await import(`${B}/src/services/reconcile`);

  // ------------------------------------------------ security: redirect allow-list
  assert.equal(auth.isAllowedRedirect("http://localhost:8081/groups/x"), true);
  assert.equal(auth.isAllowedRedirect("ayni://groups/x"), true);
  assert.equal(auth.isAllowedRedirect("http://localhost:8081.evil.com/x"), false);
  assert.equal(auth.isAllowedRedirect("http://localhost.evil.com/x"), false);
  assert.equal(auth.isAllowedRedirect("javascript:alert(1)"), false);
  console.log("✔ redirect allow-list");

  const user = (name: string) => db.user.findFirstOrThrow({ where: { name } });
  const [rosa, juan, marisol, efrain, wara, tomas, kusi] = await Promise.all(
    ["Doña Rosa", "Juan Carlos", "Marisol", "Don Efraín", "Wara", "Tomás", "Kusi"].map(user)
  );

  // ------------------------------------------------ trust profiles from seeded history
  const pe = await trust.trustProfile(efrain.id);
  assert.equal(pe.completed, 1);
  assert.equal(pe.late, 2);
  const pt = await trust.trustProfile(tomas.id);
  assert.equal(pt.onTimePct, 75);
  const pk = await trust.trustProfile(kusi.id);
  assert.equal(pk.isNewcomer, true);
  console.log("✔ trust profiles", { efrain: pe.riskScore, tomas: pt.onTimePct, kusiNew: pk.isNewcomer });

  // ------------------------------------------------ main group: order + start
  const barrio = await db.group.findUniqueOrThrow({ where: { inviteCode: "BARRIO" } });
  // big enough for turn 1 to cover one missed contribution
  await db.group.update({ where: { id: barrio.id }, data: { maxRetentionPct: 50 } });
  const r1 = await groups.setTurnOrder(rosa, barrio.id);
  assert.equal(r1.proposed, true);
  const orderAction = await db.pendingAction.findFirstOrThrow({ where: { groupId: barrio.id, type: "APPROVE_ORDER" } });
  await actions.resolveAction(rosa, orderAction.id, true);
  await groups.startGroup(rosa, barrio.id);
  const members = await db.membership.findMany({ where: { groupId: barrio.id }, include: { user: true }, orderBy: { turn: "asc" } });
  console.log("✔ AI order (fallback) applied:", members.map((m: any) => `${m.turn}.${m.user.name} ${m.retentionPct}%`).join(", "));
  // Efraín has the worst history -> should not be first in the fallback order
  assert.notEqual(members[0].userId, efrain.id);

  const pay = async (u: any, roundNumber: number) => {
    const c = await db.contribution.findFirstOrThrow({
      where: { membership: { userId: u.id, groupId: barrio.id }, round: { number: roundNumber } },
    });
    const { approveUrl } = await payments.startCheckout(u, c.id, `http://localhost:8081/groups/${barrio.id}`);
    assert.ok(approveUrl);
    const oid = (await db.contribution.findUniqueOrThrow({ where: { id: c.id } })).paypalOrderId;
    await payments.completeContribution(oid);
    await payments.completeContribution(oid); // duplicate webhook: idempotent
  };
  const releaseIfReady = async (roundNumber: number) => {
    const round = await db.round.findFirstOrThrow({ where: { groupId: barrio.id, number: roundNumber } });
    await engine.tickGroup(barrio.id);
    const a = await db.pendingAction.findFirstOrThrow({ where: { groupId: barrio.id, type: "RELEASE_POT", status: "PENDING" } });
    await actions.resolveAction(rosa, a.id, true);
    await actions.resolveAction(rosa, a.id, true).catch(() => {}); // double click
    assert.equal((await db.round.findUniqueOrThrow({ where: { id: round.id } })).status, "PAID_OUT");
  };
  const pastFinal = async (roundNumber: number) => {
    const round = await db.round.findFirstOrThrow({ where: { groupId: barrio.id, number: roundNumber } });
    // demo windows: grace = 2 min after due
    await engine.tickGroup(barrio.id, new Date(round.dueAt.getTime() + 3 * 60_000));
  };

  const byTurn = (t: number) => members.find((m: any) => m.turn === t)!.user;
  const first = byTurn(1);
  // The turn-1 member logged in with PayPal, so we know their PayPal account id.
  await db.user.update({ where: { id: first.id }, data: { paypalPayerId: "PAYERID0FIRST" } });

  // Round 1: everyone pays except the LAST-turn member (holds no guarantee) -> waived -> DEFAULTED
  const last = byTurn(5);
  for (const m of members) if (m.userId !== last.id) await pay(m.user, 1);
  await pastFinal(1);
  const waive = await db.pendingAction.findFirstOrThrow({ where: { groupId: barrio.id, type: "WAIVE_CONTRIBUTION" } });
  const inv1 = invoices.length;
  assert.ok(inv1 >= 1, "invoice sent at firm stage");
  await actions.resolveAction(rosa, waive.id, true);
  const defaulted = await db.contribution.findFirstOrThrow({ where: { membership: { userId: last.id, groupId: barrio.id }, round: { number: 1 } } });
  assert.equal(defaulted.status, "DEFAULTED");
  assert.equal(invoices[inv1 - 1].cancelled, true, "invoice cancelled when waived");
  await releaseIfReady(1);
  console.log("✔ round 1: default waived, invoice sent + cancelled, pot released");

  // Round 2: turn-1 member (holds a guarantee) doesn't pay -> covered by guarantee
  for (const m of members) if (m.userId !== first.id) await pay(m.user, 2);
  await pastFinal(2);
  const cov = await db.contribution.findFirstOrThrow({ where: { membership: { userId: first.id, groupId: barrio.id }, round: { number: 2 } } });
  assert.equal(cov.status, "COVERED");
  // Privacy: another member sees it as paid, with no fee, and sees no pending decisions.
  const regular = members.find((m: any) => m.userId !== rosa.id && m.userId !== first.id)!.user;
  const asOther = await groups.groupDetail(regular, barrio.id);
  const otherView = asOther.rounds.find((r: any) => r.number === 2)!.contributions.find((c: any) => c.id === cov.id);
  assert.equal(otherView.status, "PAID");
  assert.equal(otherView.lateFeeCents, 0);
  assert.equal(asOther.actions.length, 0);
  const asSelf = await groups.groupDetail(first, barrio.id);
  assert.equal(asSelf.rounds.find((r: any) => r.number === 2)!.contributions.find((c: any) => c.id === cov.id).status, "COVERED");
  const chatTexts = (await db.chatMessage.findMany({ where: { groupId: barrio.id } })).map((m: any) => m.content).join("\n");
  assert.ok(!/garant[ií]a/i.test(chatTexts.replace(/garantía retenida: \$[\d.]+/g, "")), "group chat must not say who used their guarantee");
  await releaseIfReady(2);
  console.log("✔ round 2: covered with guarantee, private to the member and the organizer");

  // Round 3: PayPal receives the pot but the response is lost -> UNKNOWN -> retried with the SAME id.
  for (const m of members) await pay(m.user, 3);
  loseNextPayoutResponse = true;
  const payoutsBefore = payouts.length;
  await releaseIfReady(3);
  const unknown = await db.payout.findFirstOrThrow({ where: { status: "UNKNOWN" } });
  await db.payout.update({ where: { id: unknown.id }, data: { createdAt: new Date(Date.now() - 120_000) } });
  await payments.retryUnknownPayouts();
  assert.equal((await db.payout.findUniqueOrThrow({ where: { id: unknown.id } })).status, "SENT");
  assert.equal(payouts.length, payoutsBefore + 1, "the retried pot was paid exactly once");
  console.log("✔ round 3: lost PayPal response -> UNKNOWN -> same-id retry, paid once");

  // Round 4: everyone pays, but the platform's PayPal account is short. Nothing may be sent.
  for (const m of members) await pay(m.user, 4);
  balanceCents = 100;
  await engine.tickGroup(barrio.id);
  const lowAction = await db.pendingAction.findFirstOrThrow({ where: { groupId: barrio.id, type: "RELEASE_POT", status: "PENDING" } });
  const sentBeforeLow = payouts.length;
  await assert.rejects(actions.resolveAction(rosa, lowAction.id, true), /platform_balance_low/);
  await assert.rejects(actions.resolveAction(rosa, lowAction.id, true), /platform_balance_low/);
  assert.equal(payouts.length, sentBeforeLow, "no payout left while the balance was short");
  assert.equal((await db.round.findFirstOrThrow({ where: { groupId: barrio.id, number: 4 } })).status, "READY");
  assert.equal((await db.pendingAction.findUniqueOrThrow({ where: { id: lowAction.id } })).status, "PENDING", "the decision is still there to try again");
  assert.equal(await db.notification.count({ where: { userId: rosa.id, title: "Saldo insuficiente en PayPal" } }), 1, "told once, not on every attempt");
  // The silent timeout hits the same wall, and keeps the decision alive as well.
  await db.pendingAction.update({ where: { id: lowAction.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
  await engine.tickGroup(barrio.id);
  assert.equal(payouts.length, sentBeforeLow);
  assert.equal((await db.pendingAction.findUniqueOrThrow({ where: { id: lowAction.id } })).status, "PENDING");
  // If PayPal cannot tell us the balance (feature not enabled), that is "unknown", not "zero": the pot goes out.
  balanceCents = null;
  await releaseIfReady(4);
  assert.ok(payouts.length > sentBeforeLow);
  balanceCents = 10_000_000;
  console.log("✔ round 4: pot held back while the platform balance was short, released afterwards");

  // Round 5: everyone pays. The defaulter receives: their debt goes to round-1's recipient.
  for (const m of members) await pay(m.user, 5);
  await releaseIfReady(5);
  const g = await db.group.findUniqueOrThrow({ where: { id: barrio.id } });
  assert.equal(g.status, "FINISHED");
  const comp = await db.payout.findMany({ where: { kind: "COMPENSATION" } });
  assert.equal(comp.length, 1);
  assert.equal(comp[0].amountCents, 2000);

  // Money conservation: everything captured for this group == everything paid out.
  const capturedIn = captures.filter((c) => c.source === "order").reduce((s, c) => s + c.amount, 0);
  const paidOut = payouts.reduce((s, p) => s + p.amount, 0);
  const held = await db.membership.aggregate({ where: { groupId: barrio.id }, _sum: { retentionHeldCents: true } });
  console.log("   in:", capturedIn, "out:", paidOut, "still held:", held._sum.retentionHeldCents);
  assert.equal(held._sum.retentionHeldCents, 0);
  assert.equal(capturedIn, paidOut, "money in == money out");
  console.log("✔ rounds 3-5, compensation paid, group FINISHED, money in == money out");

  const pLast = await trust.trustProfile(last.id);
  assert.equal(pLast.abandoned, 1);

  // ------------------------------------------------ payouts: who receives, and what PayPal says afterwards
  const toFirst = payouts.filter((p) => p.email === "PAYERID0FIRST");
  assert.ok(toFirst.length >= 1 && toFirst.every((p) => p.type === "PAYPAL_ID"), "known PayPal account: paid by account id");
  assert.ok(payouts.filter((p) => p.email !== "PAYERID0FIRST").every((p) => p.type === "EMAIL" && p.email.includes("@")), "otherwise paid by email");

  const somePayout = await db.payout.findFirstOrThrow({ where: { membership: { groupId: barrio.id }, kind: "POT", status: "SENT" }, include: { membership: true } });
  const item = (type: string) => ({ event_type: `PAYMENT.PAYOUTS-ITEM.${type}`, resource: { payout_item_id: "ITEM-1", payout_item: { sender_item_id: somePayout.id } } });
  const status = async () => (await db.payout.findUniqueOrThrow({ where: { id: somePayout.id } })).status;
  const notes = (userId: string, title: string) => db.notification.count({ where: { userId, title } });
  // Unclaimed: PayPal holds the money for the member. Not failed, so it cannot be sent a second time.
  await webhooks.handleWebhook(item("UNCLAIMED"));
  await webhooks.handleWebhook(item("UNCLAIMED"));
  assert.equal(await status(), "SENT");
  assert.equal(await notes(somePayout.membership.userId, "Tu dinero te espera en PayPal"), 1, "told once, even if PayPal repeats the event");
  await assert.rejects(payments.retryPayout(rosa, somePayout.id), /not_failed/);
  // Returned to us: now it failed, the organizer is told (once) and may send it again.
  await webhooks.handleWebhook(item("RETURNED"));
  await webhooks.handleWebhook(item("FAILED"));
  assert.equal(await status(), "FAILED");
  assert.equal(await notes(rosa.id, "Un envío no llegó"), 1);
  const sentBefore = payouts.length;
  assert.equal((await payments.retryPayout(rosa, somePayout.id)).ok, true);
  await assert.rejects(payments.retryPayout(rosa, somePayout.id), /not_failed/);
  assert.equal(payouts.length, sentBefore + 1, "re-sent exactly once");
  const resent = await db.payout.findFirstOrThrow({ where: { id: (await db.payout.findUniqueOrThrow({ where: { id: somePayout.id } })).retriedById! } });
  // The new payout succeeds; a late FAILED for it must not undo that.
  const item2 = (type: string) => ({ event_type: `PAYMENT.PAYOUTS-ITEM.${type}`, resource: { payout_item_id: "ITEM-2", payout_item: { sender_item_id: resent.id } } });
  await webhooks.handleWebhook(item2("SUCCEEDED"));
  await webhooks.handleWebhook(item2("FAILED"));
  assert.equal((await db.payout.findUniqueOrThrow({ where: { id: resent.id } })).status, "SUCCEEDED");
  await webhooks.handleWebhook({ event_type: "SOMETHING.ELSE", resource: {} }); // unknown events are ignored
  console.log("✔ payouts: by PayPal account id, unclaimed is not failed, states never go backwards");

  // ------------------------------------------------ payment history (ledger)
  const asOrganizer = await ledger.groupLedger(rosa, barrio.id);
  assert.equal(asOrganizer.totals.inCents, capturedIn, "ledger: charged == what PayPal captured");
  assert.equal(asOrganizer.totals.outCents, paidOut, "ledger: sent == what PayPal paid out (a re-sent payout counts once)");
  assert.equal(asOrganizer.guaranteeHeldCents, 0);
  const paidRows = asOrganizer.entries.filter((e: any) => e.type === "CONTRIBUTION");
  assert.ok(paidRows.length > 0 && paidRows.every((e: any) => e.feeCents === FEE_CENTS && e.ref), "PayPal fee and reference stored per capture");
  assert.equal(asOrganizer.totals.feesCents, FEE_CENTS * paidRows.length);
  assert.equal(asOrganizer.entries.filter((e: any) => e.type === "UNPAID").length, 1);
  assert.equal(asOrganizer.entries.filter((e: any) => e.type === "GUARANTEE_COVER").length, 1);
  assert.equal(asOrganizer.entries.filter((e: any) => e.type === "COMPENSATION").length, 1);
  // A regular member: no unpaid / covered / compensation rows of other people, no references of others.
  const asMember = await ledger.groupLedger(regular, barrio.id);
  const others = asMember.entries.filter((e: any) => !e.mine);
  assert.ok(others.every((e: any) => (e.type === "CONTRIBUTION" || e.type === "POT") && e.ref === null && e.feeCents === null && e.lateFeeCents === 0));
  assert.ok(asMember.entries.some((e: any) => e.mine && e.ref), "own rows keep their PayPal reference");
  await assert.rejects(ledger.groupLedger(kusi, barrio.id), /not_a_member/);
  // "My payments" across groups: only this person's rows, and it adds up with what they paid here.
  const mineAll = await ledger.myLedger(regular);
  assert.ok(mineAll.entries.length > 0 && mineAll.entries.every((e: any) => e.mine && e.groupName));
  const paidHere = asMember.entries.filter((e: any) => e.mine && e.direction === "in").reduce((s: number, e: any) => s + e.amountCents, 0);
  assert.equal(mineAll.entries.filter((e: any) => e.groupId === barrio.id && e.direction === "in").reduce((s: number, e: any) => s + e.amountCents, 0), paidHere);
  console.log("✔ payment history: totals match PayPal, fee per capture, private rows stay private");

  // ------------------------------------------------ disputes matched to the group
  const ds = await disputes.groupDisputes(barrio.id);
  assert.equal(ds.length, 1);
  assert.equal(ds[0].id, "PP-D-1");
  console.log("✔ disputes filtered to this group:", ds[0].memberName, ds[0].reason);

  // ------------------------------------------------ open group admission
  const open = await db.group.findUniqueOrThrow({ where: { inviteCode: "ABIERT" } });
  const redirect = "http://localhost:8081/explore";
  const ex = await admission.exploreOpenGroups(tomas);
  const exOpen = ex.groups.find((x: any) => x.id === open.id);
  assert.equal(exOpen.check.borderline, true);

  // Tomás: borderline -> deposit -> AI (fallback) recommends -> organizer approves
  const t1 = await admission.requestToJoin(tomas, open.id, { message: "Soy puntual", redirect });
  assert.ok(t1.approveUrl);
  const tReq = await db.joinRequest.findUniqueOrThrow({ where: { id: t1.request.id } });
  await admission.completeDeposit(tReq.paypalOrderId);
  await admission.completeDeposit(tReq.paypalOrderId); // idempotent
  const admit = await db.pendingAction.findFirstOrThrow({ where: { groupId: open.id, type: "ADMIT_MEMBER", status: "PENDING" } });
  const detail = await groups.groupDetail(marisol, open.id);
  assert.equal(detail.requests.length, 1);
  assert.ok(detail.requests[0].aiReason);
  await actions.resolveAction(marisol, admit.id, true);
  const tm = await db.membership.findUniqueOrThrow({ where: { userId_groupId: { userId: tomas.id, groupId: open.id } } });
  assert.ok(tm.depositCaptureId);
  console.log("✔ Tomás: borderline, AI recommended, organizer accepted, deposit captured");

  // Kusi: newcomer, meets (newcomers accepted) -> auto-accepted after the deposit
  const k1 = await admission.requestToJoin(kusi, open.id, { redirect });
  await admission.completeDeposit((await db.joinRequest.findUniqueOrThrow({ where: { id: k1.request.id } })).paypalOrderId);
  const km = await db.membership.findUniqueOrThrow({ where: { userId_groupId: { userId: kusi.id, groupId: open.id } } });
  assert.equal(km.isNewcomer, true);
  console.log("✔ Kusi: newcomer auto-accepted");

  // The defaulter from the barrio group now has an abandoned pasanaku -> rejected at once, no money touched
  const before = orders.size;
  const d1 = await admission.requestToJoin(last, open.id, { redirect });
  assert.equal(d1.request.status, "REJECTED");
  assert.equal(d1.approveUrl, null);
  assert.equal(orders.size, before);
  console.log("✔ member with an abandoned pasanaku rejected without touching their money");

  // Juan Carlos: manual-rejected path on a MANUAL group voids the deposit
  await db.group.update({ where: { id: open.id }, data: { admissionMode: "MANUAL" } });
  const j1 = await admission.requestToJoin(juan, open.id, { redirect });
  await admission.completeDeposit((await db.joinRequest.findUniqueOrThrow({ where: { id: j1.request.id } })).paypalOrderId);
  const jAct = await db.pendingAction.findFirstOrThrow({ where: { groupId: open.id, type: "ADMIT_MEMBER", status: "PENDING" } });
  const voidsBefore = voids.length;
  await actions.resolveAction(marisol, jAct.id, false);
  assert.equal(voids.length, voidsBefore + 1);
  assert.equal((await db.joinRequest.findUniqueOrThrow({ where: { id: j1.request.id } })).status, "REJECTED");
  console.log("✔ manual rejection voids the deposit");

  // Order: Kusi (newcomer) must land in the second half with extra guarantee; deposits count as round 1
  await groups.setTurnOrder(marisol, open.id);
  const om = await db.membership.findMany({ where: { groupId: open.id }, include: { user: true }, orderBy: { turn: "asc" } });
  const kTurn = om.find((m: any) => m.userId === kusi.id)!;
  assert.ok(kTurn.turn! > Math.floor(om.length / 2), `newcomer turn ${kTurn.turn} of ${om.length}`);
  await groups.startGroup(marisol, open.id);
  const r1c = await db.contribution.findMany({ where: { round: { groupId: open.id, number: 1 }, status: "PAID" } });
  assert.equal(r1c.length, 2, "Tomás and Kusi deposits are their round-1 contributions");
  console.log("✔ open group order:", om.map((m: any) => `${m.turn}.${m.user.name} ${m.retentionPct}%`).join(", "));

  // ------------------------------------------------ PayPal refunds / reversals on a running group
  const refundEvent = (type: string, refundId: string, captureId: string, value: string) => ({
    event_type: `PAYMENT.CAPTURE.${type}`,
    resource: { id: refundId, amount: { value, currency_code: "USD" }, links: [{ rel: "up", href: `https://api.sandbox.paypal.com/v2/payments/captures/${captureId}` }] },
  });
  const roundOne = async (u: any) => db.contribution.findFirstOrThrow({ where: { membership: { userId: u.id, groupId: open.id }, round: { number: 1 } }, include: { round: true } });
  const tomasR1 = await roundOne(tomas);
  assert.equal(tomasR1.status, "PAID");
  const whole = (tomasR1.amountCents / 100).toFixed(2);
  // The pot has not left: a full refund simply makes the contribution pending again.
  await webhooks.handleWebhook(refundEvent("REFUNDED", "PP-REFUND-1", tomasR1.paypalCaptureId, whole));
  await webhooks.handleWebhook(refundEvent("REFUNDED", "PP-REFUND-1", tomasR1.paypalCaptureId, whole)); // repeated delivery
  const reopened = await roundOne(tomas);
  assert.equal(reopened.status, "PENDING");
  assert.equal(reopened.paypalCaptureId, null);
  assert.equal(await db.refund.count({ where: { paypalRefundId: "PP-REFUND-1" } }), 1);
  assert.equal(await db.notification.count({ where: { userId: marisol.id, title: "PayPal devolvió un aporte" } }), 1, "the organizer is told once");
  // In the books the charge is gone, so the refund must not be subtracted again.
  const openLedger = await ledger.groupLedger(marisol, open.id);
  const refundRow = openLedger.entries.find((e: any) => e.type === "REFUND");
  assert.equal(refundRow.direction, "none");
  assert.equal(openLedger.totals.outCents, 0);
  // A partial reversal (a dispute partly lost): the contribution stays paid, the organizer is told.
  const kusiR1 = await roundOne(kusi);
  await webhooks.handleWebhook(refundEvent("REVERSED", "PP-REVERSAL-1", kusiR1.paypalCaptureId, "5.00"));
  assert.equal((await roundOne(kusi)).status, "PAID");
  assert.equal((await db.refund.findUniqueOrThrow({ where: { paypalRefundId: "PP-REVERSAL-1" } })).reason, "PAYPAL_REVERSAL");
  // A refund of some other shop's capture is not ours.
  await webhooks.handleWebhook(refundEvent("REFUNDED", "PP-REFUND-X", "OTHER-SHOP-CAPTURE", "9.00"));
  assert.equal(await db.refund.count({ where: { paypalRefundId: "PP-REFUND-X" } }), 0);
  // Tomás pays again; PayPal denies a payment under review: nothing is recorded as paid, he is told.
  const again = await payments.startCheckout(tomas, reopened.id, `http://localhost:8081/groups/${open.id}`);
  await webhooks.handleWebhook({ event_type: "PAYMENT.CAPTURE.DENIED", resource: { id: "CAP-DENIED", supplementary_data: { related_ids: { order_id: again.orderId } } } });
  assert.equal((await roundOne(tomas)).status, "PENDING");
  assert.equal(await db.notification.count({ where: { userId: tomas.id, body: { contains: "no aprobó tu pago" } } }), 1);
  // A dispute is resolved: the organizer learns the outcome without opening PayPal.
  await webhooks.handleWebhook({
    event_type: "CUSTOMER.DISPUTE.RESOLVED",
    resource: { dispute_id: "PP-D-9", status: "RESOLVED", dispute_outcome: { outcome_code: "RESOLVED_SELLER_FAVOUR" }, disputed_transactions: [{ seller_transaction_id: kusiR1.paypalCaptureId }] },
  });
  const resolved = await db.notification.findFirstOrThrow({ where: { userId: marisol.id, title: { startsWith: "Disputa resuelta" } } });
  assert.ok(resolved.body.includes("a favor del grupo"));
  console.log("✔ PayPal refunds and reversals: contribution reopened or flagged, denied payment, dispute outcome");

  // ------------------------------------------------ cancel a pasanaku before it starts: deposits go back
  const cancelable = await groups.createGroup(wara, {
    name: "Pasanaku que se cancela", contributionCents: 3000, frequency: "WEEKLY", orderMethod: "LOTTERY", maxMembers: 6, lateFeePct: 5, maxRetentionPct: 25, demoMode: false,
    isOpen: true, admissionMode: "MANUAL", minCompleted: 0, minOnTimePct: 0, maxLate: null, acceptNewcomers: true, requireDeposit: true,
  });
  const apply = async (u: any) => {
    const { request } = await admission.requestToJoin(u, cancelable.id, { redirect });
    await admission.completeDeposit((await db.joinRequest.findUniqueOrThrow({ where: { id: request.id } })).paypalOrderId);
    return request.id;
  };
  const admitTo = async (requestId: string) => {
    const acts = await db.pendingAction.findMany({ where: { groupId: cancelable.id, type: "ADMIT_MEMBER", status: "PENDING" } });
    await actions.resolveAction(wara, acts.find((a: any) => a.payload.requestId === requestId).id, true);
  };
  for (const u of [marisol, juan, efrain]) await admitTo(await apply(u)); // accepted: deposits charged
  const rosaReq = await apply(rosa); // still waiting: only a hold
  const kusiReq = await apply(kusi);
  // PayPal released Kusi's hold on its own (it expired): nothing to void later, both are told.
  const kusiAuth = (await db.joinRequest.findUniqueOrThrow({ where: { id: kusiReq } })).authorizationId;
  await webhooks.handleWebhook({ event_type: "PAYMENT.AUTHORIZATION.VOIDED", resource: { id: kusiAuth } });
  const kusiAfter = await db.joinRequest.findUniqueOrThrow({ where: { id: kusiReq } });
  assert.equal(kusiAfter.authorizationId, null);
  assert.equal(kusiAfter.status, "PENDING", "the organizer can still decide");

  const depositIn = async () => (await ledger.groupLedger(wara, cancelable.id)).totals.inCents;
  assert.equal(await depositIn(), 9000, "three deposits charged");
  await assert.rejects(refundSvc.cancelGroup(marisol, cancelable.id), /organizer_only/);
  const voidsBeforeCancel = voids.length;
  const refundsBefore = refunds.length;
  loseNextRefundResponse = true; // first refund: PayPal does it but we never hear back
  failNextRefund = false;
  const cancelled = await refundSvc.cancelGroup(wara, cancelable.id);
  assert.equal(cancelled.refunds, 3);
  await assert.rejects(refundSvc.cancelGroup(wara, cancelable.id), /already_cancelled/);
  assert.equal((await db.group.findUniqueOrThrow({ where: { id: cancelable.id } })).status, "CANCELLED");
  assert.equal(voids.length, voidsBeforeCancel + 1, "Rosa's hold released; Kusi's was already gone");
  assert.equal((await db.joinRequest.findUniqueOrThrow({ where: { id: rosaReq } })).status, "REJECTED");
  assert.equal(await db.pendingAction.count({ where: { groupId: cancelable.id, status: "PENDING" } }), 0);
  assert.equal(refunds.length, refundsBefore + 3);
  // One refund has an unknown outcome: it stays pending and is retried with the SAME key -> still refunded once.
  const pendingRefund = await db.refund.findFirstOrThrow({ where: { groupId: cancelable.id, status: "PENDING" } });
  await db.refund.update({ where: { id: pendingRefund.id }, data: { createdAt: new Date(Date.now() - 120_000) } });
  await refundSvc.retryPendingRefunds();
  assert.equal((await db.refund.findUniqueOrThrow({ where: { id: pendingRefund.id } })).status, "COMPLETED");
  assert.equal(refunds.length, refundsBefore + 3, "the retried refund was not sent twice");
  // Money conservation for the cancelled group: every deposit charged went back.
  const cancelledLedger = await ledger.groupLedger(wara, cancelable.id);
  assert.equal(cancelledLedger.totals.inCents, 9000);
  assert.equal(cancelledLedger.totals.outCents, 9000);
  const marisolLedger = await ledger.groupLedger(marisol, cancelable.id);
  assert.deepEqual(marisolLedger.entries.map((e: any) => e.type).sort(), ["DEPOSIT", "REFUND"], "a member only sees their own deposit and refund");
  // Nothing can happen in a cancelled group.
  await assert.rejects(groups.startGroup(wara, cancelable.id), /set_order_first/);
  await assert.rejects(groups.joinGroup(tomas, cancelable.inviteCode), /group_already_started/);
  await assert.rejects(admission.requestToJoin(tomas, cancelable.id, { redirect }), /not_found/);
  // Our own refund also arrives as a webhook: it confirms the record, it does not create another.
  const done = await db.refund.findFirstOrThrow({ where: { groupId: cancelable.id, status: "COMPLETED", paypalRefundId: { not: null } } });
  await webhooks.handleWebhook(refundEvent("REFUNDED", done.paypalRefundId, done.captureId, "30.00"));
  assert.equal(await db.refund.count({ where: { groupId: cancelable.id } }), 3);

  // PayPal rejects a refund: FAILED, the organizer is told and retries it once.
  const second = await groups.createGroup(wara, {
    name: "Otro que se cancela", contributionCents: 1500, frequency: "WEEKLY", orderMethod: "LOTTERY", maxMembers: 4, lateFeePct: 5, maxRetentionPct: 25, demoMode: false,
    isOpen: true, admissionMode: "AUTO", minCompleted: 0, minOnTimePct: 0, maxLate: null, acceptNewcomers: true, requireDeposit: true,
  });
  const { request: mReq } = await admission.requestToJoin(marisol, second.id, { redirect });
  await admission.completeDeposit((await db.joinRequest.findUniqueOrThrow({ where: { id: mReq.id } })).paypalOrderId); // AUTO: accepted, deposit charged
  failNextRefund = true;
  await refundSvc.cancelGroup(wara, second.id);
  const failedRefund = await db.refund.findFirstOrThrow({ where: { groupId: second.id } });
  assert.equal(failedRefund.status, "FAILED");
  assert.equal((await groups.groupDetail(wara, second.id)).failedRefunds.length, 1);
  assert.equal((await groups.groupDetail(marisol, second.id)).failedRefunds.length, 0, "only the organizer sees failed refunds");
  await assert.rejects(refundSvc.retryRefund(marisol, failedRefund.id), /organizer_only/);
  assert.equal((await refundSvc.retryRefund(wara, failedRefund.id)).ok, true);
  await assert.rejects(refundSvc.retryRefund(wara, failedRefund.id), /not_failed/);
  assert.equal(refunds.filter((r) => r.capture === failedRefund.captureId).length, 1);
  console.log("✔ cancel before start: deposits refunded once, holds released, failed refund retried");

  // ------------------------------------------------ automatic payment with a saved PayPal (vault)
  {
    const auto = await groups.createGroup(wara, { name: "Pasanaku automático", contributionCents: 2500, frequency: "WEEKLY", orderMethod: "LOTTERY", maxMembers: 4, lateFeePct: 5, maxRetentionPct: 0, demoMode: true, demoRoundMinutes: 4 });
    for (const u of [rosa, juan, efrain]) await groups.joinGroup(u, auto.inviteCode);
    await groups.setTurnOrder(wara, auto.id);
    await groups.startGroup(wara, auto.id);
    const back = `http://localhost:8081/groups/${auto.id}`;
    const mine = (u: any, n: number) => db.contribution.findFirstOrThrow({ where: { membership: { userId: u.id, groupId: auto.id }, round: { number: n } } });
    const round = (n: number) => db.round.findFirstOrThrow({ where: { groupId: auto.id, number: n } });
    const payManually = async (u: any, n: number, save = false) => {
      const c = await mine(u, n);
      await payments.startCheckout(u, c.id, back, false, save);
      await payments.completeContribution((await db.contribution.findUniqueOrThrow({ where: { id: c.id } })).paypalOrderId);
    };
    const release = async (n: number) => {
      await engine.tickGroup(auto.id);
      const a = await db.pendingAction.findFirstOrThrow({ where: { groupId: auto.id, type: "RELEASE_POT", status: "PENDING" } });
      await actions.resolveAction(wara, a.id, true);
      assert.equal((await round(n)).status, "PAID_OUT");
    };
    const before = (r: { dueAt: Date }, seconds: number) => new Date(r.dueAt.getTime() - seconds * 1000);
    const notices = (u: any, title: string) => db.notification.count({ where: { userId: u.id, groupId: auto.id, title } });
    const membership = (u: any) => db.membership.findUniqueOrThrow({ where: { userId_groupId: { userId: u.id, groupId: auto.id } } });

    // Without a saved method it cannot be turned on.
    await assert.rejects(autopay.setAutoPay(juan, auto.id, true), /no_saved_method/);
    // Round 1: Juan pays and asks PayPal to save his method. Rosa pays normally: nothing is saved for her.
    await payManually(juan, 1, true);
    await payManually(rosa, 1);
    await payManually(efrain, 1);
    await payManually(wara, 1);
    const juanNow = await db.user.findUniqueOrThrow({ where: { id: juan.id } });
    assert.ok(juanNow.paypalVaultId && vaults.has(juanNow.paypalVaultId));
    assert.equal((await membership(juan)).autoPay, true);
    assert.equal((await db.user.findUniqueOrThrow({ where: { id: rosa.id } })).paypalVaultId, null);
    assert.equal((await membership(rosa)).autoPay, false);
    // Other members cannot see who pays automatically; the API never returns the token.
    const asRosa = await groups.groupDetail(rosa, auto.id);
    assert.ok(asRosa.memberships.every((m: any) => m.autoPay === false) && asRosa.hasSavedMethod === false);
    const asJuan = await groups.groupDetail(juanNow, auto.id);
    assert.ok(asJuan.autoPay === true && asJuan.hasSavedMethod === true);
    await release(1);

    // Round 2 (demo: lead = 2 min). First a notice, later the charge. Never the other way round.
    const r2 = await round(2);
    const capturesStart = captures.length;
    await engine.tickGroup(auto.id, before(r2, 200)); // too early
    assert.equal(await notices(juan, "Pago automático: aviso"), 0);
    await engine.tickGroup(auto.id, before(r2, 110)); // inside the window: tell him
    await engine.tickGroup(auto.id, before(r2, 105));
    assert.equal(await notices(juan, "Pago automático: aviso"), 1, "told once");
    assert.equal((await mine(juan, 2)).status, "PENDING");
    assert.equal(captures.length, capturesStart, "the notice never charges");
    await engine.tickGroup(auto.id, before(r2, 50)); // second half of the window: charge
    await engine.tickGroup(auto.id, before(r2, 45));
    const paid2 = await mine(juan, 2);
    assert.equal(paid2.status, "PAID");
    assert.ok(paid2.paypalCaptureId && paid2.paypalFeeCents === FEE_CENTS && paid2.lateFeeCents === 0);
    assert.equal(captures.length, capturesStart + 1, "charged exactly once");
    assert.equal(await notices(juan, "Aporte cobrado"), 1);
    assert.equal((await mine(rosa, 2)).status, "PENDING", "members without automatic payment are never charged");
    for (const u of [rosa, efrain, wara]) await payManually(u, 2);
    await release(2);

    // Round 3: PayPal charges but the answer is lost. The retry uses the same key: still one charge.
    const r3 = await round(3);
    await engine.tickGroup(auto.id, before(r3, 110));
    loseNextVaultResponse = true;
    const before3 = captures.length;
    await engine.tickGroup(auto.id, before(r3, 50));
    assert.equal((await mine(juan, 3)).status, "PENDING");
    await engine.tickGroup(auto.id, before(r3, 40));
    assert.equal((await mine(juan, 3)).status, "PAID");
    assert.equal(captures.length, before3 + 1, "the lost answer did not become a second charge");
    for (const u of [rosa, efrain, wara]) await payManually(u, 3);
    await release(3);

    // Round 4: PayPal declines. He is told, it is not tried again, and he pays by hand.
    const r4 = await round(4);
    await engine.tickGroup(auto.id, before(r4, 110));
    failNextVaultCharge = true;
    const before4 = captures.length;
    await engine.tickGroup(auto.id, before(r4, 50));
    await engine.tickGroup(auto.id, before(r4, 40));
    assert.equal((await mine(juan, 4)).status, "PENDING");
    assert.equal(captures.length, before4);
    assert.equal(await db.notification.count({ where: { userId: juan.id, groupId: auto.id, body: { contains: "No pudimos cobrar" } } }), 1);
    await payManually(juan, 4);
    // A second capture for a contribution that is already paid (an old order approved late) is refunded at once.
    const paid4 = await mine(juan, 4);
    const refundsBeforeDup = refunds.length;
    const stray = { event_type: "PAYMENT.CAPTURE.COMPLETED", resource: { id: "CAP-STRAY-1", custom_id: paid4.id, amount: { value: "25.00" }, supplementary_data: { related_ids: { order_id: "ORD-STRAY-1" } } } };
    await webhooks.handleWebhook(stray);
    await webhooks.handleWebhook(stray);
    assert.equal(refunds.length, refundsBeforeDup + 1, "refunded once");
    assert.equal(refunds.at(-1)!.capture, "CAP-STRAY-1");
    assert.equal((await mine(juan, 4)).paypalCaptureId, paid4.paypalCaptureId, "the original payment stays");
    assert.equal(await notices(juan, "Cobro duplicado devuelto"), 1);
    // A capture smaller than the contribution is never accepted as its payment.
    const rosa4 = await mine(rosa, 4);
    await webhooks.handleWebhook({ event_type: "PAYMENT.CAPTURE.COMPLETED", resource: { id: "CAP-SMALL", custom_id: rosa4.id, amount: { value: "1.00" } } });
    assert.equal((await mine(rosa, 4)).status, "PENDING");

    // Turning it off after the notice stops the charge; removing the method deletes it at PayPal.
    const two = await groups.createGroup(juanNow, { name: "Otro automático", contributionCents: 1000, frequency: "WEEKLY", orderMethod: "LOTTERY", maxMembers: 2, lateFeePct: 5, maxRetentionPct: 0, demoMode: true, demoRoundMinutes: 4 });
    await groups.joinGroup(rosa, two.inviteCode);
    await groups.setTurnOrder(juanNow, two.id);
    await groups.startGroup(juanNow, two.id);
    await autopay.setAutoPay(juanNow, two.id, true); // he already has a saved method: one tap, no checkout
    const t1 = await db.round.findFirstOrThrow({ where: { groupId: two.id, number: 1 } });
    await engine.tickGroup(two.id, before(t1, 110));
    assert.equal(await db.notification.count({ where: { userId: juan.id, groupId: two.id, title: "Pago automático: aviso" } }), 1);
    await autopay.setAutoPay(juanNow, two.id, false);
    const beforeOff = captures.length;
    await engine.tickGroup(two.id, before(t1, 50));
    assert.equal(captures.length, beforeOff, "switched off after the notice: not charged");
    const token = juanNow.paypalVaultId;
    await autopay.removeSavedMethod(juanNow);
    assert.equal(vaults.has(token), false, "deleted at PayPal too");
    assert.equal((await db.user.findUniqueOrThrow({ where: { id: juan.id } })).paypalVaultId, null);
    assert.equal(await db.membership.count({ where: { userId: juan.id, autoPay: true } }), 0);
    // If the member removes Ayni inside PayPal, the webhook switches everything off as well.
    await db.user.update({ where: { id: rosa.id }, data: { paypalVaultId: "VAULT-GONE" } });
    await db.membership.updateMany({ where: { userId: rosa.id, groupId: two.id }, data: { autoPay: true } });
    await webhooks.handleWebhook({ event_type: "VAULT.PAYMENT-TOKEN.DELETED", resource: { id: "VAULT-GONE" } });
    assert.equal((await db.user.findUniqueOrThrow({ where: { id: rosa.id } })).paypalVaultId, null);
    assert.equal(await db.membership.count({ where: { userId: rosa.id, autoPay: true } }), 0);
    console.log("✔ automatic payment: notice before charge, charged once, lost answer, decline, duplicate refunded, switch off");

    // ---- claims: report a problem inside Ayni, linked to PayPal disputes through the capture id
    const claimsSvc = await import(`${B}/src/services/claims`);
    const juan4 = await mine(juan, 4);
    const rosa3 = await mine(rosa, 3);
    const juan3 = await mine(juan, 3);
    const efrain3 = await mine(efrain, 3);
    const rosa4Pending = await mine(rosa, 4);
    const dispute = (id: string, captureId: string, type = "CREATED", extra: any = {}) => ({
      event_type: `CUSTOMER.DISPUTE.${type}`,
      resource: { dispute_id: id, reason: "MERCHANDISE_OR_SERVICE_NOT_RECEIVED", status: "OPEN", disputed_transactions: [{ seller_transaction_id: captureId }], ...extra },
    });
    await assert.rejects(claimsSvc.openClaim(efrain, juan4.id, "DOUBLE_CHARGE", "x"), /not_found/, "only the person who paid can claim");
    await assert.rejects(claimsSvc.openClaim(juan, juan4.id, "HACK", "x"), /invalid_kind/);
    await assert.rejects(claimsSvc.openClaim(juan, juan4.id, "OTHER", " \u200B "), /message_required/);
    await assert.rejects(claimsSvc.openClaim(rosa, rosa4Pending.id, "OTHER", "x"), /nothing_to_claim/, "nothing was charged yet");

    // 1. Claim while the pot has not left: the organizer refunds, the contribution is pending again.
    const cl = await claimsSvc.openClaim(juan, juan4.id, "DOUBLE_CHARGE", "Me cobraron dos veces");
    await assert.rejects(claimsSvc.openClaim(juan, juan4.id, "OTHER", "otra vez"), /claim_exists/);
    assert.equal(await db.notification.count({ where: { userId: wara.id, title: { startsWith: "Reclamo" } } }), 1);
    assert.equal((await claimsSvc.listClaims(efrain, auto.id)).claims.length, 0, "other members never see it");
    assert.equal((await claimsSvc.listClaims(juan, auto.id)).claims.length, 1);
    const asOrg = await claimsSvc.listClaims(wara, auto.id);
    assert.ok(asOrg.claims[0].canRefund && asOrg.claims[0].canReject && asOrg.claims[0].claimant === "Juan Carlos");
    assert.ok(!(await claimsSvc.listClaims(juan, auto.id)).claims[0].canRefund, "the member cannot refund themselves");
    await assert.rejects(claimsSvc.refundClaim(efrain, cl.id), /organizer_only/);
    await assert.rejects(claimsSvc.refundClaim(juan, cl.id), /organizer_only/);
    const refundsBeforeClaim = refunds.length;
    assert.equal((await claimsSvc.refundClaim(wara, cl.id)).ok, true);
    assert.equal(refunds.length, refundsBeforeClaim + 1, "refunded once");
    assert.equal(refunds.at(-1)!.capture, juan4.paypalCaptureId);
    assert.equal((await mine(juan, 4)).status, "PENDING");
    assert.equal((await db.claim.findUniqueOrThrow({ where: { id: cl.id } })).status, "REFUNDED");
    await assert.rejects(claimsSvc.refundClaim(wara, cl.id), /nothing_to_refund|not_open/);
    assert.equal(refunds.length, refundsBeforeClaim + 1, "a second tap does not refund again");
    // The refund also arrives as a webhook: it confirms, it does not create a second record.
    await webhooks.handleWebhook(refundEvent("REFUNDED", refunds.at(-1)!.id, juan4.paypalCaptureId, "25.00"));
    assert.equal(await db.refund.count({ where: { contributionId: juan4.id, reason: "CLAIM_REFUND" } }), 1);
    assert.equal(await notices(juan, "Reclamo · Pasanaku automático"), 2, "accepted, then money back");

    // 2. Claim after the pot left: Ayni cannot refund; the organizer explains; the member goes to PayPal.
    const c2 = await claimsSvc.openClaim(juan, juan3.id, "WRONG_AMOUNT", "El monto no era el mío");
    await assert.rejects(claimsSvc.refundClaim(wara, c2.id), /pot_already_sent/);
    await assert.rejects(claimsSvc.rejectClaim(wara, c2.id, " "), /note_required/);
    await assert.rejects(claimsSvc.rejectClaim(efrain, c2.id, "no"), /organizer_only/);
    await claimsSvc.rejectClaim(wara, c2.id, "El aporte era de $25.00, como en todo el grupo.");
    assert.equal((await db.claim.findUniqueOrThrow({ where: { id: c2.id } })).status, "REJECTED");
    assert.equal(await db.notification.count({ where: { userId: juan.id, body: { contains: "Centro de resoluciones" } } }), 1, "told how to go to PayPal");
    await assert.rejects(claimsSvc.rejectClaim(wara, c2.id, "otra vez"), /not_open/);
    // The member opens the PayPal dispute: it attaches itself to the same claim by the capture id.
    await webhooks.handleWebhook(dispute("PP-D-CL2", juan3.paypalCaptureId));
    await webhooks.handleWebhook(dispute("PP-D-CL2", juan3.paypalCaptureId)); // repeated delivery
    const esc2 = await db.claim.findUniqueOrThrow({ where: { id: c2.id } });
    assert.equal(esc2.status, "ESCALATED");
    assert.equal(esc2.paypalDisputeId, "PP-D-CL2");
    assert.equal(await db.claim.count({ where: { contributionId: juan3.id } }), 1, "linked, not duplicated");
    assert.equal(((esc2.timeline as any[]).filter((e) => e.type === "escalated")).length, 1);

    // 3. A claim that is escalated can no longer be refunded by Ayni: PayPal decides (no double refund).
    const c3 = await claimsSvc.openClaim(rosa, rosa3.id, "NOT_RECOGNIZED", "No reconozco este cobro");
    await webhooks.handleWebhook(dispute("PP-D-CL3", rosa3.paypalCaptureId));
    assert.equal((await db.claim.findUniqueOrThrow({ where: { id: c3.id } })).status, "ESCALATED");
    await assert.rejects(claimsSvc.refundClaim(wara, c3.id), /escalated_to_paypal/);
    await webhooks.handleWebhook(dispute("PP-D-CL3", rosa3.paypalCaptureId, "RESOLVED", { status: "RESOLVED", dispute_outcome: { outcome_code: "RESOLVED_SELLER_FAVOUR" } }));
    await webhooks.handleWebhook(dispute("PP-D-CL3", rosa3.paypalCaptureId, "RESOLVED", { status: "RESOLVED", dispute_outcome: { outcome_code: "RESOLVED_SELLER_FAVOUR" } }));
    const res3 = await db.claim.findUniqueOrThrow({ where: { id: c3.id } });
    assert.equal(res3.status, "RESOLVED");
    assert.equal(res3.outcome, "RESOLVED_SELLER_FAVOUR");
    assert.ok(res3.note!.includes("a favor del grupo"));
    assert.equal(await db.notification.count({ where: { userId: rosa.id, body: { contains: "PayPal resolvió tu disputa" } } }), 1, "told once");

    // 4. A dispute with no claim before it still gets its record, already linked.
    await webhooks.handleWebhook(dispute("PP-D-CL4", efrain3.paypalCaptureId));
    const c4 = await db.claim.findFirstOrThrow({ where: { contributionId: efrain3.id } });
    assert.equal(c4.kind, "PAYPAL_DISPUTE");
    assert.equal(c4.status, "ESCALATED");
    assert.equal(c4.paypalDisputeId, "PP-D-CL4");
    assert.equal((await claimsSvc.listClaims(efrain, auto.id)).claims.length, 1, "the person sees the record of their own dispute");
    assert.equal((await claimsSvc.listClaims(rosa, auto.id)).claims.length, 1);
    assert.equal((await claimsSvc.listClaims(wara, auto.id)).claims.length, 4, "the organizer sees them all");
    await assert.rejects(claimsSvc.listClaims(kusi, auto.id), /not_a_member/);
    // A dispute about a capture that is not ours is ignored.
    await webhooks.handleWebhook(dispute("PP-D-X", "OTHER-SHOP-CAPTURE"));
    assert.equal(await db.claim.count({ where: { paypalDisputeId: "PP-D-X" } }), 0);
    console.log("✔ claims: refund while the pot is here, explain, link with the PayPal dispute, outcome, no double refund");
  }

  // ------------------------------------------------ group chat
  // PayPal events are cards with data (the app translates them), never free text with private details.
  const events = await db.chatMessage.findMany({ where: { groupId: barrio.id, kind: "event" } });
  assert.ok(events.some((m: any) => m.event.type === "paid") && events.some((m: any) => m.event.type === "pot") && events.some((m: any) => m.event.type === "finished"));
  assert.ok(events.filter((m: any) => m.event.type === "paid").every((m: any) => !("amountCents" in m.event)), "a paid event carries no amount (it would reveal a late fee)");

  await chatSvc.markRead(juan, barrio.id);
  await chatSvc.sendMessage(rosa, barrio.id, "  Gracias a todos por cumplir \u200B ");
  const sent = (await chatSvc.listMessages(juan, barrio.id)).at(-1);
  assert.equal(sent.content, "Gracias a todos por cumplir");
  assert.equal(sent.authorName, "Doña Rosa");
  assert.equal(sent.private, false);
  const juanMember = await db.membership.findUniqueOrThrow({ where: { userId_groupId: { userId: juan.id, groupId: barrio.id } } });
  assert.equal(await chatSvc.unreadCount(juanMember), 1, "one unread message from someone else");
  const rosaMember = await db.membership.findUniqueOrThrow({ where: { userId_groupId: { userId: rosa.id, groupId: barrio.id } } });
  assert.equal(await chatSvc.unreadCount(rosaMember), 0, "my own message is not unread for me");

  // A question to the assistant (button or @ayni) is private to whoever asked.
  const asked = await chatSvc.sendMessage(juan, barrio.id, "¿cuánto debo?", true);
  assert.ok(asked.reply);
  await chatSvc.sendMessage(juan, barrio.id, "@ayni ¿cuándo me toca?");
  const juanSees = await chatSvc.listMessages(juan, barrio.id);
  const rosaSees = await chatSvc.listMessages(rosa, barrio.id);
  assert.equal(juanSees.filter((m: any) => m.private).length, 4, "two questions and two answers");
  assert.ok(juanSees.some((m: any) => m.private && m.content === "¿cuándo me toca?"), "the mention is removed from the question");
  assert.equal(rosaSees.filter((m: any) => m.private).length, 0, "not even the organizer reads a member's private questions");
  assert.equal(await chatSvc.unreadCount(rosaMember), 0, "private exchanges of others never count as unread");
  const chatLogs = await db.aiLog.findMany({ where: { groupId: barrio.id, kind: "chat" } });
  assert.ok(chatLogs.length === 2 && chatLogs.every((l: any) => l.audience === "organizer" && l.subjectUserId === juan.id));

  // Polling: only what came after the last message I have.
  const newer = await chatSvc.listMessages(rosa, barrio.id, new Date(sent.createdAt));
  assert.equal(newer.length, 0);
  await chatSvc.sendMessage(juan, barrio.id, "¡De nada!");
  assert.equal((await chatSvc.listMessages(rosa, barrio.id, new Date(sent.createdAt))).length, 1);

  // Moderation: the author or the organizer hides a message; nobody else; events cannot be hidden.
  const juanMsg = (await chatSvc.listMessages(marisol, barrio.id)).at(-1);
  assert.equal(juanMsg.canHide, false);
  await assert.rejects(chatSvc.hideMessage(marisol, barrio.id, juanMsg.id), /cannot_hide/);
  await assert.rejects(chatSvc.hideMessage(rosa, barrio.id, events[0].id), /cannot_hide/);
  await chatSvc.hideMessage(rosa, barrio.id, juanMsg.id);
  const hidden = (await chatSvc.listMessages(marisol, barrio.id)).find((m: any) => m.id === juanMsg.id);
  assert.equal(hidden.hidden, true);
  assert.equal(hidden.content, "");

  // Not a member, empty text: rejected.
  await assert.rejects(chatSvc.listMessages(kusi, barrio.id), /not_a_member/);
  await assert.rejects(chatSvc.sendMessage(kusi, barrio.id, "hola"), /not_a_member/);
  await assert.rejects(chatSvc.sendMessage(rosa, barrio.id, " \u200B "), /empty_message/);
  // A burst from one person is stopped (20 per minute); other members can still write.
  let blocked = 0;
  for (let i = 0; i < 25; i++) await chatSvc.sendMessage(efrain, barrio.id, `mensaje ${i}`).catch(() => blocked++);
  assert.equal(blocked, 5);
  await chatSvc.sendMessage(wara, barrio.id, "sigo aquí");
  console.log("✔ group chat: members talk, assistant answers are private, moderation, unread, rate limit");

  // ------------------------------------------------ daily reconciliation with PayPal Transaction Search
  {
    const later = () => new Date(Date.now() + 5 * 3600_000); // past PayPal's reporting lag
    const clean = await recon.runReconciliation(later());
    assert.equal(clean.status, "OK", JSON.stringify(clean.issues));
    assert.ok(clean.checked > 10 && clean.matched === clean.checked, "every charge Ayni recorded is in PayPal with the same amount");
    const barrioView = await recon.groupReconciliation(marisol, barrio.id);
    assert.ok(barrioView.checked > 0 && barrioView.matched === barrioView.checked && barrioView.issueCount === 0);

    // PayPal says something different: a capture is gone, one has another amount, one is stuck, a stranger charged us.
    const some = await db.contribution.findMany({ where: { round: { groupId: barrio.id }, paypalCaptureId: { not: null } }, orderBy: { paidAt: "asc" }, take: 3 });
    searchTamper.omit.add(some[0].paypalCaptureId);
    searchTamper.amount.set(some[1].paypalCaptureId, some[1].amountCents + some[1].lateFeeCents - 100);
    searchTamper.status.set(some[2].paypalCaptureId, "D");
    searchTamper.extra.push({ id: "STRANGER-CAPTURE", cents: 999 });
    const bad = await recon.runReconciliation(later());
    assert.equal(bad.status, "ISSUES");
    assert.deepEqual((bad.issues as any[]).map((i) => i.type).sort(), ["AMOUNT_MISMATCH", "MISSING_IN_PAYPAL", "NOT_COMPLETED", "UNKNOWN_CHARGE"]);
    assert.equal(await db.notification.count({ where: { userId: rosa.id, title: "Diferencia con PayPal" } }), 1, "the organizer hears once, about their group");
    assert.equal(await db.notification.count({ where: { userId: marisol.id, title: "Diferencia con PayPal" } }), 0, "other groups' organizers are not bothered");
    const asOrganizer = await recon.groupReconciliation(rosa, barrio.id);
    assert.equal(asOrganizer.issues.length, 3, "the organizer sees the detail; the stranger's charge belongs to no group");
    const asMember = await recon.groupReconciliation(juan, barrio.id);
    assert.equal(asMember.issueCount, 3);
    assert.deepEqual(asMember.issues, [], "members only learn that something does not match, not the detail");
    await assert.rejects(recon.groupReconciliation(kusi, barrio.id), /not_a_member/);
    // A payment made a minute ago is never reported missing: it is outside the window.
    searchTamper.omit.add(some[0].paypalCaptureId);
    const young = await db.contribution.findFirstOrThrow({ where: { id: some[0].id } });
    await db.contribution.update({ where: { id: young.id }, data: { paidAt: new Date() } });
    const recent = await recon.runReconciliation(new Date());
    assert.ok(!(recent.issues as any[]).some((i) => i.captureId === young.paypalCaptureId), "too recent for PayPal to list it yet");
    await db.contribution.update({ where: { id: young.id }, data: { paidAt: young.paidAt } });
    // The organizer can ask for a fresh check, but not over and over.
    const runsBefore = await db.reconciliation.count();
    await recon.reconcileNow(rosa, barrio.id);
    await recon.reconcileNow(rosa, barrio.id);
    assert.equal(await db.reconciliation.count(), runsBefore, "cooldown: the last run was seconds ago");
    await assert.rejects(recon.reconcileNow(juan, barrio.id), /organizer_only/);
    // Once a day on its own.
    assert.equal(await recon.maybeReconcile(new Date()), null);
    // Transaction Search not enabled: recorded as unavailable, nothing breaks, the last real result stays.
    searchTamper.omit.clear(); searchTamper.amount.clear(); searchTamper.status.clear(); searchTamper.extra.length = 0;
    searchUnavailable = true;
    const off = await recon.runReconciliation(later());
    assert.equal(off.status, "UNAVAILABLE");
    assert.ok((await recon.groupReconciliation(rosa, barrio.id)).ranAt, "the last successful check is still shown");
    searchUnavailable = false;
    console.log("✔ reconciliation with PayPal: matches, four kinds of difference, privacy, lag window, cooldown, unavailable");
  }

  // ------------------------------------------------ read-only key for the member's own AI assistant (MCP)
  {
    const jwt = (await import("jsonwebtoken")).default;
    const call = async (token: string, method: string, path: string) => {
      const req: any = { headers: { authorization: `Bearer ${token}` }, method, path };
      let status = 200;
      let nexted = false;
      const res: any = { status(c: number) { status = c; return res; }, json() { return res; } };
      await auth.requireAuth(req, res, () => { nexted = true; });
      return { status, nexted, scope: req.tokenScope, userId: req.user?.id };
    };
    const fresh = await db.user.findUniqueOrThrow({ where: { id: rosa.id } });
    const key = auth.issueMcpToken(fresh.id, fresh.mcpEpoch);
    const read = await call(key, "GET", `/groups/${barrio.id}`);
    assert.ok(read.nexted && read.scope === "mcp" && read.userId === rosa.id, "the key reads as its owner");
    for (const [method, p] of [["GET", `/groups/${barrio.id}/chat`], ["POST", `/groups/${barrio.id}/chat`], ["POST", "/groups"], ["POST", "/me/mcp-token"], ["GET", "/me"], ["POST", `/claims/x/refund`], ["DELETE", "/me/payment-method"]] as const) {
      const r = await call(key, method, p);
      assert.equal(r.status, 403, `${method} ${p}`);
      assert.equal(r.nexted, false);
    }
    // the app's own token is untouched by all of this
    const app = await call(auth.issueToken(rosa.id), "POST", `/groups/${barrio.id}/chat`);
    assert.ok(app.nexted && app.scope === "app");
    // an unknown scope is refused
    assert.equal((await call(jwt.sign({ sub: rosa.id, scope: "admin" }, "test"), "GET", "/groups")).status, 401);
    assert.equal((await call(jwt.sign({ sub: rosa.id, scope: "mcp" }, "test"), "GET", "/groups")).status, 401, "a key without its epoch is not valid");
    // revoking: every key made before stops working at once; a new one works
    await db.user.update({ where: { id: rosa.id }, data: { mcpEpoch: { increment: 1 } } });
    assert.equal((await call(key, "GET", "/groups")).status, 401);
    const renewed = await db.user.findUniqueOrThrow({ where: { id: rosa.id } });
    assert.ok((await call(auth.issueMcpToken(renewed.id, renewed.mcpEpoch), "GET", "/groups")).nexted);
    assert.ok((await call(auth.issueToken(rosa.id), "GET", "/groups")).nexted, "the app session is not affected by revoking keys");
    console.log("✔ read-only key: reads only the allowlist, never writes, revocable, app session unaffected");
  }

  const reminderLogs = await db.aiLog.findMany({ where: { kind: "reminder" } });
  assert.ok(reminderLogs.length > 0 && reminderLogs.every((l: any) => l.audience === "organizer" && l.subjectUserId));
  const logs = await db.aiLog.groupBy({ by: ["kind", "source"], _count: true });
  console.log("✔ AI log entries:", logs.map((l: any) => `${l.kind}/${l.source}=${l._count}`).join(" "));

  console.log("\nALL E2E CHECKS PASSED");
  await db.$disconnect();
  server.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
