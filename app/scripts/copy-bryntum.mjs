// Copies the Bryntum stylesheets and icon font next to the web app (public/bryntum), so the charts can load the
// light or the dark theme at run time. Runs before `expo start --web` and `expo export`. The copied files are not
// committed (see .gitignore): they belong to the Bryntum packages and are produced from node_modules on every build.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const from = (pkg, ...p) => path.join(app, "node_modules", "@bryntum", pkg, ...p);
const out = path.join(app, "public", "bryntum");

const files = [
  [from("scheduler-enterprise", "scheduler.css"), "scheduler.css"],
  [from("scheduler-enterprise", "stockholm-light.css"), "stockholm-light.css"],
  [from("scheduler-enterprise", "stockholm-dark.css"), "stockholm-dark.css"],
  // the personal calendar (Bryntum Calendar) has its own structural sheet and themes
  [from("calendar-enterprise", "calendar.css"), path.join("calendar", "calendar.css")],
  [from("calendar-enterprise", "stockholm-light.css"), path.join("calendar", "stockholm-light.css")],
  [from("calendar-enterprise", "stockholm-dark.css"), path.join("calendar", "stockholm-dark.css")],
  [from("core-enterprise", "fontawesome", "css", "fontawesome.css"), path.join("fontawesome", "css", "fontawesome.css")],
  [from("core-enterprise", "fontawesome", "css", "solid.css"), path.join("fontawesome", "css", "solid.css")],
  [from("core-enterprise", "fontawesome", "webfonts", "fa-solid-900.woff2"), path.join("fontawesome", "webfonts", "fa-solid-900.woff2")],
];

if (!files.every(([src]) => fs.existsSync(src))) {
  console.error("Bryntum is not installed (run `npm install` in app/). The charts will not be available on the web build.");
  process.exit(0); // never block the rest of the app
}
fs.rmSync(out, { recursive: true, force: true });
for (const [src, rel] of files) {
  fs.mkdirSync(path.dirname(path.join(out, rel)), { recursive: true });
  fs.copyFileSync(src, path.join(out, rel));
}
console.log(`Bryntum assets copied to public/bryntum (${files.length} files)`);
