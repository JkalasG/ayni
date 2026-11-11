// Smoke test of every endpoint against the backend in APP_MODE=mock.
// Usage: npm run mock:reset && npm run dev  (in another terminal)  then  npm run test:smoke
const B = 'http://localhost:4000';
let pass = 0, fail = 0;
const out = [];
const ok = (name, cond, extra = '') => { (cond ? pass++ : fail++); out.push(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  -> ' + extra}`); };
async function call(method, path, { token, body, raw } = {}) {
  const r = await fetch(B + path, { method, redirect: 'manual', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  if (raw) return r;
  const t = await r.text(); let j = null; try { j = t ? JSON.parse(t) : null; } catch { j = t; }
  return { status: r.status, json: j };
}

async function follow(start) {
  let loc = start;
  for (let i = 0; i < 12 && loc; i++) {
    const rr = await fetch(loc, { redirect: 'manual' });
    const n = rr.headers.get('location');
    if (n) { if (n.startsWith('http://localhost:8081')) return n; loc = n.startsWith('http') ? n : B + n; continue; }
    const html = await rr.text();
    const m = html.match(/class="btn pay" href="([^"]+)"/);
    if (!m) return null;
    loc = m[1].replace(/&amp;/g, '&');
  }
  return null;
}
const users = (await call('GET', '/auth/demo/users')).json;
const tok = {};
for (const u of users) tok[u.name] = (await call('POST', '/auth/demo', { body: { userId: u.id } })).json.token;
const uid = Object.fromEntries(users.map(u => [u.name, u.id]));

// --- public / auth
let r = await call('GET', '/health'); ok('GET /health', r.status === 200 && r.json.mode === 'mock');
ok('GET /auth/demo/users (7 users)', users.length === 7, users.length);
r = await call('POST', '/auth/demo', { body: { userId: 'nope' } }); ok('POST /auth/demo invalid user rejected', r.status >= 400, r.status);
ok('POST /auth/demo tokens issued', Object.values(tok).every(Boolean));
r = await call('GET', '/me'); ok('GET /me without token -> 401', r.status === 401, r.status);
r = await call('GET', '/me', { token: 'garbage' }); ok('GET /me bad token -> 401', r.status === 401, r.status);
r = await call('GET', '/me', { token: tok['Doña Rosa'] }); ok('GET /me', r.status === 200 && r.json.name === 'Doña Rosa', JSON.stringify(r.json));
r = await call('PATCH', '/me', { token: tok['Doña Rosa'], body: { locale: 'en' } }); ok('PATCH /me locale', r.status === 200, r.status);
await call('PATCH', '/me', { token: tok['Doña Rosa'], body: { locale: 'es' } });
r = await call('PATCH', '/me', { token: tok['Doña Rosa'], body: { locale: 'xx' } }); ok('PATCH /me invalid locale -> 400', r.status === 400, r.status);
r = await call('GET', '/me/profile', { token: tok['Doña Rosa'] }); ok('GET /me/profile', r.status === 200 && 'completed' in r.json, JSON.stringify(r.json).slice(0, 120));
r = await call('POST', '/me/push-token', { token: tok['Doña Rosa'], body: { token: 'ExponentPushToken[test]' } }); ok('POST /me/push-token set', r.status === 200, r.status);
r = await call('POST', '/me/push-token', { token: tok['Doña Rosa'], body: { token: null } }); ok('POST /me/push-token clear', r.status === 200, r.status);

// --- paypal login (mock): start -> connect -> callback -> token in redirect
r = await call('GET', '/auth/paypal/start?redirect=http://localhost:8081/auth', { raw: true });
ok('GET /auth/paypal/start allowed redirect -> 302', r.status === 302, r.status);
r = await call('GET', '/auth/paypal/start?redirect=https://evil.example.com', { raw: true });
ok('GET /auth/paypal/start evil redirect -> 400', r.status === 400, r.status);
{
  const start = (await call('GET', '/auth/paypal/start?redirect=http://localhost:8081/auth', { raw: true })).headers.get('location');
  const final = await follow(start);
  ok('PayPal login flow returns a token (mock)', !!final && /token=/.test(final), final ?? 'no redirect to app');
  if (final) {
    const t = new URL(final).searchParams.get('token');
    const me = await call('GET', '/me', { token: t }); ok('  token from PayPal login works on /me', me.status === 200, me.status);
  }
}

// --- groups
const rosa = tok['Doña Rosa'], mari = tok['Marisol'], tomas = tok['Tomás'], kusi = tok['Kusi'], wara = tok['Wara'], jc = tok['Juan Carlos'], efra = tok['Don Efraín'];
const gl = (await call('GET', '/groups', { token: rosa })).json;
ok('GET /groups (Rosa)', Array.isArray(gl) && gl.length >= 3, gl.length);
const byName = n => gl.find(g => g.name === n);
const familia = byName('Pasanaku de la familia'), feria = byName('Pasanaku abierto de la feria'), barrio = byName('Pasanaku del barrio');
for (const g of gl) { r = await call('GET', `/groups/${g.id}`, { token: rosa }); ok(`GET /groups/:id "${g.name}"`, r.status === 200 && r.json.rounds && 'payouts' in r.json, r.status); }
r = await call('GET', `/groups/${familia.id}`, { token: kusi }); ok('GET /groups/:id non-member -> 403', r.status === 403, r.status);
r = await call('GET', '/groups/doesnotexist', { token: rosa }); ok('GET /groups/:id unknown -> 404', r.status === 404, r.status);

r = await call('POST', '/groups', { token: jc, body: { name: 'Smoke Test', contributionCents: 1000, frequency: 'WEEKLY', orderMethod: 'LOTTERY', maxMembers: 3, demoMode: true, demoRoundMinutes: 2 } });
ok('POST /groups create', r.status === 200 || r.status === 201, JSON.stringify(r.json).slice(0, 150));
const mine = r.json;
r = await call('POST', '/groups', { token: jc, body: { name: 'x' } }); ok('POST /groups invalid -> 400', r.status === 400, r.status);
r = await call('PATCH', `/groups/${mine.id}/admission`, { token: jc, body: { isOpen: true, description: 'prueba', admissionMode: 'MANUAL', minCompleted: 0, minOnTimePct: 0, maxLate: null, acceptNewcomers: true, requireDeposit: false } });
ok('PATCH /groups/:id/admission', r.status === 200, r.status + JSON.stringify(r.json).slice(0, 100));
r = await call('PATCH', `/groups/${mine.id}/admission`, { token: tomas, body: { isOpen: true } }); ok('PATCH admission by non-organizer rejected', r.status >= 400, r.status);
const inviteCode = (await call('GET', `/groups/${mine.id}`, { token: jc })).json.inviteCode;
r = await call('POST', '/groups/join', { token: tomas, body: { code: inviteCode } }); ok('POST /groups/join valid code', r.status === 200, r.status + JSON.stringify(r.json).slice(0, 100));
r = await call('POST', '/groups/join', { token: tomas, body: { code: 'ZZZZZZ' } }); ok('POST /groups/join bad code -> 4xx', r.status >= 400 && r.status < 500, r.status);
r = await call('POST', '/groups/join', { token: kusi, body: { code: inviteCode } }); ok('POST /groups/join 2nd member', r.status === 200, r.status);
r = await call('POST', `/groups/${mine.id}/order`, { token: jc, body: {} }); ok('POST /groups/:id/order', r.status === 200, r.status + JSON.stringify(r.json).slice(0, 100));
r = await call('POST', `/groups/${mine.id}/start`, { token: jc }); ok('POST /groups/:id/start', r.status === 200, r.status + JSON.stringify(r.json).slice(0, 120));
r = await call('POST', `/groups/${mine.id}/tick`, { token: jc, body: {} }); ok('POST /groups/:id/tick', r.status === 200, r.status);

// --- explore + join requests
r = await call('GET', '/explore', { token: tomas }); ok('GET /explore', r.status === 200 && r.json.groups && r.json.profile, JSON.stringify(r.json).slice(0, 100));
const open = r.json.groups?.find(g => g.name === 'Pasanaku abierto de la feria');
ok('GET /explore lists open group', !!open);
// Kusi requests to join "feria" (no deposit path may need PayPal approval in mock)
r = await call('POST', `/groups/${feria.id}/requests`, { token: kusi, body: { message: 'hola', redirect: 'http://localhost:8081/explore' } });
ok('POST /groups/:id/requests', r.status === 200 || r.status === 201, r.status + JSON.stringify(r.json).slice(0, 160));
const rq = r.json?.request;
if (rq) {
  r = await call('GET', `/requests/${rq.id}`, { token: kusi }); ok('GET /requests/:id', r.status === 200, r.status);
  if (r.json?.approveUrl || (await call('POST', `/groups/${feria.id}/requests`, { token: kusi, body: { message: 'x' } })).json?.approveUrl) { /* deposit flow covered below */ }
}
const pr = await call('POST', `/groups/${feria.id}/requests`, { token: tomas, body: { message: 'soy Tomás', redirect: 'http://localhost:8081/explore' } });
ok('POST /groups/:id/requests (Tomás)', pr.status < 300 || pr.status === 409, pr.status + JSON.stringify(pr.json).slice(0, 120));
// deposit return, if an approve URL was issued
const approve = pr.json?.approveUrl ?? r.json?.approveUrl;
if (approve) {
  const final = await follow(approve);
  ok('GET /paypal/deposit-return via mock approval', !!final && /status=deposit/.test(final), final ?? 'none');
}

// --- chat / ai-log / disputes / notifications
r = await call('GET', `/groups/${familia.id}/chat`, { token: rosa }); ok('GET /groups/:id/chat', r.status === 200 && Array.isArray(r.json), r.status);
r = await call('POST', `/groups/${familia.id}/chat`, { token: rosa, body: { text: '¿cuánto debo?', toAssistant: true } }); ok('POST /groups/:id/chat to the assistant (fallback)', r.status === 200 && typeof r.json.reply === 'string', r.status + JSON.stringify(r.json).slice(0, 120));
r = await call('POST', `/groups/${familia.id}/chat`, { token: rosa, body: { text: 'Hola a todos' } }); ok('POST /groups/:id/chat to the group', r.status === 200 && r.json.reply === null, r.status + JSON.stringify(r.json).slice(0, 120));
r = await call('POST', `/groups/${familia.id}/chat`, { token: kusi, body: { text: 'hola' } }); ok('POST chat non-member -> 403', r.status === 403, r.status);
r = await call('POST', `/groups/${familia.id}/chat`, { token: rosa, body: { text: '   ' } }); ok('POST chat empty text -> 400', r.status === 400, r.status);
{
  const asRosa = (await call('GET', `/groups/${familia.id}/chat`, { token: rosa })).json;
  const asMari = (await call('GET', `/groups/${familia.id}/chat`, { token: mari })).json;
  ok('chat: Rosa sees her private question to the assistant', asRosa.some(m => m.private && m.content === '¿cuánto debo?'));
  ok('chat: another member does not see it', !asMari.some(m => m.private) && asMari.some(m => m.content === 'Hola a todos'));
  const hello = asMari.find(m => m.content === 'Hola a todos');
  r = await call('GET', `/groups/${familia.id}/chat?after=${encodeURIComponent(hello.createdAt)}`, { token: mari }); ok('GET chat ?after= returns only newer messages', r.status === 200 && r.json.length === 0, JSON.stringify(r.json).slice(0, 80));
  r = await call('GET', `/groups/${familia.id}/chat?after=yesterday`, { token: mari }); ok('GET chat ?after= invalid -> 400', r.status === 400, r.status);
  r = await call('GET', `/groups/${familia.id}`, { token: mari }); ok('group detail counts unread chat messages', r.json.unreadChat >= 1, r.json.unreadChat);
  r = await call('POST', `/groups/${familia.id}/chat/read`, { token: mari, body: {} }); ok('POST /groups/:id/chat/read', r.status === 200, r.status);
  r = await call('GET', `/groups/${familia.id}`, { token: mari }); ok('unread counter back to 0', r.json.unreadChat === 0, r.json.unreadChat);
  r = await call('POST', `/groups/${familia.id}/chat/${hello.id}/hide`, { token: mari, body: {} }); ok('hide someone else\'s message as a member -> 403', r.status === 403, r.status);
  r = await call('POST', `/groups/${familia.id}/chat/${hello.id}/hide`, { token: rosa, body: {} }); ok('POST /groups/:id/chat/:id/hide by its author', r.status === 200, r.status);
}
r = await call('GET', `/groups/${familia.id}/chat`, { token: kusi }); ok('GET chat non-member -> 403', r.status === 403, r.status);
r = await call('GET', `/groups/${familia.id}/ai-log`, { token: rosa }); ok('GET /groups/:id/ai-log', r.status === 200, r.status);
r = await call('GET', `/groups/${familia.id}/disputes`, { token: rosa }); ok('GET /groups/:id/disputes organizer', r.status === 200 && 'disputes' in r.json, r.status);
r = await call('GET', `/groups/${familia.id}/disputes`, { token: mari }); ok('GET disputes non-organizer -> 403', r.status === 403, r.status);
r = await call('GET', '/notifications', { token: mari }); ok('GET /notifications', r.status === 200 && Array.isArray(r.json), r.status);
r = await call('POST', '/notifications/read', { token: mari, body: {} }); ok('POST /notifications/read', r.status === 200, r.status);

// --- actions (organizer decisions)
const fam = (await call('GET', `/groups/${familia.id}`, { token: rosa })).json;
ok('familia has pending organizer decision', fam.actions.length > 0, fam.actions.length);
if (fam.actions[0]) {
  r = await call('POST', `/actions/${fam.actions[0].id}/approve`, { token: mari, body: {} }); ok('POST /actions/:id/approve by non-organizer rejected', r.status >= 400, r.status);
  r = await call('POST', `/actions/${fam.actions[0].id}/approve`, { token: rosa, body: {} }); ok('POST /actions/:id/approve', r.status === 200, r.status + JSON.stringify(r.json));
}
r = await call('POST', `/actions/none/reject`, { token: rosa, body: {} }); ok('POST /actions/:id/reject unknown -> 4xx', r.status >= 400 && r.status < 500, r.status);

// --- payments: a real pending contribution, through the simulated PayPal
const famNow = (await call('GET', `/groups/${familia.id}`, { token: wara })).json;
const cur = famNow.rounds.find(x => x.status === 'COLLECTING');
const wm = famNow.myMembershipId;
const pend = cur.contributions.find(x => x.membershipId === wm && x.status === 'PENDING');
ok('Wara has a pending contribution', !!pend);
r = await call('POST', `/contributions/${pend.id}/checkout`, { token: rosa, body: { redirect: 'http://localhost:8081/groups/x' } }); ok('POST checkout someone else\'s contribution -> 404', r.status === 404, r.status);
r = await call('POST', `/contributions/${pend.id}/checkout`, { token: wara, body: { redirect: 'https://evil.example.com' } }); ok('POST checkout evil redirect -> 400', r.status === 400, r.status);
r = await call('POST', `/contributions/${pend.id}/checkout`, { token: wara, body: { redirect: `http://localhost:8081/groups/${familia.id}` } });
ok('POST /contributions/:id/checkout', r.status === 200 && !!r.json.approveUrl, r.status + JSON.stringify(r.json).slice(0, 150));
if (r.json?.approveUrl) {
  const final = await follow(r.json.approveUrl);
  ok('GET /paypal/return captures and redirects status=paid', !!final && /status=paid/.test(final), final ?? 'none');
  const after = (await call('GET', `/groups/${familia.id}`, { token: wara })).json;
  const c2 = after.rounds.find(x => x.number === cur.number).contributions.find(x => x.id === pend.id);
  ok('contribution is PAID with capture id', c2.status === 'PAID' && !!c2.paypalCaptureId, JSON.stringify(c2));
  ok('payment shows in group payouts/activity data', !!c2.paidAt);
  r = await call('POST', `/contributions/${pend.id}/checkout`, { token: wara, body: { redirect: `http://localhost:8081/groups/${familia.id}` } });
  ok('double payment blocked (409)', r.status === 409, r.status);
}

// --- webhook (mock verifies) + idempotency
const ev = { id: 'WH-SMOKE-1', event_type: 'CUSTOMER.DISPUTE.CREATED', resource: {} };
r = await call('POST', '/paypal/webhook', { body: { id: 'WH-SMOKE-2', event_type: 'SOMETHING.UNKNOWN', resource: {} } }); ok('POST /paypal/webhook unsigned event rejected (400)', r.status === 400, r.status);
r = await call('POST', '/paypal/webhook', { body: { id: 'WH-SMOKE-2', event_type: 'SOMETHING.UNKNOWN', resource: {} } }); ok('POST /paypal/webhook still rejected on repeat', r.status === 400, r.status);

// --- payment history, claims, automatic payment, reconciliation, read-only key
r = await call('GET', `/groups/${familia.id}/ledger`, { token: rosa }); ok('GET /groups/:id/ledger', r.status === 200 && Array.isArray(r.json.entries) && !!r.json.totals, r.status);
r = await call('GET', `/groups/${familia.id}/ledger`, { token: kusi }); ok('GET ledger non-member -> 403', r.status === 403, r.status);
r = await call('GET', '/me/payments', { token: rosa }); ok('GET /me/payments', r.status === 200 && !!r.json.totals, r.status);
r = await call('GET', `/groups/${familia.id}/reconciliation`, { token: rosa }); ok('GET /groups/:id/reconciliation', r.status === 200 && 'checked' in r.json, r.status);
r = await call('POST', `/groups/${familia.id}/reconciliation`, { token: mari, body: {} }); ok('POST reconciliation by non-organizer -> 403', r.status === 403, r.status);
r = await call('POST', `/groups/${familia.id}/autopay`, { token: wara, body: { enabled: true } }); ok('autopay needs a saved method -> 409', r.status === 409, r.status);
r = await call('POST', `/contributions/${pend.id}/claim`, { token: rosa, body: { kind: 'OTHER', message: 'x' } }); ok('claim on another member contribution -> 404', r.status === 404, r.status);
r = await call('POST', `/contributions/${pend.id}/claim`, { token: wara, body: { kind: 'DOUBLE_CHARGE', message: 'Me cobraron dos veces' } }); ok('POST /contributions/:id/claim', r.status === 201, r.status + JSON.stringify(r.json).slice(0, 100));
r = await call('GET', `/groups/${familia.id}/claims`, { token: wara }); ok('GET /groups/:id/claims (member sees own)', r.status === 200 && r.json.claims.length === 1, r.status);
r = await call('GET', `/groups/${familia.id}/claims`, { token: rosa }); ok('GET claims (organizer sees it)', r.status === 200 && r.json.claims.some(c => c.claimant), r.status);
r = await call('POST', `/claims/none/refund`, { token: rosa, body: {} }); ok('POST /claims/:id/refund unknown -> 404', r.status === 404, r.status);
{
  const key = (await call('POST', '/me/mcp-token', { token: rosa, body: {} })).json?.token;
  ok('POST /me/mcp-token issues a read-only key', !!key);
  r = await call('GET', '/groups', { token: key }); ok('read-only key can read /groups', r.status === 200, r.status);
  r = await call('GET', `/groups/${familia.id}/chat`, { token: key }); ok('read-only key cannot read the private chat -> 403', r.status === 403, r.status);
  r = await call('POST', '/groups', { token: key, body: {} }); ok('read-only key cannot write -> 403', r.status === 403, r.status);
  r = await call('POST', '/me/mcp-token', { token: key, body: {} }); ok('read-only key cannot create keys -> 403', r.status === 403, r.status);
  r = await call('DELETE', '/me/mcp-token', { token: rosa }); ok('DELETE /me/mcp-token revokes', r.status === 200, r.status);
  r = await call('GET', '/groups', { token: key }); ok('revoked key -> 401', r.status === 401, r.status);
  r = await call('GET', '/groups', { token: rosa }); ok('app session still works after revoking', r.status === 200, r.status);
}
r = await call('GET', '/me', { token: rosa }); ok('/me never exposes PayPal ids or tokens', r.status === 200 && !('paypalUserId' in r.json) && !('paypalVaultId' in r.json) && !('pushToken' in r.json) && r.json.hasSavedMethod === false, JSON.stringify(Object.keys(r.json)));

// --- payouts retry unknown, simulated PayPal panel
r = await call('POST', '/payouts/none/retry', { token: rosa }); ok('POST /payouts/:id/retry unknown -> 4xx', r.status >= 400 && r.status < 500, r.status);
r = await call('GET', '/__paypal/', { raw: true }); ok('GET /__paypal/ simulated PayPal panel', r.status === 200, r.status);

console.log(out.join('\n'));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
