import { db } from "../db";

/**
 * In-app notifications. Push delivery (Expo push tokens) plugs in here later,
 * so every reminder, pot release and mediation goes through one place.
 */
export async function notify(userId: string, groupId: string | null, kind: string, title: string, body: string) {
  await db.notification.create({ data: { userId, groupId, kind, title, body } });
}

export async function postToGroupChat(groupId: string, content: string) {
  await db.chatMessage.create({ data: { groupId, role: "system", content } });
}
