// node brand.mjs <propuesta dir> : renders every SVG to a PNG next to it (in png/), with the web fonts loaded
import puppeteer from "puppeteer-core";
import fs from "fs";
import path from "path";
const root = process.argv[2];
const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
for (const dir of ["logos", "banners"]) {
  const out = path.join(root, "png", dir);
  fs.mkdirSync(out, { recursive: true });
  for (const f of fs.readdirSync(path.join(root, dir)).filter((x) => x.endsWith(".svg"))) {
    const svg = fs.readFileSync(path.join(root, dir, f), "utf8");
    const w = Number(svg.match(/width="(\d+)"/)[1]);
    const h = Number(svg.match(/height="(\d+)"/)[1]);
    const page = await browser.newPage();
    await page.setViewport({ width: w, height: h, deviceScaleFactor: dir === "logos" && w < 1024 ? 2 : 1 });
    await page.setContent(`<!doctype html><html><head><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Unbounded:wght@700;900&family=Figtree:wght@400;700&display=swap"><style>html,body{margin:0;background:transparent}</style></head><body>${svg}</body></html>`, { waitUntil: "networkidle0" });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: path.join(out, f.replace(".svg", ".png")), omitBackground: true, clip: { x: 0, y: 0, width: w, height: h } });
    await page.close();
    console.log(dir, f);
  }
}
await browser.close();
