/**
 * Builds the demo video in stages, so each one can be checked on its own:
 *
 *   node make.mjs tts             voice-over of every scene (Windows speech) + how long each lasts
 *   node make.mjs audio           music and sound effects, synthesized in code (nothing from third parties)
 *   node make.mjs record [id...]  records the scenes (the animated story and the real app)
 *   node make.mjs mix             edits everything into out/ayni-demo.mp4
 *
 * Work files go to ./work (not committed); the video to ./out.
 */
import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
import { SCENES } from "./narration.mjs";

import { here, WORK, LEAD, TAIL, wavSeconds } from "./common.mjs";

/** Reads the PCM samples (16-bit mono) of a wav file written by the speech engine. */
function pcmOf(file) {
  const b = fs.readFileSync(file);
  let i = 12;
  while (i < b.length - 8) {
    const id = b.toString("ascii", i, i + 4);
    const size = b.readUInt32LE(i + 4);
    if (id === "data") return b.subarray(i + 8, i + 8 + size);
    i += 8 + size;
  }
  throw new Error("no data chunk in " + file);
}

function writeWav(file, pcm) {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0);
  h.writeUInt32LE(36 + pcm.length, 4);
  h.write("WAVEfmt ", 8);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(44100, 24);
  h.writeUInt32LE(88200, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write("data", 36);
  h.writeUInt32LE(pcm.length, 40);
  fs.writeFileSync(file, Buffer.concat([h, pcm]));
}

/**
 * Every sentence is spoken on its own and then joined with a short pause, so we know exactly when each one starts:
 * the pictures of a scene are timed to those moments (work/vo/<scene>.json).
 */
function tts() {
  const GAP = 0.22;
  let total = 0;
  for (const s of SCENES) {
    const sentences = s.vo.split(/(?<=[.?!])\s+/).filter(Boolean);
    const parts = [];
    const timings = [];
    let at = 0;
    sentences.forEach((text, i) => {
      const txt = path.join(WORK, "vo", `${s.id}.${i}.txt`);
      const wav = path.join(WORK, "vo", `${s.id}.${i}.wav`);
      fs.writeFileSync(txt, text, "utf8");
      execFileSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.join(here, "tts.ps1"), "-TextFile", txt, "-OutWav", wav, "-Rate", process.env.VOICE_RATE ?? "1"], { stdio: "inherit" });
      const pcm = pcmOf(wav);
      const dur = pcm.length / 88200;
      timings.push({ text, start: at, end: at + dur });
      parts.push(pcm, Buffer.alloc(Math.round(GAP * 44100) * 2));
      at += dur + GAP;
      fs.rmSync(txt);
      fs.rmSync(wav);
    });
    writeWav(path.join(WORK, "vo", `${s.id}.wav`), Buffer.concat(parts));
    fs.writeFileSync(path.join(WORK, "vo", `${s.id}.json`), JSON.stringify({ timings, voice: at - GAP }, null, 2));
    const d = at - GAP + LEAD + TAIL;
    total += d;
    console.log(`${s.id.padEnd(14)} ${sentences.length} sentences  voice ${(at - GAP).toFixed(1)} s  scene ${d.toFixed(1)} s`);
  }
  console.log(`TOTAL ${total.toFixed(1)} s (${Math.floor(total / 60)}:${String(Math.round(total % 60)).padStart(2, "0")})  limit 180 s`);
}

const cmd = process.argv[2];
if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, "/")}`) {
  if (cmd === "tts") tts();
  else if (cmd === "audio") await (await import("./audio.mjs")).run();
  else if (cmd === "record") await (await import("./record.mjs")).run(process.argv.slice(3));
  else if (cmd === "mix") await (await import("./mix.mjs")).runMix();
  else console.log("usage: node make.mjs tts | audio | record [scene ids] | mix");
}
