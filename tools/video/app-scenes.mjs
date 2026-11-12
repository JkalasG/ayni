/**
 * The scenes that show the real app. Each builder returns { page, shots, cues } for runShots() in record.mjs.
 * Nothing here changes the app's data except the one payment in s05-pay (a real sandbox payment, like the others).
 */
import path from "path";
import { pathToFileURL } from "url";
import { HELPERS } from "./record.mjs";
import { here } from "./common.mjs";

const { find, byText, glide, moveTo, clickEl, caption, ring, ringEl, sleep, BASE, call, openPage: openRaw } = HELPERS;

/** The app celebrates a pot the first time you see it on a device: mark every pot as already seen, so nothing covers the screen. */
async function potFlags(token) {
  const groups = await call(token, "GET", "/groups");
  const keys = [];
  for (const g of groups) {
    const d = await call(token, "GET", `/groups/${g.id}`).catch(() => null);
    for (const r of d?.rounds ?? []) keys.push(`ayni_pot_${r.id}`);
  }
  return keys;
}
const openPage = async (token) => (token ? openRaw(token, { flags: await potFlags(token) }) : openRaw(null));

const log = (...a) => console.log(new Date().toLocaleTimeString(), ...a);
const escapeRe = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const go = (page, url) => page.goto(/^(https?|file):/.test(url) ? url : `${BASE}${url}`, { waitUntil: "domcontentloaded", timeout: 90000 });
/** The card that contains an element: climbs until it is wide enough to be the whole card. */
const cardOf = (el, minW = 600, minH = 120) =>
  el.evaluateHandle((e, minW, minH) => {
    let n = e;
    while (n.parentElement && (n.getBoundingClientRect().width < minW || n.getBoundingClientRect().height < minH)) n = n.parentElement;
    return n;
  }, minW, minH).then((h) => h.asElement());
const scrollTo = (page, y, ms = 1200) =>
  page.evaluate(async (y, ms) => {
    const scroller = [...document.querySelectorAll("*")].find((e) => e.scrollHeight > e.clientHeight + 50 && ["auto", "scroll"].includes(getComputedStyle(e).overflowY)) || document.scrollingElement;
    const from = scroller.scrollTop, t0 = performance.now();
    await new Promise((res) => {
      const tick = (now) => {
        const k = Math.min(1, (now - t0) / ms);
        scroller.scrollTop = from + (y - from) * (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
        k < 1 ? requestAnimationFrame(tick) : res();
      };
      requestAnimationFrame(tick);
    });
  }, y, ms);
/** Moves the visible pointer onto an element and presses it from the page (PayPal's pages ignore a bare mouse press on some buttons). */
const tapEl = async (page, el, ms = 450) => {
  await moveTo(page, el, ms);
  await sleep(120);
  await page.mouse.down().catch(() => {});
  await sleep(60);
  await page.mouse.up().catch(() => {});
  await el.evaluate((e) => (e.closest("button, a, [role=button], input[type=submit]") ?? e).click()).catch(() => {});
};

export const APP_SCENES = {
  // -------------------------------------------------------------------------------------------- login
  "s03-login": async ({ w, sent }) => {
    const page = await openPage(null);
    return {
      page,
      shots: [
        {
          at: 0,
          prepare: async () => { await go(page, "/"); await byText(page, /Log in with/i); await sleep(1500); },
          act: async (p, h) => {
            await caption(p, "Sign in with PayPal", true);
            h.cue("tick", 0.2, 0.5);
            const btn = await byText(p, /^Log in with/i);
            await ringEl(p, btn);
            await moveTo(p, btn, 900);
            await h.wait(sent(1) - 0.15 - 0.3);
            await ring(p, null);
          },
        },
        {
          at: sent(1) - 0.15,
          act: async (p, h) => {
            await caption(p, "Sandbox accounts, ready to copy", true);
            h.cue("tick", 0.2, 0.5);
            const tag = await find(p, '[aria-label="Logins"]');
            await clickEl(p, tag, 900);
            h.cue("pop", 1.2, 0.8);
            await sleep(1100);
            await caption(p, "", false);
            const copy = await byText(p, /^Copy$/);
            await clickEl(p, copy, 800);
            h.cue("coin", 3.2, 0.7);
            await sleep(700);
            await scrollTo(p, 260, 1800);
          },
        },
      ],
    };
  },

  // -------------------------------------------------------------------------------------------- the assistant
  "s04-assistant": async ({ w, sent }) => {
    const page = await openPage(w.member["Doña Rosa"].token);
    return {
      page,
      shots: [
        {
          at: 0,
          prepare: async () => { await go(page, `/groups/${w.merchants}`); await byText(page, /Send reminder|Send invoice/i, { timeout: 120000 }); await sleep(1200); },
          act: async (p, h) => {
            await caption(p, "The assistant reads the group and PayPal", true);
            h.cue("tick", 0.2, 0.5);
            const title = await byText(p, /^Ayni assistant$/i);
            await ringEl(p, await cardOf(title, 900, 200));
            await h.wait(sent(1) - 0.1);
            await caption(p, "A gentle reminder, or a PayPal invoice", true);
            // the steps the assistant proposes (which ones depends on the group): look at each in turn
            const buttons = [];
            for (const re of [/^Send reminder$/i, /^Send invoice$/i]) {
              const b = await byText(p, re, { timeout: 2500 }).catch(() => null);
              if (b) buttons.push(b);
            }
            for (const b of buttons) {
              await ringEl(p, await cardOf(b, 350, 150));
              await moveTo(p, b, 800);
              await sleep(1700);
            }
            await h.wait(sent(2) - 0.1);
            await caption(p, "Nothing happens until she taps", true);
            await ring(p, null);
            if (buttons[0]) await moveTo(p, buttons[0], 900);
          },
        },
      ],
    };
  },

  // -------------------------------------------------------------------------------------------- paying with PayPal
  "s05-pay": async ({ w, sent, D }) => {
    // whoever still has a payment pending in the open round of the barrio circle
    let payer;
    for (const name of ["Tomás", "Doña Rosa", "Marisol", "Wara"]) {
      const m = w.member[name];
      const d = await call(m.token, "GET", `/groups/${w.barrio}`);
      const round = d.rounds.find((r) => r.status === "COLLECTING");
      if (round?.contributions.some((c) => c.membershipId === d.myMembershipId && c.status === "PENDING")) { payer = m; break; }
    }
    if (!payer) throw new Error("everybody has already paid in the open round of the barrio circle");
    log(`  the payment is made by ${payer.name}`);
    const page = await openPage(payer.token);
    let approveUrl;
    const tail = 2.2; // the last seconds, at normal speed: the confirmation
    return {
      page,
      shots: [
        {
          at: 0,
          prepare: async () => {
            await go(page, `/groups/${w.barrio}`);
            await byText(page, /^Pay \$\d/, { timeout: 120000 });
            await sleep(900);
          },
          act: async (p, h) => {
            await caption(p, "Two taps to pay", true);
            h.cue("tick", 0.2, 0.5);
            const pay = await byText(p, /^Pay \$\d/);
            await ringEl(p, pay);
            await moveTo(p, pay, 900);
            // (it is only shown here: the real payment is made in the next shot)
            h.cue("pop", 1.2, 0.9);
            await h.wait(sent(1) - 0.1);
            await ring(p, null);
          },
        },
        {
          at: sent(1) - 0.1,
          retime: true,
          prepare: async () => {
            // make the order the same way the app does, and open PayPal's page for it
            const d = await call(payer.token, "GET", `/groups/${w.barrio}`);
            const round = d.rounds.find((r) => r.status === "COLLECTING");
            const mine = round.contributions.find((c) => c.membershipId === d.myMembershipId && c.status === "PENDING");
            if (!mine) throw new Error(`${payer.name} has nothing pending in the barrio circle`);
            approveUrl = (await call(payer.token, "POST", `/contributions/${mine.id}/checkout`, { redirect: `${BASE}/groups/${w.barrio}` })).approveUrl;
          },
          act: async (p, h) => {
            await caption(p, "PayPal Checkout", true);
            h.cue("whoosh", 0.1, 0.5);
            await p.goto(approveUrl, { waitUntil: "domcontentloaded", timeout: 90000 });
            const t0 = Date.now();
            const password = process.env.SANDBOX_PASSWORD ?? (await call(null, "GET", "/auth/demo/sandbox")).password;
            let typedEmail = false, typedPw = false, clickedLogin = false, pwAt = 0;
            while (Date.now() - t0 < 100000) {
              if (p.url().startsWith(BASE)) break;
              const st = await p.evaluate(() => {
                const vis = (e) => e && e.offsetParent !== null;
                const q = (s) => [...document.querySelectorAll(s)].find(vis);
                if (q("input[type=password]")) return "pw";
                if (q("input[type=email], input#email, input[name=login_email]")) return "email";
                const b = [...document.querySelectorAll("button, a[role=button], input[type=submit]")].filter(vis).find((x) => /pay now|complete purchase|continue|agree/i.test((x.innerText || x.value || "").trim()));
                return b ? "btn:" + (b.innerText || b.value).trim() : "wait";
              }).catch(() => "wait");
              if (st === "email" && !typedEmail) {
                const el = await p.$("input[type=email], input#email, input[name=login_email]");
                await clickEl(p, el, 450);
                await p.keyboard.type(payer.email, { delay: 28 });
                typedEmail = true;
                const next = await p.$("#btnNext, button[type=submit]");
                if (next) await tapEl(p, next, 450);
              } else if (st === "pw") {
                if (!typedPw) {
                  const el = await p.$("input[type=password]");
                  await clickEl(p, el, 400);
                  await p.keyboard.type(password, { delay: 28 });
                  typedPw = true; pwAt = Date.now();
                }
                if (!clickedLogin || Date.now() - pwAt > 8000) {
                  clickedLogin = true; pwAt = Date.now();
                  const b = await byText(p, /^(log in|login)$/i, { timeout: 5000 }).catch(() => null);
                  if (b) await tapEl(p, b, 450); else await p.keyboard.press("Enter");
                }
              } else if (st.startsWith("btn:")) {
                const label = st.slice(4);
                const b = await byText(p, new RegExp("^" + escapeRe(label) + "$", "i"), { timeout: 5000 }).catch(() => null);
                if (b) await tapEl(p, b, 450);
              }
              if (process.env.DEBUG_PAYPAL) console.log(`  [paypal ${((Date.now() - t0) / 1000).toFixed(1)}s] ${st} ${p.url().slice(0, 70)}`);
              await sleep(400);
            }
            h.cue("coin", h.elapsed(), 1);
          },
        },
        {
          // back in Ayni: wait (camera off) for the page and the assistant, then show the confirmation
          at: D - tail,
          prepare: async () => {
            await byText(page, /You paid this round/i, { timeout: 90000 });
            await page.waitForFunction(() => !/Reading the group/.test(document.body.innerText), { timeout: 60000, polling: 200 }).catch(() => {});
            await sleep(600);
          },
          act: async (p, h) => {
            await caption(p, "Payment confirmed", true);
            h.cue("chime", 0.1, 0.8);
            const ok = await byText(p, /You paid this round/i, { timeout: 3000 }).catch(() => null);
            if (ok) await ringEl(p, await cardOf(ok, 260, 80));
            await h.wait(tail);
          },
        },
      ],
    };
  },

  // -------------------------------------------------------------------------------------------- the pot leaves
  "s06-pot": async ({ w, sent }) => {
    const page = await openPage(w.member["Doña Rosa"].token);
    return {
      page,
      shots: [
        {
          at: 0,
          prepare: async () => { await go(page, `/groups/${w.feria}/payments`); await byText(page, /Completed/i, { timeout: 90000 }); await sleep(900); },
          act: async (p, h) => {
            await caption(p, "Every cent traced to PayPal", true);
            h.cue("tick", 0.2, 0.5);
            const row = await byText(p, /Pot sent|Pot payout|Payout|Pot/i, { within: "div" }).catch(() => null);
            if (row) await moveTo(p, row, 900);
            await h.wait(1.8);
            await scrollTo(p, 420, 2200);
            h.cue("coin", 2.0, 0.6);
            await h.wait(sent(1) - 0.2);
          },
        },
        {
          at: sent(1) - 0.15,
          prepare: async () => { await go(page, `/groups/${w.feria}/chat`); await byText(page, /Pot of round|sent to/i, { timeout: 90000 }).catch(() => {}); await sleep(900); },
          act: async (p, h) => {
            await caption(p, "The pot goes out with PayPal Payouts", true);
            h.cue("tick", 0.2, 0.5);
            h.cue("chime", 1.0, 0.8);
            const card = await byText(p, /Pot of round|sent to/i, { within: "div", timeout: 5000 }).catch(() => null);
            if (card) { await moveTo(p, card, 800); await sleep(500); await ringEl(p, await cardOf(card, 300, 50)); }
            await h.wait(sent(2) - sent(1) + 0.6);
            await caption(p, "If someone stops paying, the guarantee covers the group", true);
            await ring(p, null);
          },
        },
      ],
    };
  },

  // -------------------------------------------------------------------------------------------- the private assistant
  "s07-chat": async ({ w, sent }) => {
    const rosa = w.member["Doña Rosa"]; // a clean private chat: no earlier failed attempts on screen
    const page = await openPage(rosa.token);
    const question = "How much do I owe, and when is my turn?";
    const failed = (t) => /couldn't finish|try again/i.test(t ?? "");
    /** Asks through the API until the model really answers (the free model tier is sometimes busy). */
    const goodAnswer = async () => {
      for (let i = 0; i < 12; i++) {
        const r = await call(rosa.token, "POST", `/groups/${w.barrio}/chat`, { text: question, toAssistant: true }).catch(() => null);
        if (r && r.reply && !failed(r.reply)) return r.reply;
        log(`  the model did not answer (try ${i + 1}); waiting`);
        await sleep(12000);
      }
      throw new Error("the model never answered");
    };
    let before = 0;
    const lastLabel = (pg) => pg.evaluateHandle(() => [...document.querySelectorAll("div, span")].filter((e) => /^Ayni\s*·\s*Private/.test((e.innerText || "").trim()) && e.children.length === 0).pop() ?? null).then((h) => h.asElement());
    return {
      page,
      shots: [
        {
          at: 0,
          prepare: async () => {
            await go(page, `/groups/${w.barrio}/chat`);
            await byText(page, /To Ayni, in private/i, { timeout: 90000 });
            await sleep(900);
            before = await page.evaluate(() => [...document.querySelectorAll("div, span")].filter((e) => /^Ayni\s*·\s*Private/.test((e.innerText || "").trim()) && e.children.length === 0).length);
          },
          act: async (p, h) => {
            await caption(p, "Ask the assistant, in private", true);
            h.cue("tick", 0.2, 0.5);
            const tab = await byText(p, /To Ayni, in private/i);
            await clickEl(p, tab, 500);
            h.cue("pop", 0.7, 0.8);
            const input = await find(p, "input, textarea");
            await clickEl(p, input, 400);
            await p.keyboard.type(question, { delay: 22 });
            h.cue("tick", 1.5, 0.4);
            const send = await byText(p, /^Send$/);
            await clickEl(p, send, 400);
            h.cue("pop", h.elapsed(), 0.9);
          },
        },
        {
          // the answer takes a few seconds: wait for it with the camera off, then record the answer on screen
          at: sent(1) - 0.1,
          prepare: async () => {
            // wait for the NEW answer: there is one more "Ayni · Private" label than before the question
            const count = () => page.evaluate(() => [...document.querySelectorAll("div, span")].filter((e) => /^Ayni\s*·\s*Private/.test((e.innerText || "").trim()) && e.children.length === 0).length);
            const until = Date.now() + 120000;
            while ((await count()) <= before && Date.now() < until) await sleep(250);
            await sleep(600);
            const lastText = await page.evaluate(() => { const l = [...document.querySelectorAll("div, span")].filter((e) => /^Ayni\s*·\s*Private/.test((e.innerText || "").trim()) && e.children.length === 0).pop(); return l?.parentElement?.innerText ?? ""; });
            if (failed(lastText)) {
              await goodAnswer();
              await go(page, `/groups/${w.barrio}/chat`);
              await (await byText(page, /To Ayni, in private/i, { timeout: 90000 })).evaluate((e) => e.click());
              await sleep(1200);
            }
            // for the camera only: leave the last question and its answer, hide the older messages above them
            await page.evaluate((q) => {
              const bubbles = [...document.querySelectorAll("div")].filter((e) => e.children.length === 0 && (e.innerText || "").trim() === q);
              let n = bubbles.pop();
              while (n && n.parentElement && n.parentElement.children.length < 4) n = n.parentElement;
              const box = n?.parentElement;
              if (!box) return;
              for (const sib of [...box.children]) { if (sib === n) break; sib.style.display = "none"; }
            }, question).catch(() => {});
            await lastLabel(page).then((l) => l?.evaluate((e) => e.scrollIntoView({ block: "center", behavior: "instant" })));
            await sleep(1000);
          },
          act: async (p, h) => {
            await caption(p, "Real data, in the member's language", true);
            h.cue("notify", 0.2, 0.8);
            const label = await lastLabel(p);
            if (label) { await moveTo(p, label, 800); await sleep(300); await ringEl(p, await cardOf(label, 300, 70)); }
            await h.wait(sent(3) - sent(1) + 1.2);
            await ring(p, null);
          },
        },
      ],
    };
  },

  // -------------------------------------------------------------------------------------------- Bryntum
  "s08-bryntum": async ({ w, sent }) => {
    const page = await openPage(w.member["Doña Rosa"].token);
    const waitSched = async (url, sel = ".b-sch-event") => { await go(page, url); await page.waitForSelector(sel, { visible: true, timeout: 120000 }); await sleep(1500); };
    return {
      page,
      shots: [
        {
          at: 0,
          prepare: async () => waitSched(`/groups/${w.merchants}/timeline`),
          act: async (p, h) => {
            await caption(p, "Turn timeline · Bryntum Scheduler", true);
            h.cue("tick", 0.2, 0.5);
            h.cue("whoosh", 0.1, 0.4);
            const bars = await p.$$(".b-sch-event");
            const first = bars[0];
            await moveTo(p, first, 900);
            await h.wait(sent(2) - 0.2);
            // drag round 5 onto another member: the app asks to confirm and we answer "no"
            await caption(p, "Drag a turn to swap it", true);
            const labels = await p.$$eval(".b-sch-event", (els) => els.map((e) => ({ t: e.textContent.trim(), r: e.getBoundingClientRect().toJSON() })));
            const from = labels.find((l) => /Round 5/.test(l.t)) ?? labels[labels.length - 1];
            const to = labels.find((l) => /Round 2/.test(l.t)) ?? labels[1];
            const fx = from.r.x + from.r.width / 2, fy = from.r.y + from.r.height / 2;
            const ty = to.r.y + to.r.height / 2;
            await glide(p, fx, fy, 700);
            await p.mouse.down();
            h.cue("pop", h.elapsed(), 0.8);
            await sleep(150);
            await glide(p, fx - 40, (fy + ty) / 2, 500);
            await glide(p, fx - 40, ty, 600);
            h.cue("swap", h.elapsed(), 0.8);
            await sleep(400);
            await p.mouse.up();
            await sleep(900);
          },
        },
        {
          at: sent(3) - 0.15,
          prepare: async () => { await waitSched(`/groups/${w.merchants}`); await page.evaluate(() => { const el = document.querySelector(".b-sch-event"); el?.scrollIntoView({ block: "center" }); }); await sleep(800); },
          act: async (p, h) => {
            await caption(p, "Payment schedule · who has paid", true);
            h.cue("whoosh", 0.1, 0.4);
            const cells = await p.$$(".b-sch-event");
            for (const [i, c] of [cells[5], cells[11]].entries()) { if (c) { await moveTo(p, c, 600); await sleep(350); h.cue("pop", h.elapsed(), 0.4); } }
            await h.wait(sent(4) - sent(3) - 0.3);
          },
        },
        {
          at: sent(4) - 0.15,
          prepare: async () => waitSched(`/groups/${w.merchants}/guarantee`),
          act: async (p, h) => {
            await caption(p, "Guarantee timeline · where each guarantee is", true);
            h.cue("whoosh", 0.1, 0.4);
            const bars = await p.$$(".b-sch-event");
            for (const c of [bars[0], bars[1]]) { if (c) { await moveTo(p, c, 900); await sleep(700); h.cue("pop", h.elapsed(), 0.4); } }
            await h.wait(sent(5) - sent(4) - 0.3);
          },
        },
        {
          at: sent(5) - 0.15,
          prepare: async () => { await go(page, "/calendar"); await page.waitForSelector(".b-cal-event, .b-calendar", { visible: true, timeout: 120000 }); await sleep(2000); },
          act: async (p, h) => {
            await caption(p, "My calendar · Bryntum Calendar", true);
            h.cue("whoosh", 0.1, 0.4);
            const ev = await p.$(".b-cal-event");
            if (ev) { await clickEl(p, ev, 900); h.cue("pop", h.elapsed(), 0.8); }
            await sleep(1200);
            h.cue("chime", h.elapsed(), 0.7);
          },
        },
      ],
    };
  },

  // -------------------------------------------------------------------------------------------- trust + open circles
  "s09-trust": async ({ w, sent }) => {
    const page = await openPage(w.member["Tomás"].token);
    return {
      page,
      shots: [
        {
          at: 0,
          prepare: async () => { await go(page, "/profile"); await byText(page, /on-time payments/i, { timeout: 90000 }); await sleep(1200); },
          act: async (p, h) => {
            await caption(p, "Trust passport: built only from how you pay", true);
            h.cue("tick", 0.2, 0.5);
            const pct = await byText(p, /on-time payments/i);
            await ringEl(p, await cardOf(pct, 200, 80));
            await moveTo(p, pct, 900);
            await h.wait(sent(1) - 0.3);
            await ring(p, null);
          },
        },
        {
          at: sent(1) - 0.15,
          prepare: async () => { await go(page, "/explore"); await byText(page, /Open pasanakus/i, { timeout: 90000 }); await sleep(1800); },
          act: async (p, h) => {
            await caption(p, "Open circles between strangers, across countries", true);
            h.cue("whoosh", 0.1, 0.4);
            const chip = await byText(p, /^Spain/i).catch(() => null);
            if (chip) { await clickEl(p, chip, 900); h.cue("pop", h.elapsed(), 0.7); }
            await sleep(1500);
            await scrollTo(p, 520, 2200);
          },
        },
      ],
    };
  },

  // -------------------------------------------------------------------------------------------- safety and the numbers
  "s10-safety": async ({ w, sent }) => {
    const page = await openPage(w.member["Doña Rosa"].token);
    const storyUrl = pathToFileURL(path.join(here, "story.html")).href + "?scene=card-eval";
    return {
      page,
      shots: [
        {
          at: 0,
          prepare: async () => { await go(page, `/groups/${w.merchants}/ai-log`); await byText(page, /Assistant|Group reading/i, { timeout: 90000 }); await sleep(1200); },
          act: async (p, h) => {
            await caption(p, "The AI never moves money or writes an amount", true);
            h.cue("tick", 0.2, 0.5);
            const first = await byText(p, /^Assistant$/).catch(() => null);
            if (first) await moveTo(p, first, 900);
            await h.wait(sent(1) - 0.1);
            await caption(p, "Other members' messages are data, not orders", true);
            h.cue("tick", sent(1), 0.5);
            await h.wait(sent(2) - 0.1);
            await caption(p, "Every action is logged for the whole group", true);
            h.cue("tick", sent(2), 0.5);
            await scrollTo(p, 380, 2200);
            await h.wait(sent(3) - 0.3);
          },
        },
        {
          at: sent(3) - 0.15,
          prepare: async () => {
            await page.evaluateOnNewDocument(() => {});
            await go(page, storyUrl);
            await page.waitForSelector("#stage", { timeout: 60000 }).catch(() => {});
          },
          act: async (p, h) => {
            await caption(p, "", false);
            await p.evaluate(() => window.startScene());
            h.cue("whoosh", 0.1, 0.5);
            await h.wait(5.0);
            const cues = await p.evaluate(() => window.__cues);
            for (const c of cues) h.cue(c.sfx, c.at, c.gain);
          },
        },
      ],
    };
  },
};

// small helper kept at the bottom so the scene definitions read top-down
async function p0() {}
