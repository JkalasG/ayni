/**
 * The woven avatar as an SVG string, for places that are not React (the Bryntum charts draw plain HTML).
 * Same algorithm as WovenAvatar in components/woven-avatar.tsx: the same person gets the same cloth everywhere.
 */
import { PATTERNS, hash } from "@/components/woven-avatar";
import type { Palette } from "@/lib/theme";

export function wovenSvg(id: string, c: Palette, size = 34): string {
  const h = hash(id);
  const vivid = c.threads.slice(0, 5);
  const a = vivid[h % 5];
  const b = vivid[(h >>> 3) % 5 === h % 5 ? ((h % 5) + 2) % 5 : (h >>> 3) % 5];
  const third = c.scheme === "dark" ? c.surfaceAlt : c.surface;
  const colors = [a, b, third];
  const pattern = PATTERNS[(h >>> 7) % PATTERNS.length];
  const o = (h >>> 11) % 4;
  const paths = ["", "", ""];
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      if ((x === 0 || x === 7) && (y === 0 || y === 7)) continue; // stepped corner
      const [px, py] = o === 1 ? [y, x] : o === 2 ? [7 - x, y] : o === 3 ? [x, 7 - y] : [x, y];
      paths[pattern(px, py)] += `M${x} ${y}h1.02v1.02h-1.02z`;
    }
  }
  const body = paths.map((d, i) => (d ? `<path d="${d}" fill="${colors[i]}"/>` : "")).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 8 8" shape-rendering="crispEdges" aria-hidden="true" focusable="false">${body}</svg>`;
}
