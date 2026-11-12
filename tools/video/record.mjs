/**
 * Records every scene of the video into work/clips/<scene>.mp4 (+ <scene>.cues.json with the sound effects to add).
 *
 *   node make.mjs record               all scenes
 *   node make.mjs record s04-assistant only that one (ids as in narration.mjs)
 *
 * A scene is a list of SHOTS. Each shot first PREPARES its page (navigate, wait for the data, even wait for the AI to
 * answer) with the camera off, then records. That is how waiting time is cut out: the viewer sees the answer as soon
 * as the shot starts. A shot that takes longer than its slot (a PayPal sign-in, for example) is sped up to fit.
 *
 * The app shown is the real one, in English, at AYNI_URL (default https://ayni.devsjec.com), with the data that
 * tools/real-data created.
 */
import fs from "fs";
import path from "path";
import puppeteer from "puppeteer-core";
import ffmpeg from "ffmpeg-static";
import { execFileSync } from "child_process";
import { pathToFileURL } from "url";
import { SCENES } from "./narration.mjs";
import { here, WORK, LEAD } from "./common.mjs";
import { Recorder } from "./recorder.mjs";

const BASE = (process.env.AYNI_URL ?? "https://ayni.devsjec.com").replace(/\/$/, "");
const API = `${BASE}/api`;
const CHROME = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toLocaleTimeString(), ...a);

// ------------------------------------------------------------------------------------------------ API
async function call(token, method, url, body) {
  const res = await fetch(`${API}${url}`, { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  if (!res.ok) throw new Error(`${method} ${url} -> ${res.status} ${String(typeof json === "string" ? json : JSON.stringify(json)).slice(0, 160)}`);
  return json;
}

let WORLD;
async function world() {
  if (WORLD) return WORLD;
  const users = await call(null, "GET", "/auth/demo/users");
  const member = {};
  for (const u of users) member[u.name] = { ...u, token: (await call(null, "POST", "/auth/demo", { userId: u.id })).token };
  const groups = await call(member["Doña Rosa"].token, "GET", "/groups");
  const g = (name) => {
    const f = groups.find((x) => x.name === name);
    if (!f) throw new Error(`group "${name}" not found: run tools/real-data first`);
    return f.id;
  };
  WORLD = { member, merchants: g("Pasanaku de los comerciantes"), feria: g("Pasanaku de la feria (PayPal real)"), barrio: g("Ahorro del barrio (PayPal real)") };
  return WORLD;
}

// ------------------------------------------------------------------------------------------------ the browser
let browser;
async function getBrowser() {
  browser ??= await puppeteer.launch({
    executablePath: CHROME,
    headless: "new",
    args: ["--no-sandbox", "--lang=en-US", "--allow-file-access-from-files", "--disable-blink-features=AutomationControlled", "--autoplay-policy=no-user-gesture-required"],
    defaultViewport: { width: 1440, height: 810, deviceScaleFactor: 4 / 3 },
  });
  return browser;
}

/** What every page gets before its own scripts run: English, the member's session, a visible pointer and captions. */
function pageSetup(token, flags = []) {
  return `(() => {
    try {
      Object.defineProperty(navigator, "language", { get: () => "en-US" });
      Object.defineProperty(navigator, "languages", { get: () => ["en-US", "en"] });
      localStorage.setItem("ayni_lang", "en");
      ${token ? `localStorage.setItem("ayni_token", ${JSON.stringify(token)});` : ""}
      ${flags.map((f) => `localStorage.setItem(${JSON.stringify(f)}, "1");`).join("")}
    } catch {}
    const ready = () => {
      if (document.getElementById("ay-cursor")) return;
      const st = document.createElement("style");
      st.textContent = \`
        #ay-cursor { position: fixed; left: 0; top: 0; z-index: 2147483647; pointer-events: none; width: 34px; height: 34px; transform: translate(-100px,-100px); filter: drop-shadow(2px 3px 2px rgba(0,0,0,.35)); }
        .ay-ripple { position: fixed; z-index: 2147483646; pointer-events: none; width: 20px; height: 20px; margin: -10px 0 0 -10px; border-radius: 50%; border: 4px solid #D4106B; animation: ayr .6s ease-out forwards; }
        @keyframes ayr { from { transform: scale(.4); opacity: 1 } to { transform: scale(3.2); opacity: 0 } }
        #ay-cap { position: fixed; left: 0; right: 0; bottom: 26px; z-index: 2147483645; text-align: center; pointer-events: none; font: 800 34px/1.15 Unbounded, 'Segoe UI', sans-serif; color: #1A1A3A; }
        #ay-cap span { display: inline-block; padding: 10px 24px; background: rgba(255,246,236,.95); border: 3px solid #1A1A3A; box-shadow: 6px 6px 0 #D4106B; opacity: 0; transform: translateY(14px); transition: opacity .35s, transform .35s; max-width: 1100px; }
        #ay-cap.on span { opacity: 1; transform: translateY(0); }
        #ay-ring { position: fixed; z-index: 2147483644; pointer-events: none; border: 4px solid #D4106B; border-radius: 8px; box-shadow: 0 0 0 6px rgba(212,16,107,.2); opacity: 0; transition: opacity .3s, left .45s, top .45s, width .45s, height .45s; }
      \`;
      document.head.appendChild(st);
      const c = document.createElement("div");
      c.id = "ay-cursor";
      c.innerHTML = '<svg viewBox="0 0 24 24" width="34" height="34"><path d="M4 2 L4 19 L8.6 14.8 L11.7 21.5 L14.4 20.3 L11.3 13.7 L17.6 13.5 Z" fill="#fff" stroke="#1A1A3A" stroke-width="1.7" stroke-linejoin="round"/></svg>';
      document.body.appendChild(c);
      const cap = document.createElement("div");
      cap.id = "ay-cap";
      cap.innerHTML = "<span></span>";
      document.body.appendChild(cap);
      const ring = document.createElement("div");
      ring.id = "ay-ring";
      document.body.appendChild(ring);
      document.addEventListener("mousemove", (e) => { c.style.transform = "translate(" + (e.clientX - 5) + "px," + (e.clientY - 3) + "px)"; }, true);
      document.addEventListener("mousedown", (e) => {
        const r = document.createElement("div");
        r.className = "ay-ripple";
        r.style.left = e.clientX + "px";
        r.style.top = e.clientY + "px";
        document.body.appendChild(r);
        setTimeout(() => r.remove(), 700);
      }, true);
      window.__cap = (text, on) => { const s = cap.querySelector("span"); if (text != null) s.textContent = text; cap.classList.toggle("on", !!on); };
      window.__ring = (x, y, w, h) => { if (w == null) { ring.style.opacity = 0; return; } Object.assign(ring.style, { left: x - 8 + "px", top: y - 8 + "px", width: w + 16 + "px", height: h + 16 + "px", opacity: 1 }); };
    };
    if (document.body) ready(); else document.addEventListener("DOMContentLoaded", ready);
    new MutationObserver(() => ready()).observe(document.documentElement, { childList: true });
  })()`;
}

async function openPage(token, { flags = [] } = {}) {
  const b = await getBrowser();
  const page = await b.newPage();
  await page.evaluateOnNewDocument(pageSetup(token, flags));
  page.on("dialog", (d) => d.dismiss().catch(() => {})); // the "swap turns?" confirmation is answered "no": nothing changes
  return page;
}

// ------------------------------------------------------------------------------------------------ helpers for the actions
const center = (b) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });
/** Polls every 100 ms (page.waitForFunction polls on animation frames, which crawl while a screencast is running). */
async function poll(page, fn, args, timeout) {
  const until = Date.now() + timeout;
  for (;;) {
    const h = await page.evaluateHandle(fn, ...args).catch(() => null);
    if (h && (await h.jsonValue().catch(() => null)) !== null && h.asElement()) return h.asElement();
    if (h) await h.dispose().catch(() => {});
    if (Date.now() > until) throw new Error("timed out waiting for the page");
    await sleep(100);
  }
}
async function find(page, sel, timeout = 60000) {
  return poll(page, (sel) => {
    const e = [...document.querySelectorAll(sel)].find((x) => { const b = x.getBoundingClientRect(); return b.width > 2 && b.height > 2 && getComputedStyle(x).visibility !== "hidden"; });
    return e || null;
  }, [sel], timeout);
}
/** First visible element whose text matches (React Native Web builds most controls from plain divs): the smallest one. */
async function byText(page, re, { within = "[role=button], button, a, div, span", timeout = 60000 } = {}) {
  return poll(page, (src, flags, within) => {
    const r = new RegExp(src, flags);
    const vis = (e) => { const b = e.getBoundingClientRect(); return b.width > 4 && b.height > 4 && getComputedStyle(e).visibility !== "hidden"; };
    const all = [...document.querySelectorAll(within)].filter((e) => vis(e) && r.test((e.innerText || "").trim()) && (e.innerText || "").trim().length < 120);
    all.sort((a, b) => a.getBoundingClientRect().width * a.getBoundingClientRect().height - b.getBoundingClientRect().width * b.getBoundingClientRect().height);
    return all[0] || null;
  }, [re.source, re.flags, within], timeout);
}
async function glide(page, x, y, ms = 700) {
  const from = await page.evaluate(() => { const c = document.getElementById("ay-cursor"); const m = c && /translate\(([-\d.]+)px,\s*([-\d.]+)px\)/.exec(c.style.transform); return m ? [Number(m[1]) + 5, Number(m[2]) + 3] : [640, 360]; });
  // driven by the clock, not by a fixed number of steps: it lasts `ms` however busy the recorder is
  const t0 = Date.now();
  for (;;) {
    const k = Math.min(1, (Date.now() - t0) / ms);
    const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    await page.mouse.move(from[0] + (x - from[0]) * e, from[1] + (y - from[1]) * e);
    if (k >= 1) break;
  }
}
async function moveTo(page, el, ms = 700, dx = 0, dy = 0) {
  await el.evaluate((e) => e.scrollIntoView({ block: "center", behavior: "instant" })).catch(() => {});
  const b = await el.boundingBox();
  if (!b) return;
  const c = center(b);
  await glide(page, c.x + dx, c.y + dy, ms);
}
async function clickEl(page, el, ms = 700) {
  await moveTo(page, el, ms);
  await sleep(120);
  await page.mouse.down();
  await sleep(70);
  await page.mouse.up();
}
const caption = (page, text, on = true) => page.evaluate((t, o) => window.__cap?.(t, o), text, on).catch(() => {});
const ring = (page, b) => page.evaluate((x, y, w, h) => window.__ring?.(x, y, w, h), b?.x, b?.y, b?.width, b?.height).catch(() => {});
async function ringEl(page, el) {
  // bring it into view first: the ring is placed on the screen, so the page must not move afterwards
  await el?.evaluate((e) => e.scrollIntoView({ block: "nearest", behavior: "instant" })).catch(() => {});
  await sleep(60);
  const b = el && (await el.boundingBox());
  await ring(page, b);
}

// ------------------------------------------------------------------------------------------------ shot runner
/**
 * shots: [{ at, prepare(page), act(page, h), retime }]  `at` is scene time in seconds (the first shot starts at 0).
 * h.wait(s): sleeps until s seconds after the shot started; h.cue(name, s, gain): a sound effect at shot-local time s.
 */
async function runShots(id, D, page, shots, extraCues = []) {
  const clips = [];
  const cues = [...extraCues];
  for (let i = 0; i < shots.length; i++) {
    if (process.env.ONLY_SHOT && Number(process.env.ONLY_SHOT) !== i) continue; // while developing a scene
    const s = shots[i];
    const start = s.at ?? 0;
    const end = shots[i + 1]?.at ?? D;
    const len = end - start;
    await s.prepare?.(page);
    const rec = new Recorder(page, path.join(WORK, "frames", `${id}-${i}`));
    await rec.start();
    const t0 = Date.now();
    const h = {
      wait: (sec) => sleep(Math.max(0, sec * 1000 - (Date.now() - t0))),
      cue: (name, sec, gain = 1) => cues.push({ sfx: name, at: start + sec, gain }),
      elapsed: () => (Date.now() - t0) / 1000,
    };
    await s.act?.(page, h);
    const out = path.join(WORK, "clips", `${id}.shot${i}.mp4`);
    if (s.retime) {
      const actual = h.elapsed();
      await rec.finish(out + ".raw.mp4", actual);
      const factor = len / actual;
      execFileSync(ffmpeg, ["-y", "-hide_banner", "-loglevel", "error", "-i", out + ".raw.mp4", "-vf", `setpts=${factor.toFixed(5)}*PTS,fps=30`, "-t", String(len), "-c:v", "libx264", "-preset", "veryfast", "-crf", "17", "-pix_fmt", "yuv420p", out], { stdio: "inherit" });
      fs.rmSync(out + ".raw.mp4");
      // cues made during a retimed shot were recorded in real time: squeeze them the same way
      for (const c of cues) if (c.at >= start && c.at < end && !c.squeezed) { c.at = start + (c.at - start) * factor; c.squeezed = true; }
      log(`  ${id} shot ${i + 1}/${shots.length}: ${len.toFixed(1)} s (sped up x${(1 / factor).toFixed(1)})`);
    } else {
      if (h.elapsed() > len + 0.4) log(`  ! ${id} shot ${i + 1} took ${h.elapsed().toFixed(1)} s for a ${len.toFixed(1)} s slot: it will be cut`);
      await rec.finish(out, len);
      log(`  ${id} shot ${i + 1}/${shots.length}: ${len.toFixed(1)} s`);
    }
    clips.push(out);
  }
  return { clips, cues };
}

function concat(id, clips) {
  const list = path.join(WORK, "clips", `${id}.txt`);
  fs.writeFileSync(list, clips.map((c) => `file '${c.replace(/\\/g, "/")}'`).join("\n"));
  const out = path.join(WORK, "clips", `${id}.mp4`);
  execFileSync(ffmpeg, ["-y", "-hide_banner", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", list, "-c", "copy", out], { stdio: "inherit" });
  for (const c of clips) fs.rmSync(c, { force: true });
  fs.rmSync(list, { force: true });
  return out;
}

// ------------------------------------------------------------------------------------------------ the scenes
const timingsOf = (id) => JSON.parse(fs.readFileSync(path.join(WORK, "vo", `${id}.json`), "utf8")).timings;
const sceneSeconds = (id) => {
  const t = timingsOf(id);
  return t[t.length - 1].end + 0.22 + 0.35 + 0.7; // same as durations() in common.mjs
};
/** Scene time at which sentence i starts. */
const sent = (id, i) => LEAD + timingsOf(id)[i].start;

async function storyScene(id, extra = {}) {
  const D = sceneSeconds(id);
  const page = await openPage(null);
  const timings = timingsOf(id);
  const logo = pathToFileURL(path.join(here, "..", "..", "propuesta", "logos", `ayni-logo-vertical-lema-en-${id === "s11-close" ? "amanecer" : "amanecer"}.svg`)).href;
  const shot = pathToFileURL(path.join(here, "..", "..", "docs", "screenshots", "en", "login.png")).href;
  await page.evaluateOnNewDocument((s, t, l, sh) => { window.__SCENE = s; window.__TIMINGS = t; window.__LOGO = l; window.__SHOT = sh; }, id, timings, logo, shot);
  await page.goto(pathToFileURL(path.join(here, "story.html")).href, { waitUntil: "networkidle0" });
  const rec = new Recorder(page, path.join(WORK, "frames", id));
  await rec.start();
  await page.evaluate(() => window.startScene());
  const out = path.join(WORK, "clips", `${id}.mp4`);
  await rec.finish(out, D);
  const cues = await page.evaluate(() => window.__cues);
  fs.writeFileSync(path.join(WORK, "clips", `${id}.cues.json`), JSON.stringify(cues));
  await page.close();
  log(`${id}: ${D.toFixed(1)} s, ${cues.length} sound cues`);
}

async function appScene(id, build) {
  const D = sceneSeconds(id);
  const w = await world();
  const { page, shots, cues = [] } = await build({ D, w, sent: (i) => sent(id, i), openPage });
  const r = await runShots(id, D, page, shots, cues);
  if (process.env.ONLY_SHOT) { log(`(only shot ${process.env.ONLY_SHOT}: clips kept in work/clips)`); await page.close(); return; }
  concat(id, r.clips);
  fs.writeFileSync(path.join(WORK, "clips", `${id}.cues.json`), JSON.stringify(r.cues));
  await page.close();
  log(`${id}: ${D.toFixed(1)} s in ${shots.length} shot(s)`);
}

export const HELPERS = { find, byText, glide, moveTo, clickEl, caption, ring, ringEl, sleep, BASE, call, openPage };

const BUILDERS = {
  "s01-story": () => storyScene("s01-story"),
  "s02-reveal": () => storyScene("s02-reveal"),
  "s11-close": () => storyScene("s11-close"),
};

export async function run(only = []) {
  const { APP_SCENES } = await import("./app-scenes.mjs");
  const all = { ...BUILDERS, ...Object.fromEntries(Object.entries(APP_SCENES).map(([id, b]) => [id, () => appScene(id, b)])) };
  const ids = only.length ? only : SCENES.map((s) => s.id);
  try {
    for (const id of ids) {
      if (!all[id]) { log(`(no recording defined for ${id} yet)`); continue; }
      log(`recording ${id}`);
      await all[id]();
    }
  } finally {
    await browser?.close();
  }
}
