/**
 * Trust passport levels and achievements. Computed only from the real trust profile:
 * the game makes the history visible, it never invents or inflates it.
 */
import type { Key } from "@/lib/i18n";

export type Profile = {
  completed: number;
  abandoned: number;
  activeGroups: number;
  onTime: number;
  late: number;
  covered: number;
  defaulted: number;
  onTimePct: number | null;
  accountAgeDays: number;
  paypalVerified: boolean;
  isNewcomer: boolean;
  streak?: number;
};

export const LEVELS: { key: Key; motif: number }[] = [
  { key: "lvlHilo", motif: 5 },
  { key: "lvlTrenza", motif: 1 },
  { key: "lvlTejido", motif: 2 },
  { key: "lvlAguayo", motif: 0 },
  { key: "lvlMaestro", motif: 4 },
];

type Need = { key: Key; n?: number };
/** What the next level asks for that this profile doesn't have yet. */
const REQUIREMENTS: ((p: Profile) => Need[])[] = [
  () => [],
  (p) => (p.completed >= 1 ? [] : [{ key: "needCompleted", n: 1 - p.completed }]),
  (p) => [
    ...(p.completed >= 2 ? [] : [{ key: "needCompleted" as Key, n: 2 - p.completed }]),
    ...((p.onTimePct ?? 0) >= 90 ? [] : [{ key: "needOnTime" as Key, n: 90 }]),
  ],
  (p) => [
    ...(p.completed >= 4 ? [] : [{ key: "needCompleted" as Key, n: 4 - p.completed }]),
    ...((p.onTimePct ?? 0) >= 95 ? [] : [{ key: "needOnTime" as Key, n: 95 }]),
  ],
  (p) => [
    ...(p.completed >= 8 ? [] : [{ key: "needCompleted" as Key, n: 8 - p.completed }]),
    ...(p.covered === 0 && p.defaulted === 0 && p.abandoned === 0 ? [] : [{ key: "needNoGuarantee" as Key }]),
  ],
];

export function levelOf(p: Profile) {
  let level = 0;
  for (let i = 1; i < LEVELS.length; i++) {
    if (REQUIREMENTS[i](p).length === 0) level = i;
    else break;
  }
  const next = level + 1 < LEVELS.length ? level + 1 : null;
  return { level, next, missing: next == null ? [] : REQUIREMENTS[next](p) };
}

export const ACHIEVEMENTS: { key: Key; motif: number; got: (p: Profile) => boolean }[] = [
  { key: "achFirst", motif: 0, got: (p) => p.completed >= 1 },
  { key: "achThree", motif: 4, got: (p) => p.completed >= 3 },
  { key: "achTenOnTime", motif: 2, got: (p) => p.onTime >= 10 },
  { key: "achStreak5", motif: 1, got: (p) => (p.streak ?? 0) >= 5 },
  { key: "achNoGuarantee", motif: 3, got: (p) => p.completed >= 1 && p.covered === 0 },
  { key: "achVerified", motif: 5, got: (p) => p.paypalVerified },
];
