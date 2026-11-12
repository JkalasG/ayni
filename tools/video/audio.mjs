import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
import { WORK, here, durations } from "./common.mjs";

export async function run() {
  const d = durations();
  const file = path.join(WORK, "durations.json");
  fs.writeFileSync(file, JSON.stringify(d, null, 2));
  execFileSync("python", [path.join(here, "audio.py"), file, WORK], { stdio: "inherit" });
}
