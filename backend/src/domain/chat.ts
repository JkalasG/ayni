/**
 * Pure rules of the group chat: what a message may contain, when it is for the
 * assistant, how fast one person may write and who may see or hide a message.
 */

export const MAX_MESSAGE_LENGTH = 1000;

/**
 * Normalize what a member typed. Returns null when nothing is left.
 * Control characters are removed (they can hide text or break a terminal / log),
 * long runs of blank lines are collapsed and the length is capped.
 */
export function cleanMessage(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const text = input
    .replace(/\r\n?/g, "\n")
    // C0/C1 control characters except newline and tab, plus zero-width and bidi-override characters
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F-\u009F​-‏‪-‮⁠-⁩﻿]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, MAX_MESSAGE_LENGTH)
    .trim();
  return text.length ? text : null;
}

const MENTION = /(^|[\s,.;:!?¡¿(])@ayni(?![\w-])/i;

/** "@ayni ¿cuánto debo?" asks the assistant, wherever the mention is. An email like x@ayni.com does not. */
export function mentionsAssistant(text: string): boolean {
  return MENTION.test(text);
}

/** The question without the mention, as the assistant should read it. */
export function stripMention(text: string): string {
  const out = text.replace(/(^|[\s,.;:!?¡¿(])@ayni(?![\w-])[,:]?/gi, "$1").replace(/[ \t]{2,}/g, " ").trim();
  return out || text.trim();
}

/** Sliding window: at most `max` messages per `windowMs` for each key. Kept in memory (one API process). */
export class RateLimiter {
  private hits = new Map<string, number[]>();
  constructor(private max: number, private windowMs: number) {}

  /** True when the action is allowed (and counted). */
  allow(key: string, now = Date.now()): boolean {
    const recent = (this.hits.get(key) ?? []).filter((t) => t > now - this.windowMs);
    if (recent.length >= this.max) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(now);
    this.hits.set(key, recent);
    // Do not grow forever with keys that stopped writing.
    if (this.hits.size > 5000) for (const [k, v] of this.hits) if (!v.some((t) => t > now - this.windowMs)) this.hits.delete(k);
    return true;
  }
}

export type ChatRow = { userId: string | null; role: string; visibleToUserId: string | null; hiddenAt: Date | null };

/** Private exchanges with the assistant are only for the member who asked. */
export function canSee(row: Pick<ChatRow, "visibleToUserId">, userId: string): boolean {
  return row.visibleToUserId == null || row.visibleToUserId === userId;
}

/**
 * Who may hide a message: its author, or the organizer (moderation).
 * Only what a member wrote to the group: system events and the assistant's answers are not removable.
 */
export function canHide(row: ChatRow, user: { id: string; isOrganizer: boolean }): boolean {
  if (row.role !== "user" || row.hiddenAt || row.visibleToUserId) return false;
  return row.userId === user.id || user.isOrganizer;
}
