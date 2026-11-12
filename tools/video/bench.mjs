import puppeteer from "puppeteer-core";
import path from "path";
import { WORK } from "./common.mjs";
import { Recorder } from "./recorder.mjs";
const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: "new", args: ["--no-sandbox"], defaultViewport: { width: 1280, height: 720, deviceScaleFactor: 1.5 } });
const page = await browser.newPage();
await page.goto("https://ayni.devsjec.com/", { waitUntil: "domcontentloaded" });
await new Promise((r) => setTimeout(r, 4000));
async function lat(label, fn, n = 8) { const t = Date.now(); for (let i = 0; i < n; i++) await fn(i); console.log(label, ((Date.now() - t) / n).toFixed(0), "ms each"); }
await lat("evaluate (idle)", () => page.evaluate(() => 1));
await lat("mouse.move (idle)", (i) => page.mouse.move(100 + i, 100));
const rec = new Recorder(page, path.join(WORK, "frames-bench"), { width: Number(process.env.W ?? 1920), height: Number(process.env.H ?? 1080), quality: Number(process.env.Q ?? 88) });
await rec.start();
await lat("evaluate (recording)", () => page.evaluate(() => 1));
await lat("mouse.move (recording)", (i) => page.mouse.move(100 + i * 20, 100 + i * 10));
await lat("waitForFunction (recording)", () => page.waitForFunction(() => document.body.innerText.length > 10), 4);
console.log("frames so far", rec.frames.length);
await rec.finish(path.join(WORK, "clips", "bench.mp4"), 1);
await browser.close();
