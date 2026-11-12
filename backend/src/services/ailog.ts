import { db } from "../db";

export type AiLogKind = "chat" | "reminder" | "order" | "guarantee" | "admission" | "disputes" | "reschedule" | "briefing" | "draft";
export type AiSource = "claude" | "fallback" | "rules";

/**
 * Transparency log: what the AI consulted and why it decided.
 * Logging must never break the feature it describes, so errors are swallowed.
 */
export async function logAi(entry: {
  groupId: string | null;
  kind: AiLogKind;
  source: AiSource;
  subject: string;
  consulted: unknown;
  output: string;
  /** "organizer": only the organizer and `subjectUserId` see it (personal payment or admission details). */
  audience?: "group" | "organizer";
  subjectUserId?: string | null;
}) {
  try {
    await db.aiLog.create({
      data: {
        groupId: entry.groupId,
        kind: entry.kind,
        source: entry.source,
        subject: entry.subject.slice(0, 300),
        consulted: (entry.consulted ?? []) as any,
        output: entry.output.slice(0, 4000),
        audience: entry.audience ?? "group",
        subjectUserId: entry.subjectUserId ?? null,
      },
    });
  } catch (e) {
    console.error("ai log failed", e);
  }
}
