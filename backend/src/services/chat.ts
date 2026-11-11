/**
 * Group chat. Three kinds of messages share one timeline:
 *  - what members write to each other (everyone in the group sees it)
 *  - events (a contribution paid, the pot sent…), written by the system when PayPal confirms them
 *  - a member's questions to the assistant and its answers: PRIVATE to that member,
 *    because they talk about that person's money
 */
import { db } from "../db";
import type { ChatMessage, User } from "@prisma/client";
import { canHide, cleanMessage, mentionsAssistant, RateLimiter, stripMention } from "../domain/chat";
import { chat as askAssistant } from "../ai/agent";
import { HttpError } from "./errors";

const PAGE = 200;
/** One person: 20 messages per minute to the group, 8 questions per minute to the assistant (each may call Claude). */
const groupLimit = new RateLimiter(20, 60_000);
const assistantLimit = new RateLimiter(8, 60_000);

async function membership(userId: string, groupId: string) {
  const m = await db.membership.findUnique({ where: { userId_groupId: { userId, groupId } }, include: { group: { select: { organizerId: true } } } });
  if (!m) throw new HttpError(403, "not_a_member");
  return m;
}

const visibleTo = (userId: string) => ({ OR: [{ visibleToUserId: null }, { visibleToUserId: userId }] });

function present(m: ChatMessage, authorName: string | null, viewer: { id: string; isOrganizer: boolean }) {
  const hidden = m.hiddenAt != null;
  return {
    id: m.id,
    role: m.role,
    kind: m.kind,
    event: hidden ? null : m.event,
    userId: m.userId,
    authorName,
    // A hidden message keeps its place in the conversation, without its text.
    content: hidden ? "" : m.content,
    hidden,
    private: m.visibleToUserId != null,
    canHide: canHide(m, viewer),
    createdAt: m.createdAt,
  };
}

/** The latest messages, or only those after `after` (for polling). Oldest first. */
export async function listMessages(user: User, groupId: string, after?: Date) {
  const me = await membership(user.id, groupId);
  const where = { groupId, ...visibleTo(user.id), ...(after ? { createdAt: { gt: after } } : {}) };
  const rows = after
    ? await db.chatMessage.findMany({ where, orderBy: { createdAt: "asc" }, take: PAGE })
    : (await db.chatMessage.findMany({ where, orderBy: { createdAt: "desc" }, take: PAGE })).reverse();
  const authors = await db.user.findMany({
    where: { id: { in: [...new Set(rows.map((m) => m.userId).filter((x): x is string => !!x))] } },
    select: { id: true, name: true },
  });
  const viewer = { id: user.id, isOrganizer: me.group.organizerId === user.id };
  return rows.map((m) => present(m, authors.find((u) => u.id === m.userId)?.name ?? null, viewer));
}

/**
 * A member writes. To the group by default; to the assistant when `toAssistant`
 * is set or the text mentions @ayni (then the exchange is private to them).
 */
export async function sendMessage(user: User, groupId: string, rawText: unknown, toAssistant = false) {
  await membership(user.id, groupId);
  const text = cleanMessage(rawText);
  if (!text) throw new HttpError(400, "empty_message");

  if (toAssistant || mentionsAssistant(text)) {
    if (!assistantLimit.allow(user.id)) throw new HttpError(429, "too_many_messages");
    const { reply, actions } = await askAssistant(user, groupId, stripMention(text));
    return { reply, actions };
  }

  if (!groupLimit.allow(user.id)) throw new HttpError(429, "too_many_messages");
  await db.chatMessage.create({ data: { groupId, userId: user.id, role: "user", content: text } });
  await markRead(user, groupId);
  return { reply: null, actions: [] };
}

/** The author takes back their message, or the organizer moderates it. The row stays, without its text. */
export async function hideMessage(user: User, groupId: string, messageId: string) {
  const me = await membership(user.id, groupId);
  const m = await db.chatMessage.findUnique({ where: { id: messageId } });
  if (!m || m.groupId !== groupId) throw new HttpError(404, "not_found");
  if (!canHide(m, { id: user.id, isOrganizer: me.group.organizerId === user.id })) throw new HttpError(403, "cannot_hide");
  await db.chatMessage.updateMany({ where: { id: m.id, hiddenAt: null }, data: { hiddenAt: new Date(), hiddenById: user.id } });
}

export async function markRead(user: User, groupId: string) {
  await db.membership.updateMany({ where: { userId: user.id, groupId }, data: { chatReadAt: new Date() } });
}

/** Messages from other people (and events) this member has not opened yet. */
export async function unreadCount(m: { userId: string; groupId: string; chatReadAt: Date | null; joinedAt: Date }) {
  return db.chatMessage.count({
    where: {
      groupId: m.groupId,
      createdAt: { gt: m.chatReadAt ?? m.joinedAt },
      hiddenAt: null,
      visibleToUserId: null,
      NOT: { userId: m.userId },
    },
  });
}
