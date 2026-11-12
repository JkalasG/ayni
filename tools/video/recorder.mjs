/**
 * Screen recorder for a Chrome page, built on the DevTools screencast: Chrome sends a JPEG every time the picture
 * changes, with its timestamp. We keep each frame and let ffmpeg turn them into a constant 30 fps video, holding every
 * frame for as long as it was really on screen. (Puppeteer's own page.screencast writes an empty file on this setup.)
 */
import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
import ffmpeg from "ffmpeg-static";

export class Recorder {
  constructor(page, dir, { width = 1920, height = 1080, quality = 88 } = {}) {
    this.page = page;
    this.dir = dir;
    this.opts = { width, height, quality };
    this.frames = [];
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
  }

  async start() {
    this.cdp = await this.page.createCDPSession();
    this.cdp.on("Page.screencastFrame", async ({ data, metadata, sessionId }) => {
      const file = path.join(this.dir, `f${String(this.frames.length).padStart(6, "0")}.jpg`);
      fs.writeFileSync(file, Buffer.from(data, "base64"));
      this.frames.push({ file, ts: metadata.timestamp });
      await this.cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
    });
    await this.cdp.send("Page.startScreencast", { format: "jpeg", quality: this.opts.quality, maxWidth: this.opts.width, maxHeight: this.opts.height, everyNthFrame: 1 });
    this.startedAt = Date.now();
  }

  /** Stops after `seconds` of recording in total (counted from start) and writes the video. */
  async finish(out, seconds) {
    const left = seconds * 1000 - (Date.now() - this.startedAt);
    if (left > 0) await new Promise((r) => setTimeout(r, left));
    await this.cdp.send("Page.stopScreencast").catch(() => {});
    await new Promise((r) => setTimeout(r, 150));
    if (this.frames.length < 2) throw new Error("the screencast produced no frames");
    // hold each frame until the next one; the last one until the requested end
    const list = [];
    const t0 = this.frames[0].ts;
    this.frames.forEach((f, i) => {
      const next = i + 1 < this.frames.length ? this.frames[i + 1].ts : t0 + seconds;
      list.push(`file '${f.file.replace(/\\/g, "/")}'`, `duration ${Math.max(0.001, next - f.ts).toFixed(4)}`);
    });
    list.push(`file '${this.frames[this.frames.length - 1].file.replace(/\\/g, "/")}'`);
    const txt = path.join(this.dir, "frames.txt");
    fs.writeFileSync(txt, list.join("\n"));
    execFileSync(ffmpeg, ["-y", "-hide_banner", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", txt, "-vf", `fps=30,scale=${this.opts.width}:${this.opts.height}:flags=lanczos,format=yuv420p`, "-t", String(seconds), "-c:v", "libx264", "-preset", "veryfast", "-crf", "17", "-movflags", "+faststart", out], { stdio: "inherit" });
    const n = this.frames.length;
    fs.rmSync(this.dir, { recursive: true, force: true });
    return n;
  }
}
