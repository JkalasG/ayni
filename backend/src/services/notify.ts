import { db } from "../db";

/**
 * Every reminder, pot release and mediation goes through here:
 * an in-app notification, plus an Android push when the member registered a device.
 */
export async function notify(userId: string, groupId: string | null, kind: string, title: string, body: string) {
  await db.notification.create({ data: { userId, groupId, kind, title, body } });
  const user = await db.user.findUnique({ where: { id: userId }, select: { pushToken: true } });
  if (user?.pushToken) await sendPush(user.pushToken, title, body, { groupId, kind });
}

/** Something that happened in the group, shown in the chat as a card. `content` is the plain-text version. */
export type ChatEvent =
  | { type: "paid"; name: string; round: number }
  | { type: "pot"; name: string; round: number; amountCents: number; heldCents: number }
  | { type: "ready"; round: number }
  | { type: "joined"; name: string; newcomer: boolean }
  | { type: "dispute"; round: number }
  | { type: "finished" }
  | { type: "cancelled" };

export async function postToGroupChat(groupId: string, content: string, event?: ChatEvent) {
  await db.chatMessage.create({ data: { groupId, role: "system", content, ...(event ? { kind: "event", event } : {}) } });
}

/** Expo push service: no extra SDK needed. Failures never break the money flow. */
async function sendPush(token: string, title: string, body: string, data: Record<string, unknown>) {
  if (!token.startsWith("ExponentPushToken[") && !token.startsWith("ExpoPushToken[")) return;
  try {
    const res = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ to: token, title, body, data, sound: "default", channelId: "default" }),
    });
    const json = (await res.json().catch(() => null)) as any;
    // The device uninstalled the app or revoked permission: forget the token.
    if (json?.data?.details?.error === "DeviceNotRegistered") {
      await db.user.updateMany({ where: { pushToken: token }, data: { pushToken: null } });
    }
  } catch (e) {
    console.error("push failed", e);
  }
}
