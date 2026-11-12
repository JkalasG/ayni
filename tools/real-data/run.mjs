/**
 * Fills a RUNNING Ayni with real PayPal sandbox activity.
 *
 * What it does, using only Ayni's own API and a real Chrome:
 *   1. logs in as the demo members (the "Users" tag of the welcome screen, no password)
 *   2. creates the circles listed in CIRCLES, has the members join, draws the order and starts them
 *   3. for each round, every member pays with PayPal Checkout: Chrome opens PayPal, signs in with that member's
 *      PayPal SANDBOX account and approves, exactly like a person would
 *   4. the organizer approves the pot release, so PayPal Payouts sends it to the member whose turn it is
 *
 * The result is real: orders, captures, fees and payouts in the PayPal sandbox, and the same references in Ayni's
 * payment history. Sandbox only: nobody's real money is involved.
 *
 *   npm install
 *   node run.mjs --check                      # reads only: checks the server, the accounts and Chrome
 *   node run.mjs                              # everything in CIRCLES
 *   node run.mjs --only feria --rounds 2      # one circle, at most 2 rounds in this run
 *   node run.mjs --headful                    # shows Chrome; if PayPal asks for a captcha you can solve it
 *
 * It can be stopped and run again: it continues where each circle was (it finds them by name).
 *
 * Settings (environment variables):
 *   AYNI_URL          default https://ayni.devsjec.com
 *   CHROME_PATH       default: the usual Chrome location on Windows / macOS / Linux
 *   SANDBOX_PASSWORD  password of the sandbox accounts; by default the server's own answer is used
 */
import puppeteer from "puppeteer-core";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

const BASE = (process.env.AYNI_URL ?? "https://ayni.devsjec.com").replace(/\/$/, "");
const API = `${BASE}/api`;
const here = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = path.join(here, "screenshots");

// ---------------------------------------------------------------------------------------------------------------
// What to create. The organizer is the first member. `members` are demo member names, in the order they join.
// Amounts are small on purpose: they come out of the sandbox accounts' fake balance.
// `rounds`: how many rounds to run (a circle with 5 members has 5 rounds).
// ---------------------------------------------------------------------------------------------------------------
const CIRCLES = [
  {
    key: "feria",
    name: "Pasanaku de la feria (PayPal real)",
    organizer: "Doña Rosa",
    members: ["Juan Carlos", "Marisol", "Don Efraín", "Wara"],
    contributionCents: 500,
    rounds: 5,
  },
  {
    key: "barrio",
    name: "Ahorro del barrio (PayPal real)",
    organizer: "Marisol",
    members: ["Doña Rosa", "Wara", "Tomás"],
    contributionCents: 1000,
    rounds: 3,
  },
];

const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const opt = (n) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : undefined);
const HEADFUL = flag("headful");
const CHECK = flag("check");
const ONLY = opt("only");
const MAX_ROUNDS = opt("rounds") ? Number(opt("rounds")) : Infinity;

const log = (...a) => console.log(new Date().toLocaleTimeString(), ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------------------------------------------
// Ayni API
// ---------------------------------------------------------------------------------------------------------------
async function call(token, method, url, body) {
  const res = await fetch(`${API}${url}`, {
    method,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  if (!res.ok) throw new Error(`${method} ${url} -> ${res.status} ${typeof json === "string" ? json.slice(0, 160) : JSON.stringify(json).slice(0, 220)}`);
  return json;
}

async function loadMembers() {
  const list = await call(null, "GET", "/auth/demo/users");
  const members = {};
  for (const u of list) {
    const { token } = await call(null, "POST", "/auth/demo", { userId: u.id });
    members[u.name] = { ...u, token };
  }
  return members;
}

// ---------------------------------------------------------------------------------------------------------------
// PayPal Checkout, driven in a real Chrome
// ---------------------------------------------------------------------------------------------------------------
function chromePath() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const candidates = [
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    path.join(os.homedir(), "AppData/Local/Google/Chrome/Application/chrome.exe"),
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ];
  const found = candidates.find((p) => fs.existsSync(p));
  if (!found) throw new Error("Chrome not found: set CHROME_PATH to its executable.");
  return found;
}

let browser;
async function getBrowser() {
  browser ??= await puppeteer.launch({
    executablePath: chromePath(),
    headless: HEADFUL ? false : "new",
    args: ["--no-sandbox", "--disable-blink-features=AutomationControlled", "--window-size=1100,950"],
    defaultViewport: HEADFUL ? null : { width: 1100, height: 950 },
  });
  return browser;
}

const EMAIL_SEL = "input[type=email], input#email, input[name=login_email]";
const NEXT_SEL = "#btnNext, button[type=submit]";
const LOGIN_SEL = "#btnLogin, button[type=submit]";
const COOKIE_SEL = "#acceptAllButton, #onetrust-accept-btn-handler";
const PAY_WORDS = /pay now|complete purchase|continue|agree|pagar ahora|completar compra|continuar|aceptar y continuar|save and continue/i;

/**
 * Opens PayPal's approval page in a clean browser session (no cookies from the previous member), signs in with the
 * member's sandbox account and approves. Resolves when PayPal sent the browser back to Ayni.
 * The page is read by what it shows (a visible email field, a password field, a button), not by fixed addresses,
 * because PayPal changes its markup often. Anything unexpected leaves a screenshot in ./screenshots.
 */
async function approveOnPayPal(approveUrl, email, password, label) {
  const b = await getBrowser();
  const ctx = await b.createBrowserContext();
  const page = await ctx.newPage();
  await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36");
  const limit = Date.now() + (HEADFUL ? 5 * 60_000 : 90_000);
  let typedEmail = false;
  let typedPassword = false;
  try {
    await page.goto(approveUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
    while (Date.now() < limit) {
      const url = page.url();
      if (url.startsWith(BASE)) {
        const status = new URL(url).searchParams.get("status");
        if (status === "paid") return "paid";
        if (status === "cancelled" || status === "error") throw new Error(`PayPal sent the browser back with status=${status}`);
        await sleep(800); // Ayni's own page, still loading
        continue;
      }
      const step = await page
        .evaluate(
          (emailSel, cookieSel, payWords) => {
            const visible = (el) => !!el && el.offsetParent !== null && getComputedStyle(el).visibility !== "hidden";
            const q = (sel) => [...document.querySelectorAll(sel)].find(visible);
            if (q(cookieSel)) return { act: "cookie" };
            if (q("input[type=password]")) return { act: "password" };
            const em = q(emailSel);
            if (em) return { act: "email", prefilled: !!em.value };
            const re = new RegExp(payWords.source, payWords.flags);
            const btn = [...document.querySelectorAll("button, a[role=button], input[type=submit]")].filter(visible).find((x) => re.test((x.innerText || x.value || "").trim()));
            if (btn) return { act: "button", text: (btn.innerText || btn.value || "").trim() };
            return { act: "wait" };
          },
          EMAIL_SEL,
          COOKIE_SEL,
          { source: PAY_WORDS.source, flags: PAY_WORDS.flags }
        )
        .catch(() => ({ act: "wait" })); // the page navigated while we looked

      if (step.act === "cookie") await page.click(COOKIE_SEL).catch(() => {});
      else if (step.act === "email" && !typedEmail) {
        await page.click(EMAIL_SEL, { clickCount: 3 }).catch(() => {});
        await page.keyboard.type(email, { delay: 25 });
        typedEmail = true;
        const next = await page.$(NEXT_SEL);
        if (next) await next.click().catch(() => {});
        else await page.keyboard.press("Enter");
      } else if (step.act === "password" && !typedPassword) {
        await page.click("input[type=password]").catch(() => {});
        await page.keyboard.type(password, { delay: 25 });
        typedPassword = true;
        const go = await page.$(LOGIN_SEL);
        if (go) await go.click().catch(() => {});
        else await page.keyboard.press("Enter");
      } else if (step.act === "button") {
        await page
          .evaluate((text) => {
            const visible = (el) => !!el && el.offsetParent !== null;
            const b = [...document.querySelectorAll("button, a[role=button], input[type=submit]")].filter(visible).find((x) => (x.innerText || x.value || "").trim() === text);
            b?.click();
          }, step.text)
          .catch(() => {});
      }
      await sleep(1500);
    }
    throw new Error("timed out on PayPal's pages");
  } catch (e) {
    fs.mkdirSync(SHOTS, { recursive: true });
    const file = path.join(SHOTS, `${label.replace(/[^a-z0-9]+/gi, "-")}-${Date.now()}.png`);
    await page.screenshot({ path: file }).catch(() => {});
    throw new Error(`${e.message} (${page.url().slice(0, 90)}) screenshot: ${file}`);
  } finally {
    await ctx.close().catch(() => {});
  }
}

// ---------------------------------------------------------------------------------------------------------------
// One circle
// ---------------------------------------------------------------------------------------------------------------
async function runCircle(spec, members, password) {
  const org = members[spec.organizer];
  const all = [spec.organizer, ...spec.members];

  // find or create
  const mine = await call(org.token, "GET", "/groups");
  let groupId = mine.find((g) => g.name === spec.name)?.id;
  if (!groupId) {
    const created = await call(org.token, "POST", "/groups", {
      name: spec.name,
      country: "BO",
      contributionCents: spec.contributionCents,
      frequency: "WEEKLY",
      orderMethod: "LOTTERY",
      maxMembers: all.length,
      lateFeePct: 5,
      maxRetentionPct: 25,
      // rounds this long leave time to pay in a slow run without late fees or reminders
      demoMode: true,
      demoRoundMinutes: 60,
    });
    groupId = created.id;
    log(`[${spec.key}] created "${spec.name}"`);
  }
  let detail = await call(org.token, "GET", `/groups/${groupId}`);

  if (detail.status === "FORMING" || detail.status === "ORDERING") {
    for (const n of spec.members) {
      await call(members[n].token, "POST", "/groups/join", { code: detail.inviteCode }).catch((e) => log(`[${spec.key}] ${n}: ${e.message}`));
    }
    await call(org.token, "POST", `/groups/${groupId}/order`, {});
    await call(org.token, "POST", `/groups/${groupId}/start`);
    log(`[${spec.key}] started with ${all.length} members`);
  }

  let done = 0;
  while (done < Math.min(spec.rounds, MAX_ROUNDS)) {
    detail = await call(org.token, "GET", `/groups/${groupId}`);
    const round = detail.rounds.find((r) => r.status === "COLLECTING" || r.status === "READY");
    if (!round) {
      log(`[${spec.key}] no more open rounds (circle ${detail.status})`);
      break;
    }
    const nameOf = Object.fromEntries(detail.memberships.map((m) => [m.id, m.user.name]));
    log(`[${spec.key}] round ${round.number}: the pot goes to ${round.recipient?.user?.name}`);

    for (const c of round.contributions.filter((x) => x.status === "PENDING")) {
      const who = nameOf[c.membershipId];
      const m = members[who];
      const { approveUrl } = await call(m.token, "POST", `/contributions/${c.id}/checkout`, { redirect: `${BASE}/groups` });
      const t0 = Date.now();
      await approveOnPayPal(approveUrl, m.email, password, `${spec.key}-r${round.number}-${who}`);
      log(`[${spec.key}]   ${who} paid $${(c.amountCents / 100).toFixed(2)} on PayPal (${Math.round((Date.now() - t0) / 1000)} s)`);
    }

    // everyone paid: make the engine notice now, then the organizer approves the release
    let released = false;
    for (let i = 0; i < 40 && !released; i++) {
      await call(org.token, "POST", `/groups/${groupId}/tick`).catch(() => {});
      detail = await call(org.token, "GET", `/groups/${groupId}`);
      const action = detail.actions.find((a) => a.type === "RELEASE_POT");
      if (action) {
        await call(org.token, "POST", `/actions/${action.id}/approve`);
        log(`[${spec.key}]   pot of round ${round.number} approved: PayPal Payouts is sending it`);
        released = true;
      } else if (detail.rounds.find((x) => x.number === round.number)?.status === "PAID_OUT") {
        released = true;
      } else {
        await sleep(3000);
      }
    }
    if (!released) throw new Error(`the pot of round ${round.number} was never offered for release (see the circle's chat and AI log)`);

    // wait until the round is paid out; a failed payout is shown to the organizer in the app, who can retry it
    for (let i = 0; i < 20; i++) {
      detail = await call(org.token, "GET", `/groups/${groupId}`);
      if (detail.rounds.find((x) => x.number === round.number)?.status === "PAID_OUT") break;
      await sleep(2000);
    }
    const payout = detail.payouts?.find((p) => p.round === round.number && p.kind === "POT");
    log(`[${spec.key}]   round ${round.number} done${payout ? `: payout ${payout.status}` : ""}`);
    done++;
  }
}

// ---------------------------------------------------------------------------------------------------------------
async function main() {
  log(`server: ${BASE}`);
  const health = await call(null, "GET", "/health");
  log(`API ok (${health.mode} mode)`);
  const password = process.env.SANDBOX_PASSWORD ?? (await call(null, "GET", "/auth/demo/sandbox")).password;
  if (!password) throw new Error("The server does not publish the sandbox password: set SANDBOX_PASSWORD.");
  const members = await loadMembers();
  log(`demo members: ${Object.keys(members).join(", ")}`);
  const circles = CIRCLES.filter((c) => !ONLY || c.key === ONLY);
  if (!circles.length) throw new Error(`no circle "${ONLY}" (keys: ${CIRCLES.map((c) => c.key).join(", ")})`);
  for (const c of circles) for (const n of [c.organizer, ...c.members]) if (!members[n]) throw new Error(`"${c.key}" needs the demo member "${n}"`);
  if (CHECK) {
    log(`Chrome: ${chromePath()}`);
    log(`would run: ${circles.map((c) => `${c.key} (${1 + c.members.length} members, ${c.rounds} rounds, $${(c.contributionCents / 100).toFixed(2)} each)`).join("; ")}`);
    log("check passed. Nothing was created.");
    return;
  }
  for (const c of circles) {
    try {
      await runCircle(c, members, password);
    } catch (e) {
      console.error(`\n[${c.key}] stopped: ${e.message}\nRun it again to continue from here.\n`);
      process.exitCode = 1;
    }
  }
  log("finished");
}

main()
  .catch((e) => {
    console.error(e.message ?? e);
    process.exitCode = 1;
  })
  .finally(() => browser?.close());
