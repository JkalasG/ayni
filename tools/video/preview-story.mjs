// node preview-story.mjs s01-story 2 8 14 20 26   -> work/preview/<scene>-<t>.png
import puppeteer from "puppeteer-core";
import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";
import { here, WORK } from "./common.mjs";

const [scene, ...times] = process.argv.slice(2);
const timings = JSON.parse(fs.readFileSync(path.join(WORK, "vo", `${scene}.json`), "utf8")).timings;
const logo = pathToFileURL(path.join(here, "..", "..", "propuesta", "logos", "ayni-logo-vertical-lema-en-amanecer.svg")).href;
const shot = pathToFileURL(path.join(here, "..", "..", "docs", "screenshots", "en", "login.png")).href;
const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: "new", args: ["--no-sandbox", "--allow-file-access-from-files"], defaultViewport: { width: 1280, height: 720 } });
const page = await browser.newPage();
await page.evaluateOnNewDocument((s, t, l, sh) => { window.__SCENE = s; window.__TIMINGS = t; window.__LOGO = l; window.__SHOT = sh; }, scene, timings, logo, shot);
await page.goto(pathToFileURL(path.join(here, "story.html")).href, { waitUntil: "networkidle0" });
fs.mkdirSync(path.join(WORK, "preview"), { recursive: true });
await page.evaluate(() => window.startScene());
const t0 = Date.now();
for (const t of times.map(Number)) {
  await new Promise((r) => setTimeout(r, Math.max(0, t * 1000 - (Date.now() - t0))));
  await page.screenshot({ path: path.join(WORK, "preview", `${scene}-${t}.png`) });
  console.log("shot", t);
}
console.log("cues", JSON.stringify(await page.evaluate(() => window.__cues)).slice(0, 300));
await browser.close();
