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
const orders = new Map<string, { intent: string; amount: string; customId: string }>();
const captures: { id: string; amount: number; source: string }[] = [];
const payouts: { batch: string; email: string; amount: number }[] = [];
const voids: string[] = [];
const invoices: { id: string; total: number; cancelled: boolean }[] = [];
const auths = new Map<string, number>();
const seenBatches = new Set<string>();
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
    if (u === "/v2/checkout/orders" && req.method === "POST") {
      const oid = id("ORD");
      const pu = j.purchase_units[0];
      orders.set(oid, { intent: j.intent, amount: pu.amount.value, customId: pu.custom_id });
      return send(201, { id: oid, links: [{ rel: "payer-action", href: `https://sandbox.paypal/approve/${oid}` }] });
    }
    if ((m = u.match(/^\/v2\/checkout\/orders\/([^/]+)\/capture$/))) {
      const o = orders.get(m[1])!;
      const cid = id("CAP");
      captures.push({ id: cid, amount: Math.round(Number(o.amount) * 100), source: "order" });
      const gross = Math.round(Number(o.amount) * 100);
      const usd = (c: number) => ({ currency_code: "USD", value: (c / 100).toFixed(2) });
      const seller_receivable_breakdown = { gross_amount: usd(gross), paypal_fee: usd(FEE_CENTS), net_amount: usd(gross - FEE_CENTS) };
      return send(201, { status: "COMPLETED", purchase_units: [{ payments: { captures: [{ id: cid, custom_id: o.customId, seller_receivable_breakdown }] } }] });
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
    if (u === "/v1/payments/payouts") {
      const item = j.items[0];
      const senderBatch = j.sender_batch_header.sender_batch_id;
      assert.equal(item.purpose, "NON_GOODS_OR_SERVICES");
      // Like PayPal: the same sender_batch_id is never paid twice.
      if (seenBatches.has(senderBatch)) return send(400, { name: "USER_BUSINESS_ERROR", details: [{ issue: "SENDER_BATCH_ID_ALREADY_USED" }] });
      seenBatches.add(senderBatch);
      const b = id("BATCH");
      payouts.push({ batch: b, email: item.receiver, amount: Math.round(Number(item.amount.value) * 100) });
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

  // Rounds 4..5: everyone pays. In round 5 the defaulter receives: their debt goes to round-1's recipient.
  for (let r = 4; r <= 5; r++) {
    for (const m of members) await pay(m.user, r);
    await releaseIfReady(r);
  }
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

  // ------------------------------------------------ payment history (ledger)
  const asOrganizer = await ledger.groupLedger(rosa, barrio.id);
  assert.equal(asOrganizer.totals.inCents, capturedIn, "ledger: charged == what PayPal captured");
  assert.equal(asOrganizer.totals.outCents, paidOut, "ledger: sent == what PayPal paid out");
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
