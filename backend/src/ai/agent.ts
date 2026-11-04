/**
 * Claude inside Ayni.
 *  - chat(): group assistant + mediator, with tools over the group's real data
 *  - writeReminder(): personalized, escalating reminders
 *  - proposeTurnOrder(): explains a fair order based on payment history
 *
 * Safety principle: the AI can read and PROPOSE, never move money.
 * Anything that changes money or turns becomes a PendingAction the organizer approves.
 */
import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config";
import { db } from "../db";
import { formatUSD, type ReminderStage } from "../domain/rules";
import type { User } from "@prisma/client";

const client = config.anthropic.apiKey ? new Anthropic({ apiKey: config.anthropic.apiKey }) : null;
const MODEL = config.anthropic.model;

function textOf(msg: Anthropic.Message): string {
  return msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

// ------------------------------------------------------------------ reminders

const STAGE_TONE: Record<ReminderStage, string> = {
  none: "",
  friendly: "warm and friendly heads-up, the due date is coming",
  due: "clear and kind: the due date has passed, mention the late fee",
  firm: "firm but respectful: the group is waiting, grace period ending soon",
  final: "serious and empathetic: grace period is over; explain their guarantee may cover it and invite them to talk",
};

export async function writeReminder(p: {
  name: string;
  locale: string;
  stage: ReminderStage;
  groupName: string;
  amount: string;
  lateFee: string | null;
  recipientName: string;
  dueAt: Date;
}): Promise<string> {
  const fallback =
    p.locale === "en"
      ? `Hi ${p.name}! Your $${p.amount} contribution to ${p.groupName} is due. ${p.recipientName} receives the pot this round.`
      : `¡Hola ${p.name}! Tu aporte de $${p.amount} para ${p.groupName} está pendiente. Esta ronda recibe el pozo ${p.recipientName}.`;
  if (!client) return fallback;
  try {
    const msg = await client.messages.create({
      model: MODEL,
      max_tokens: 200,
      system:
        "You write short push-notification reminders for Ayni, an app for rotating savings groups (pasanaku). " +
        "Max 2 sentences, no markdown, at most one emoji. Never shame or threaten. " +
        "Remind people that the group trusts each other (ayni = reciprocity).",
      messages: [
        {
          role: "user",
          content:
            `Language: ${p.locale === "en" ? "English" : "Spanish (Latin American)"}\n` +
            `Tone: ${STAGE_TONE[p.stage]}\n` +
            `Member: ${p.name}\nGroup: ${p.groupName}\nAmount due: $${p.amount}` +
            (p.lateFee ? ` (includes $${p.lateFee} late fee)` : "") +
            `\nThis round's pot goes to: ${p.recipientName}\nDue: ${p.dueAt.toISOString()}`,
        },
      ],
    });
    return textOf(msg) || fallback;
  } catch (e) {
    console.error("writeReminder failed", e);
    return fallback;
  }
}

// ------------------------------------------------------------------ turn order

export async function proposeTurnOrder(
  members: { membershipId: string; name: string; riskScore: number; history: { onTime: number; late: number; covered: number } }[],
  locale: string
): Promise<{ order: string[]; reasons: Record<string, string>; summary: string }> {
  // Deterministic fallback: most reliable first.
  const fallbackOrder = [...members].sort((a, b) => a.riskScore - b.riskScore).map((m) => m.membershipId);
  const fallback = {
    order: fallbackOrder,
    reasons: {} as Record<string, string>,
    summary:
      locale === "en"
        ? "Proposed order: members with the strongest payment history go first."
        : "Orden propuesto: primero quienes tienen mejor historial de pagos.",
  };
  if (!client) return fallback;

  const tool: Anthropic.Tool = {
    name: "submit_order",
    description: "Submit the proposed turn order with a one-sentence reason per member.",
    input_schema: {
      type: "object",
      properties: {
        order: { type: "array", items: { type: "string" }, description: "membershipIds, first turn first" },
        reasons: { type: "object", additionalProperties: { type: "string" }, description: "membershipId -> reason" },
        summary: { type: "string", description: "2-3 sentence explanation for the whole group" },
      },
      required: ["order", "reasons", "summary"],
    },
  };
  try {
    const msg = await client.messages.create({
      model: MODEL,
      max_tokens: 1200,
      tools: [tool],
      tool_choice: { type: "tool", name: "submit_order" },
      system:
        "You propose a fair turn order for a rotating savings group (pasanaku). Early turns receive the pot before " +
        "paying most contributions, so they carry the most risk for the group. Prefer reliable members early, but be " +
        "kind: new members with no history are neutral, not risky. Early turns also have a larger guarantee withheld, " +
        "so mention that it protects everyone. Write reasons and summary in " +
        (locale === "en" ? "English." : "Spanish (Latin American)."),
      messages: [{ role: "user", content: JSON.stringify(members) }],
    });
    const use = msg.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    const input = use?.input as { order: string[]; reasons: Record<string, string>; summary: string } | undefined;
    const valid =
      input &&
      input.order.length === members.length &&
      new Set(input.order).size === members.length &&
      input.order.every((id) => members.some((m) => m.membershipId === id));
    return valid ? input! : fallback;
  } catch (e) {
    console.error("proposeTurnOrder failed", e);
    return fallback;
  }
}

// ------------------------------------------------------------------ group chat

const CHAT_TOOLS: Anthropic.Tool[] = [
  {
    name: "get_group_status",
    description: "Members, turn order, current round, who has paid, pot size, retention held. Use before answering questions about the group.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_my_situation",
    description: "The asking member's own turn, pending contributions, late fees and guarantee held.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "offer_payment",
    description: "Show the member a 'Pay with PayPal' button for their pending contribution in the current round. The member completes payment themselves.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "request_turn_swap",
    description: "Ask the organizer to approve swapping the asking member's turn with another member who AGREED in the chat. Creates a request; does not change anything by itself.",
    input_schema: {
      type: "object",
      properties: {
        other_member_name: { type: "string" },
        reason: { type: "string" },
      },
      required: ["other_member_name", "reason"],
    },
  },
  {
    name: "escalate_to_organizer",
    description: "Send the organizer a neutral summary of a conflict or special request (e.g. someone can't pay this round) with a suggested fair solution.",
    input_schema: {
      type: "object",
      properties: { summary: { type: "string" }, suggested_solution: { type: "string" } },
      required: ["summary", "suggested_solution"],
    },
  },
];

type ChatAction = { type: "pay"; contributionId: string; amount: string };

async function runTool(name: string, input: any, ctx: { user: User; groupId: string }, actions: ChatAction[]) {
  const group = await db.group.findUniqueOrThrow({
    where: { id: ctx.groupId },
    include: {
      memberships: { include: { user: true }, orderBy: { turn: "asc" } },
      rounds: { orderBy: { number: "asc" }, include: { contributions: true } },
    },
  });
  const me = group.memberships.find((m) => m.userId === ctx.user.id)!;
  const current = group.rounds.find((r) => r.status === "COLLECTING" || r.status === "READY");

  switch (name) {
    case "get_group_status":
      return {
        name: group.name,
        status: group.status,
        contribution: formatUSD(group.contributionCents),
        frequency: group.frequency,
        lateFeePct: group.lateFeePct,
        pot: formatUSD(group.contributionCents * group.memberships.length),
        members: group.memberships.map((m) => ({
          name: m.user.name,
          turn: m.turn,
          guaranteeHeld: formatUSD(m.retentionHeldCents),
          isOrganizer: m.userId === group.organizerId,
        })),
        currentRound: current && {
          number: current.number,
          dueAt: current.dueAt,
          recipient: group.memberships.find((m) => m.id === current.recipientId)?.user.name,
          paid: current.contributions.filter((c) => c.status !== "PENDING").map((c) => group.memberships.find((m) => m.id === c.membershipId)?.user.name),
          pending: current.contributions.filter((c) => c.status === "PENDING").map((c) => group.memberships.find((m) => m.id === c.membershipId)?.user.name),
        },
        roundsPaidOut: group.rounds.filter((r) => r.status === "PAID_OUT").length,
        totalRounds: group.rounds.length,
      };
    case "get_my_situation": {
      const mine = group.rounds.flatMap((r) => r.contributions.filter((c) => c.membershipId === me.id).map((c) => ({ r, c })));
      return {
        myTurn: me.turn,
        guaranteePct: me.retentionPct,
        guaranteeHeld: formatUSD(me.retentionHeldCents),
        pending: mine.filter(({ c }) => c.status === "PENDING").map(({ r, c }) => ({ round: r.number, dueAt: r.dueAt, amount: formatUSD(c.amountCents + c.lateFeeCents), roundOpen: r.status === "COLLECTING" })),
        paidCount: mine.filter(({ c }) => c.status !== "PENDING").length,
      };
    }
    case "offer_payment": {
      const c = current?.status === "COLLECTING" ? current.contributions.find((x) => x.membershipId === me.id && x.status === "PENDING") : undefined;
      if (!c) return { ok: false, reason: "No pending contribution in the open round." };
      actions.push({ type: "pay", contributionId: c.id, amount: formatUSD(c.amountCents + c.lateFeeCents) });
      return { ok: true, note: "A payment button is now shown under your reply." };
    }
    case "request_turn_swap": {
      const other = group.memberships.find((m) => m.user.name.toLowerCase().includes(String(input.other_member_name).toLowerCase()));
      if (!other || other.id === me.id) return { ok: false, reason: "Member not found." };
      await db.pendingAction.create({
        data: {
          groupId: group.id,
          type: "SWAP_TURNS",
          payload: { a: me.id, b: other.id, reason: input.reason },
          summary: `Cambiar turnos: ${me.user.name} (#${me.turn}) ↔ ${other.user.name} (#${other.turn}). Motivo: ${input.reason}`,
          createdBy: "ai",
          expiresAt: new Date(Date.now() + (group.demoMode ? 60_000 : group.approvalTimeoutHours * 3600_000)),
        },
      });
      return { ok: true, note: "Request sent to the organizer for approval." };
    }
    case "escalate_to_organizer":
      await db.notification.create({
        data: {
          userId: group.organizerId,
          groupId: group.id,
          kind: "mediation",
          title: `Mediación · ${group.name}`,
          body: `${input.summary}\nSugerencia: ${input.suggested_solution}`,
        },
      });
      return { ok: true };
    default:
      return { error: "unknown tool" };
  }
}

export async function chat(user: User, groupId: string, text: string): Promise<{ reply: string; actions: ChatAction[] }> {
  await db.chatMessage.create({ data: { groupId, userId: user.id, role: "user", content: text } });
  const actions: ChatAction[] = [];

  if (!client) {
    const reply = "El asistente no está configurado (falta ANTHROPIC_API_KEY).";
    await db.chatMessage.create({ data: { groupId, role: "assistant", content: reply } });
    return { reply, actions };
  }

  // Recent group conversation as context (members see a shared group chat).
  const recent = await db.chatMessage.findMany({ where: { groupId }, orderBy: { createdAt: "desc" }, take: 20 });
  const users = await db.user.findMany({ where: { id: { in: recent.map((m) => m.userId).filter(Boolean) as string[] } } });
  const transcript = recent
    .reverse()
    .slice(0, -1)
    .map((m) => `${m.role === "user" ? users.find((u) => u.id === m.userId)?.name ?? "member" : m.role}: ${m.content}`)
    .join("\n");

  const system =
    "You are Ayni's assistant inside a rotating savings group (pasanaku / tanda / ROSCA). " +
    "You help members understand where they stand, nudge payments kindly, and mediate conflicts fairly and neutrally. " +
    "Always use tools to get real numbers; never invent amounts or dates. " +
    "You cannot move money yourself: payments are made by the member (offer_payment), and turn swaps or special " +
    "arrangements are proposed to the organizer for approval. Before request_turn_swap, make sure the other member " +
    "agreed in the chat. When mediating, acknowledge both sides, propose a concrete fair option, and escalate if needed. " +
    `Reply in the member's language (their app language is ${user.locale === "en" ? "English" : "Spanish"}). ` +
    "Be brief and warm, plain text, no markdown tables.\n\n" +
    `The member talking to you: ${user.name}.\nRecent group chat:\n${transcript || "(empty)"}`;

  const messages: Anthropic.MessageParam[] = [{ role: "user", content: text }];
  let reply = "";
  for (let step = 0; step < 6; step++) {
    const msg = await client.messages.create({ model: MODEL, max_tokens: 1024, system, tools: CHAT_TOOLS, messages });
    if (msg.stop_reason !== "tool_use") {
      reply = textOf(msg);
      break;
    }
    messages.push({ role: "assistant", content: msg.content });
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const block of msg.content) {
      if (block.type !== "tool_use") continue;
      let out: unknown;
      try {
        out = await runTool(block.name, block.input, { user, groupId }, actions);
      } catch (e) {
        out = { error: String(e) };
      }
      results.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(out) });
    }
    messages.push({ role: "user", content: results });
  }
  reply ||= user.locale === "en" ? "Sorry, I couldn't finish that. Try again?" : "Perdón, no pude terminar. ¿Lo intentamos de nuevo?";
  await db.chatMessage.create({ data: { groupId, role: "assistant", content: reply } });
  return { reply, actions };
}
