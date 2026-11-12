import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
import ffmpeg from "ffmpeg-static";
import { SCENES } from "./narration.mjs";
import { WORK, OUT, here, durations } from "./common.mjs";

const run = (args) => execFileSync(ffmpeg, ["-y", "-hide_banner", "-loglevel", "error", ...args], { stdio: "inherit" });

export async function runMix() {
  const d = durations();
  fs.writeFileSync(path.join(WORK, "durations.json"), JSON.stringify(d, null, 2));
  const ids = SCENES.map((s) => s.id);

  // 1. each scene's picture, with a short dip to the page colour at both ends (and a stand-in if a scene is missing)
  const parts = [];
  for (const id of ids) {
    const clip = path.join(WORK, "clips", `${id}.mp4`);
    const out = path.join(WORK, "clips", `${id}.final.mp4`);
    const dur = d[id];
    if (!fs.existsSync(clip)) {
      console.log(`! ${id}: no clip yet, using a blank stand-in`);
      run(["-f", "lavfi", "-i", `color=c=0xFFF6EC:s=1920x1080:r=30:d=${dur}`, "-c:v", "libx264", "-pix_fmt", "yuv420p", out]);
    } else {
      run(["-i", clip, "-vf", `fade=t=in:st=0:d=0.22:color=0xFFF6EC,fade=t=out:st=${(dur - 0.22).toFixed(2)}:d=0.22:color=0xFFF6EC,fps=30,format=yuv420p`, "-t", String(dur), "-c:v", "libx264", "-preset", "veryfast", "-crf", "17", out]);
    }
    parts.push(out);
  }
  const list = path.join(WORK, "final.txt");
  fs.writeFileSync(list, parts.map((p) => `file '${p.replace(/\\/g, "/")}'`).join("\n"));
  const picture = path.join(WORK, "picture.mp4");
  run(["-f", "concat", "-safe", "0", "-i", list, "-c", "copy", picture]);

  // 2. the voice and the effects, placed on the timeline
  execFileSync("python", [path.join(here, "mix.py"), WORK, ...ids], { stdio: "inherit" });

  // 3. music ducks under the voice; everything is levelled to a normal loudness
  const out = path.join(OUT, "ayni-demo.mp4");
  run([
    "-i", picture, "-i", path.join(WORK, "music.wav"), "-i", path.join(WORK, "vo_track.wav"), "-i", path.join(WORK, "sfx_track.wav"),
    "-filter_complex",
    "[1:a]volume=0.62,aformat=channel_layouts=mono[m];[2:a]aformat=channel_layouts=mono,asplit=2[vo][vokey];" +
      "[m][vokey]sidechaincompress=threshold=0.035:ratio=9:attack=25:release=500:makeup=1[md];" +
      "[md][vo]amix=inputs=2:normalize=0[a1];[3:a]aformat=channel_layouts=mono[fx];[a1][fx]amix=inputs=2:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=9,aformat=channel_layouts=stereo[aout]",
    "-map", "0:v", "-map", "[aout]", "-c:v", "copy", "-c:a", "aac", "-ar", "48000", "-b:a", "192k", "-shortest", "-movflags", "+faststart", out,
  ]);
  for (const p of parts) fs.rmSync(p, { force: true });
  const total = Object.values(d).reduce((a, b) => a + b, 0);
  console.log(`\n${out}\n${Math.floor(total / 60)}:${String(Math.round(total % 60)).padStart(2, "0")} (limit 3:00)`);
}
