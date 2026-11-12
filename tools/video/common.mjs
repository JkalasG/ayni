import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { SCENES } from "./narration.mjs";

export const here = path.dirname(fileURLToPath(import.meta.url));
export const WORK = path.join(here, "work");
export const OUT = path.join(here, "out");
fs.mkdirSync(path.join(WORK, "vo"), { recursive: true });
fs.mkdirSync(path.join(WORK, "clips"), { recursive: true });
fs.mkdirSync(OUT, { recursive: true });

export const TAIL = 0.7; // seconds of picture after the last word of a scene
export const LEAD = 0.35; // seconds of picture before the first word

export function wavSeconds(file) {
  const b = fs.readFileSync(file);
  const byteRate = b.readUInt32LE(28);
  // find the "data" chunk
  let i = 12;
  while (i < b.length - 8) {
    const id = b.toString("ascii", i, i + 4);
    const size = b.readUInt32LE(i + 4);
    if (id === "data") return size / byteRate;
    i += 8 + size;
  }
  throw new Error("no data chunk in " + file);
}

export function durations() {
  return Object.fromEntries(SCENES.map((s) => [s.id, wavSeconds(path.join(WORK, "vo", `${s.id}.wav`)) + LEAD + TAIL]));
}

