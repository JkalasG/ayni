/**
 * The assistant as the group's manager, not as a chat: every time someone opens a pasanaku it reads the real state
 * (rounds, PayPal charges and payouts, guarantees, pending decisions, each late member's history), judges how the
 * round is going and recommends the next steps, each one a button that runs a real operation (a PayPal checkout, a
 * PayPal invoice, a pot payout, a reminder it writes itself).
 *
 * Same safety rule as the rest of the AI: the code decides WHAT is possible (the candidates below, with their amounts),
 * Claude decides which of them matter now, in which order, and explains why. It can never invent an action, and any
 * number it writes must exist in the facts it was given, or the answer is discarded for the rule-based one.
 * Nothing here moves money by itself: each step runs only when a person taps it.
 */
import Anthropic from "@anthropic-ai/sdk";
import type { User } from "@prisma/client";
import { config } from "../config";
import { db } from "../db";
import { formatUSD, lateFeeCents, reminderStage } from "../domain/rules";
import { HttpError } from "../services/errors";
import { logAi } from "../services/ailog";
import { notify } from "../services/notify";
import { sendOverdueInvoice } from "../services/payments";
import { trustProfile } from "../services/trust";
import { windows } from "../services/windows";
import { writeReminder } from "./agent";

import { client, MODEL } from "./llm";

export type BriefAction =
  | { type: "pay"; contributionId: string }
  | { type: "autopay" }
  | { type: "approve"; actionId: string }
  | { type: "review" }
  | { type: "nudge"; contributionId: string }
  | { type: "invoice"; contributionId: string }
  | { type: "retry_payout"; payoutId: string }
  | { type: "open"; tab: "claims" | "timeline" | "chat" | "admission" };
export type Health = "ok" | "watch" | "risk";
type Candidate = { key: string; action: BriefAction; title: string; why: string; priority: number; facts: Record<string, unknown> };
export type Briefing = {
  /** claude: the model chose and explained · rules: nothing to decide, so no model was asked · fallback: no model configured */
  source: "claude" | "fallback" | "rules";
  health: Health;
  headline: string;
  items: { key: string; title: string; why: string; action: BriefAction }[];
  consulted: string[];
  generatedAt: string;
};

const HOUR = 3600_000;
/** The organizer can ask the assistant to remind someone again only after this long. */
const NUDGE_EVERY = 6 * HOUR;

async function gather(user: User, groupId: string, now: Date) {
  const group = await db.group.findUnique({
    where: { id: groupId },
    include: {
      memberships: { include: { user: true }, orderBy: { turn: "asc" } },
      rounds: { orderBy: { number: "asc" }, include: { contributions: true } },
      actions: { where: { status: "PENDING" }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!group) throw new HttpError(404, "not_found");
  const me = group.memberships.find((m) => m.userId === user.id);
  if (!me) throw new HttpError(403, "not_a_member");
  const organizer = group.organizerId === user.id;
  const en = user.locale === "en";
  const L = (es: string, english: string) => (en ? english : es);
  const member = (id: string) => group.memberships.find((m) => m.id === id);
  const nameOf = (id: string) => member(id)?.user.name ?? "";
  const w = windows(group);

  const current = group.rounds.find((r) => r.status === "COLLECTING" || r.status === "READY");
  const overdue = !!current && current.status === "COLLECTING" && now.getTime() > current.dueAt.getTime();
  const pending = current?.status === "COLLECTING" ? current.contributions.filter((c) => c.status === "PENDING") : [];
  const myPending = pending.find((c) => c.membershipId === me.id);
  const hoursLate = current ? Math.max(0, Math.floor((now.getTime() - current.dueAt.getTime()) / HOUR)) : 0;
  const owed = (c: { amountCents: number; lateFeeCents: number }) => formatUSD(c.amountCents + c.lateFeeCents);

  const candidates: Candidate[] = [];
  const late: Record<string, unknown>[] = [];
  const consulted: string[] = [L("Rondas y aportes del grupo", "Rounds and contributions of the group")];

  // -------- what the person asking can do about their own money
  if (myPending) {
    candidates.push({
      key: "pay",
      action: { type: "pay", contributionId: myPending.id },
      title: L(`Pagar tu aporte de $${owed(myPending)} con PayPal`, `Pay your $${owed(myPending)} contribution with PayPal`),
      why: overdue ? L("Tu aporte ya venció y el grupo lo espera.", "Your contribution is past due and the group is waiting.") : L("Es lo único que te falta en esta ronda.", "It is the only thing you have left this round."),
      priority: overdue ? 100 : 80,
      facts: { what: "the asking member's own pending contribution", amount: owed(myPending), overdue, lateFee: myPending.lateFeeCents ? formatUSD(myPending.lateFeeCents) : null },
    });
  }
  if (group.status === "ACTIVE" && user.paypalVaultId && !me.autoPay && group.rounds.some((r) => r.status === "UPCOMING")) {
    candidates.push({
      key: "autopay",
      action: { type: "autopay" },
      title: L("Activar tu pago automático con PayPal", "Turn on your automatic PayPal payment"),
      why: L("Ya guardaste tu método en PayPal: así no se te pasa ninguna ronda.", "Your PayPal method is saved: you will never miss a round."),
      priority: 20,
      facts: { what: "automatic payment is off although a PayPal method is saved" },
    });
  }

  // -------- what only the organizer can do
  if (organizer) {
    consulted.push(L("Decisiones pendientes", "Pending decisions"));
    for (const a of group.actions) {
      const direct = a.type === "RELEASE_POT" || a.type === "APPROVE_ORDER" || a.type === "SWAP_TURNS";
      const p = a.payload as any;
      const round = a.type === "RELEASE_POT" ? group.rounds.find((r) => r.id === p.roundId) : undefined;
      candidates.push({
        key: `action:${a.id}`,
        action: direct ? { type: "approve", actionId: a.id } : { type: "review" },
        title:
          a.type === "RELEASE_POT" && round
            ? L(`Enviar el pozo de la ronda ${round.number} a ${nameOf(round.recipientId)} por PayPal`, `Send the round ${round.number} pot to ${nameOf(round.recipientId)} with PayPal`)
            : a.type === "ADMIT_MEMBER"
              ? L("Revisar una solicitud para entrar al grupo", "Review a request to join the group")
              : a.type === "WAIVE_CONTRIBUTION"
                ? L("Decidir si la ronda se cierra sin un aporte", "Decide whether the round closes without a contribution")
                : a.type === "APPROVE_ORDER"
                  ? L("Confirmar el orden de turnos propuesto", "Confirm the proposed turn order")
                  : L("Aprobar el cambio de turnos propuesto", "Approve the proposed turn swap"),
        why: L("Espera tu respuesta.", "It is waiting for your answer."),
        priority: a.type === "RELEASE_POT" ? 95 : a.type === "WAIVE_CONTRIBUTION" ? 85 : 70,
        facts: { what: `pending decision of type ${a.type}`, summary: a.summary, appliesItselfAt: (p?.noAuto ? null : a.expiresAt) as Date | null },
      });
    }

    if (pending.length) consulted.push(L("Historial de pagos de quienes faltan", "Payment history of whoever is missing"));
    for (const c of pending) {
      const m = member(c.membershipId);
      if (!m || m.id === me.id) continue;
      const profile = await trustProfile(m.userId).catch(() => null);
      const facts = {
        member: m.user.name,
        amount: owed(c),
        guaranteeHeld: formatUSD(m.retentionHeldCents),
        guaranteeCoversIt: m.retentionHeldCents >= c.amountCents + c.lateFeeCents,
        automaticPayment: m.autoPay,
        paypalInvoiceSent: !!c.paypalInvoiceId,
        history: profile && { onTimePercent: profile.onTimePct, lateTimes: profile.late, circlesCompleted: profile.completed, circlesAbandoned: profile.abandoned },
        theirOwnTurnIsStillAhead: group.rounds.some((r) => r.recipientId === m.id && r.status === "UPCOMING"),
      };
      late.push(facts);
      const reminded = c.lastReminderAt && now.getTime() - c.lastReminderAt.getTime() < NUDGE_EVERY;
      if (!reminded && now.getTime() > current!.dueAt.getTime() - w.lead) {
        candidates.push({
          key: `nudge:${c.id}`,
          action: { type: "nudge", contributionId: c.id },
          title: L(`Que el asistente le recuerde a ${m.user.name} su aporte de $${owed(c)}`, `Have the assistant remind ${m.user.name} of their $${owed(c)} contribution`),
          why: overdue ? L("Está vencido y no recibió un aviso reciente.", "It is past due and they got no recent reminder.") : L("Vence pronto y aún no pagó.", "It is due soon and still unpaid."),
          priority: overdue ? 75 : 40,
          facts: { about: m.user.name },
        });
      }
      if (overdue && !c.paypalInvoiceId) {
        candidates.push({
          key: `invoice:${c.id}`,
          action: { type: "invoice", contributionId: c.id },
          title: L(`Enviar a ${m.user.name} una factura de PayPal por $${owed(c)}`, `Send ${m.user.name} a PayPal invoice for $${owed(c)}`),
          why: L("Puede pagarla desde su correo sin abrir la app.", "They can pay it from their email without opening the app."),
          priority: 60,
          facts: { about: m.user.name },
        });
      }
    }

    const failed = await db.payout.findMany({ where: { membership: { groupId }, status: "FAILED", retriedById: null }, include: { membership: { include: { user: true } } } });
    if (failed.length) consulted.push(L("Envíos de PayPal", "PayPal payouts"));
    for (const p of failed) {
      candidates.push({
        key: `payout:${p.id}`,
        action: { type: "retry_payout", payoutId: p.id },
        title: L(`Reintentar el envío de $${formatUSD(p.amountCents)} a ${p.membership.user.name}`, `Retry the $${formatUSD(p.amountCents)} payout to ${p.membership.user.name}`),
        why: L("PayPal no pudo enviarlo.", "PayPal could not send it."),
        priority: 98,
        facts: { what: "a PayPal payout failed", to: p.membership.user.name, amount: formatUSD(p.amountCents), kind: p.kind },
      });
    }

    const claims = await db.claim.count({ where: { groupId, status: "OPEN" } });
    if (claims) {
      consulted.push(L("Reclamos abiertos", "Open claims"));
      candidates.push({
        key: "claims",
        action: { type: "open", tab: "claims" },
        title: L(`Responder ${claims} reclamo(s) abierto(s)`, `Answer ${claims} open claim(s)`),
        why: L("Un miembro reportó un problema con un cobro.", "A member reported a problem with a charge."),
        priority: 65,
        facts: { what: "open claims about PayPal charges", count: claims },
      });
    }
    if (group.status === "FORMING" && !group.isOpen && group.memberships.length < 3) {
      candidates.push({
        key: "publish",
        action: { type: "open", tab: "admission" },
        title: L("Publicar el pasanaku para sumar miembros", "Publish the pasanaku to gather members"),
        why: L("Aún son pocos para empezar.", "There are still too few members to start."),
        priority: 30,
        facts: { what: "the group is still gathering members and is not open to requests", members: group.memberships.length },
      });
    }
  }

  const myRound = group.rounds.find((r) => r.recipientId === me.id);
  const facts = {
    group: group.name,
    status: group.status,
    askedBy: organizer ? "the organizer" : "a member",
    askingMember: user.name,
    contribution: formatUSD(group.contributionCents),
    pot: formatUSD(group.contributionCents * group.memberships.length),
    members: group.memberships.length,
    rounds: { total: group.rounds.length, paidOut: group.rounds.filter((r) => r.status === "PAID_OUT").length },
    currentRound: current && {
      number: current.number,
      status: current.status,
      receives: nameOf(current.recipientId),
      askingMemberReceives: current.recipientId === me.id,
      contributionsIn: current.contributions.length - pending.length,
      contributionsTotal: current.contributions.length,
      // who is missing is public inside the group; why (late, covered, unpaid) is not
      missing: pending.map((c) => nameOf(c.membershipId)),
      missingCount: pending.length,
      pastDue: overdue,
      daysLate: overdue ? Math.floor(hoursLate / 24) : 0,
    },
    ...(late.length ? { missingMembers: late } : {}),
    askingMemberTurn: me.turn,
    askingMemberRoundStatus: myRound?.status ?? null,
    askingMemberGuaranteeHeld: formatUSD(me.retentionHeldCents),
  };

  // Rule-based reading of the round, used as is without Claude and as the floor Claude cannot go below.
  const grave = candidates.some((x) => x.key.startsWith("payout:")) || (overdue && hoursLate * HOUR > w.grace / 2 && pending.length > 0);
  const floor: Health = grave ? "risk" : (overdue && pending.length > 0) || (organizer && group.actions.length > 0) ? "watch" : "ok";
  const headline = !current
    ? group.status === "FINISHED"
      ? L("El pasanaku terminó: todas las rondas se pagaron.", "The pasanaku is finished: every round was paid out.")
      : group.status === "CANCELLED"
        ? L("Este pasanaku se canceló.", "This pasanaku was cancelled.")
        : L(`El grupo aún se está armando: son ${group.memberships.length} miembros.`, `The group is still forming: ${group.memberships.length} members so far.`)
    : current.status === "READY"
      ? L(`La ronda ${current.number} está completa: falta enviar el pozo a ${nameOf(current.recipientId)}.`, `Round ${current.number} is complete: the pot still has to be sent to ${nameOf(current.recipientId)}.`)
      : pending.length === 0
        ? L(`La ronda ${current.number} va al día.`, `Round ${current.number} is on track.`)
        : L(
            `Ronda ${current.number}: entraron ${facts.currentRound!.contributionsIn} de ${current.contributions.length} aportes${overdue ? " y ya venció" : ""}.`,
            `Round ${current.number}: ${facts.currentRound!.contributionsIn} of ${current.contributions.length} contributions are in${overdue ? " and it is past due" : ""}.`
          );

  candidates.sort((a, b) => b.priority - a.priority);
  return { group, organizer, facts, candidates, consulted, floor, headline, en };
}

/** Every number in the text must be one the model was given: it can explain, never invent. */
function numbersAreKnown(text: string, source: string): boolean {
  const known = new Set(source.match(/\d+(?:\.\d+)?/g) ?? []);
  return (text.match(/\d+(?:[.,]\d+)?/g) ?? []).every((n) => known.has(n.replace(",", ".")) || known.has(n));
}

const RANK: Record<Health, number> = { ok: 0, watch: 1, risk: 2 };
const cache = new Map<string, { hash: string; value: Promise<Briefing> }>();

export async function groupBriefing(user: User, groupId: string): Promise<Briefing> {
  const g = await gather(user, groupId, new Date());
  // The same state gives the same briefing: Claude is asked again only when something changed.
  const hash = JSON.stringify([g.facts, g.candidates.map((x) => [x.key, x.facts])]);
  const key = `${groupId}:${user.id}:${user.locale}`;
  const hit = cache.get(key);
  if (hit && hit.hash === hash) return hit.value;
  const value = compose(user, groupId, g).catch((e) => {
    cache.delete(key);
    throw e;
  });
  cache.set(key, { hash, value });
  return value;
}

async function compose(user: User, groupId: string, g: Awaited<ReturnType<typeof gather>>): Promise<Briefing> {
  const top = g.candidates.slice(0, 3);
  // Nothing to choose between (no step, or a single obvious one): the rules already say it all, so no model is asked.
  const obvious = g.candidates.length <= 1;
  let out: Briefing = {
    source: client && obvious ? "rules" : "fallback",
    health: g.floor,
    headline: g.headline,
    items: top.map((x) => ({ key: x.key, title: x.title, why: x.why, action: x.action })),
    consulted: g.consulted,
    generatedAt: new Date().toISOString(),
  };

  if (client && !obvious) {
    // at most six steps to choose from, already sorted by urgency
    const input = { facts: g.facts, possibleSteps: g.candidates.slice(0, 6).map((x) => ({ key: x.key, does: x.title, ...x.facts })) };
    const source = JSON.stringify(input);
    const tool: Anthropic.Tool = {
      name: "submit_briefing",
      description: "Submit the reading of the group and the steps you recommend now.",
      input_schema: {
        type: "object",
        properties: {
          health: { type: "string", enum: ["ok", "watch", "risk"], description: "ok: on track · watch: needs attention soon · risk: the round or someone's money is in danger" },
          headline: { type: "string", description: "One short sentence (two at most): where the group stands and what matters most now." },
          steps: {
            type: "array",
            maxItems: 3,
            description: "The steps worth taking now, most important first. Only keys from possibleSteps. Empty if nothing needs doing.",
            items: {
              type: "object",
              properties: { key: { type: "string" }, why: { type: "string", description: "One short sentence: why this step now, from the facts." } },
              required: ["key", "why"],
            },
          },
        },
        required: ["health", "headline", "steps"],
      },
    };
    try {
      const msg = await client.messages.create({
        model: MODEL,
        max_tokens: 400,
        tools: [tool],
        tool_choice: { type: "tool", name: "submit_briefing" },
        system:
          "You manage a rotating savings group (pasanaku / tanda / ROSCA) on Ayni, where every contribution and payout moves through PayPal. " +
          "You are given the group's real state and the only steps that are possible right now. Judge how the round is going and choose the " +
          "steps that matter, in order, explaining each with the facts you see: a member's payment history, whether their guarantee covers " +
          "the debt, how late it is, whether a PayPal invoice already went out. Prefer the gentlest step that works: a reminder before an " +
          "invoice for someone with a good history; the invoice when reminders did not work or the history is weak. Do not recommend every " +
          "step, only what is worth doing now. Never shame anyone and never mention age, gender, origin or anything personal. " +
          "Use only numbers that appear in the data; do not compute new ones. Plain text, no markdown, no emojis. " +
          (g.organizer ? "" : "The person is a member, not the organizer: say nothing about other members beyond who has paid and who is missing. ") +
          `Write in ${g.en ? "English" : "Spanish (Latin American)"}, addressing the person directly.`,
        messages: [{ role: "user", content: source }],
      });
      const use = msg.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
      const r = use?.input as { health?: Health; headline?: string; steps?: { key: string; why: string }[] } | undefined;
      const steps = (r?.steps ?? []).filter((s) => s && typeof s.why === "string" && g.candidates.some((x) => x.key === s.key)).slice(0, 3);
      const text = [r?.headline ?? "", ...steps.map((s) => s.why)].join(" ");
      if (r && r.headline && r.health && r.health in RANK && numbersAreKnown(text, source)) {
        out = {
          ...out,
          source: "claude",
          // Claude may be more worried than the rules, never less
          health: RANK[r.health] >= RANK[g.floor] ? r.health : g.floor,
          headline: r.headline.slice(0, 400),
          items: steps.map((s) => {
            const x = g.candidates.find((y) => y.key === s.key)!;
            return { key: x.key, title: x.title, why: s.why.slice(0, 300), action: x.action };
          }),
        };
      }
    } catch (e) {
      console.error("groupBriefing failed", e);
    }
  }

  await logAi({
    groupId,
    kind: "briefing",
    source: out.source,
    subject: `Lectura del grupo para ${user.name}: ${out.health}`,
    consulted: g.candidates.map((x) => ({ tool: x.key, input: x.facts })),
    output: [out.headline, ...out.items.map((i, n) => `${n + 1}. ${i.title}. ${i.why}`)].join("\n"),
    // it reads one person's situation: for them and the organizer only
    audience: "organizer",
    subjectUserId: user.id,
  });
  return out;
}

/** The organizer taps a step that the assistant runs itself: a reminder it writes, or a PayPal invoice. */
export async function runBriefingStep(user: User, groupId: string, step: { type: "nudge" | "invoice"; contributionId: string }) {
  const c = await db.contribution.findUnique({
    where: { id: step.contributionId },
    include: { membership: { include: { user: true } }, round: { include: { group: true, recipient: { include: { user: true } } } } },
  });
  if (!c || c.round.groupId !== groupId) throw new HttpError(404, "not_found");
  const group = c.round.group;
  if (group.organizerId !== user.id) throw new HttpError(403, "organizer_only");
  if (c.status !== "PENDING" || c.round.status !== "COLLECTING") throw new HttpError(409, "already_settled");
  const now = new Date();

  if (step.type === "invoice") {
    if (c.paypalInvoiceId) throw new HttpError(409, "invoice_already_sent");
    if (now.getTime() <= c.round.dueAt.getTime()) throw new HttpError(409, "not_due_yet");
    const id = await sendOverdueInvoice(c.id).catch((e) => (console.error("invoice failed", c.id, e), null));
    if (!id) throw new HttpError(502, "invoice_failed");
    await notify(c.membership.userId, groupId, "reminder", group.name, "Te enviamos una factura de PayPal a tu correo por tu aporte vencido. Puedes pagarla desde ahí o desde la app.");
    await logAi({ groupId, kind: "briefing", source: "rules", subject: `Factura de PayPal enviada a ${c.membership.user.name}`, consulted: [{ tool: "paypal.invoicing", input: { contribution: c.id } }], output: `Factura ${id} por $${formatUSD(c.amountCents + c.lateFeeCents)}.`, audience: "organizer", subjectUserId: c.membership.userId });
    return { ok: true, done: "invoice" as const };
  }

  if (c.lastReminderAt && now.getTime() - c.lastReminderAt.getTime() < NUDGE_EVERY) throw new HttpError(409, "already_reminded");
  const w = windows(group);
  const reached = reminderStage(now, c.round.dueAt, w.grace, w.lead);
  const stage = reached === "none" ? "friendly" : reached === "final" ? "firm" : reached;
  const fee = stage === "friendly" ? 0 : c.lateFeeCents || lateFeeCents(c.amountCents, group.lateFeePct);
  const text = await writeReminder({
    groupId,
    userId: c.membership.userId,
    name: c.membership.user.name,
    locale: c.membership.user.locale,
    stage,
    groupName: group.name,
    amount: formatUSD(c.amountCents + fee),
    lateFee: fee ? formatUSD(fee) : null,
    recipientName: c.round.recipient.user.name,
    dueAt: c.round.dueAt,
  });
  await db.contribution.update({ where: { id: c.id }, data: { lastReminderAt: now } });
  await notify(c.membership.userId, groupId, "reminder", group.name, text);
  return { ok: true, done: "nudge" as const, text };
}
