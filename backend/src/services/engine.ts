/**
 * The engine runs every few seconds and moves groups forward:
 *  1. escalating reminders (written by the AI) for pending contributions
 *  2. late fee once due; PayPal invoice at the "firm" stage
 *  3. grace over: cover with the member's guarantee, or ask the organizer to close without it
 *  4. when every contribution is settled -> ask the organizer to release the pot
 *  5. auto-execute actions the organizer didn't answer in time (also for forming groups)
 * In demo mode all the time windows shrink to minutes.
 */
import { db } from "../db";
import { reminderStage, STAGE_ORDER, lateFeeCents, formatUSD } from "../domain/rules";
import { writeReminder } from "../ai/agent";
import { coverWithRetention, retryUnknownPayouts, sendOverdueInvoice } from "./payments";
import { retryPendingRefunds } from "./refunds";
import { execute } from "./actions";
import { notify, postToGroupChat } from "./notify";
import { windows } from "./windows";

export { windows };

const FIRM = STAGE_ORDER.indexOf("firm");
const DONE = STAGE_ORDER.length; // remindersSent value once the final stage has been handled

export async function tickGroup(groupId: string, now = new Date()) {
  const group = await db.group.findUnique({ where: { id: groupId } });
  if (!group || group.status !== "ACTIVE") return;
  const w = windows(group);

  const round = await db.round.findFirst({
    where: { groupId, status: { in: ["COLLECTING", "READY"] } },
    orderBy: { number: "asc" },
    include: {
      contributions: { include: { membership: { include: { user: true } } } },
      recipient: { include: { user: true } },
    },
  });

  if (round?.status === "COLLECTING") {
    for (const c of round.contributions) {
      if (c.status !== "PENDING") continue;
      const stage = reminderStage(now, round.dueAt, w.grace, w.lead);
      const stageIdx = STAGE_ORDER.indexOf(stage);

      if (stage !== "none" && stageIdx > c.remindersSent && c.remindersSent < DONE) {
        const fee = stageIdx >= STAGE_ORDER.indexOf("due") ? lateFeeCents(c.amountCents, group.lateFeePct) : 0;
        await db.contribution.update({
          where: { id: c.id },
          data: { remindersSent: stageIdx, lastReminderAt: now, lateFeeCents: fee },
        });
        if (stageIdx >= FIRM && !c.paypalInvoiceId) {
          await sendOverdueInvoice(c.id).catch((e) => console.error("invoice failed", c.id, e));
        }
        const text = await writeReminder({
          groupId,
          userId: c.membership.userId,
          name: c.membership.user.name,
          locale: c.membership.user.locale,
          stage,
          groupName: group.name,
          amount: formatUSD(c.amountCents + fee),
          lateFee: fee ? formatUSD(fee) : null,
          recipientName: round.recipient.user.name,
          dueAt: round.dueAt,
        });
        await notify(c.membership.userId, groupId, "reminder", group.name, text);
      }

      if (stage === "final" && c.remindersSent < DONE) {
        const covered = await coverWithRetention(c.id);
        if (covered) {
          // Private: the group only sees the contribution as settled.
          await notify(c.membership.userId, groupId, "reminder", group.name, "Tu aporte vencido se cubrió con tu garantía retenida. El grupo no pierde nada.");
          await notify(group.organizerId, groupId, "action", "Aporte cubierto", `El aporte de ${c.membership.user.name} (ronda ${round.number}) se cubrió con su garantía.`);
        } else {
          await notify(
            group.organizerId,
            groupId,
            "mediation",
            "Aporte sin cubrir",
            `${c.membership.user.name} no pagó y no tiene garantía suficiente. Abre el chat: el asistente puede ayudar a mediar.`
          );
          // So the group is never stuck: the organizer decides whether to close the round without it.
          await db.pendingAction.create({
            data: {
              groupId,
              type: "WAIVE_CONTRIBUTION",
              payload: { contributionId: c.id },
              summary: `Cerrar la ronda ${round.number} sin el aporte de ${c.membership.user.name} (queda registrado como impago; se usa lo que tenga de garantía)`,
              createdBy: "system",
              expiresAt: new Date(now.getTime() + w.approval),
            },
          });
        }
        await db.contribution.update({ where: { id: c.id }, data: { remindersSent: DONE } });
      }
    }

    const fresh = await db.contribution.count({ where: { roundId: round.id, status: "PENDING" } });
    if (fresh === 0) {
      const claim = await db.round.updateMany({ where: { id: round.id, status: "COLLECTING" }, data: { status: "READY" } });
      if (claim.count === 1) {
        await askToReleasePot(groupId, round.id, round.number, round.recipient.user.name, group.organizerId, now, w.approval);
        await postToGroupChat(groupId, `¡Todos cumplieron la ronda ${round.number}! Esperando confirmación del organizador.`, { type: "ready", round: round.number });
      }
    }
  } else if (round?.status === "READY") {
    // The organizer rejected the release: ask again after one approval window.
    const actions = await db.pendingAction.findMany({
      where: { groupId, type: "RELEASE_POT", payload: { path: ["roundId"], equals: round.id } },
      orderBy: { createdAt: "desc" },
      take: 1,
    });
    const last = actions[0];
    if (!last || (last.status === "REJECTED" && last.resolvedAt && now.getTime() - last.resolvedAt.getTime() > w.approval)) {
      await askToReleasePot(groupId, round.id, round.number, round.recipient.user.name, group.organizerId, now, w.approval);
    }
  }

  await runExpired(groupId, now);
}

async function askToReleasePot(
  groupId: string,
  roundId: string,
  number: number,
  recipientName: string,
  organizerId: string,
  now: Date,
  approvalMs: number
) {
  await db.pendingAction.create({
    data: {
      groupId,
      type: "RELEASE_POT",
      payload: { roundId },
      summary: `Enviar el pozo de la ronda ${number} a ${recipientName}`,
      createdBy: "system",
      expiresAt: new Date(now.getTime() + approvalMs),
    },
  });
  await notify(organizerId, groupId, "action", "Pozo listo", `La ronda ${number} está completa. Confirma el envío.`);
}

async function runExpired(groupId: string, now = new Date()) {
  const expired = await db.pendingAction.findMany({
    where: { groupId, status: "PENDING", expiresAt: { lte: now } },
    orderBy: { createdAt: "asc" },
  });
  for (const a of expired) {
    try {
      await execute(a, "AUTO_EXECUTED");
    } catch (e) {
      console.error("auto-execute failed", a.id, e);
    }
  }
}

export function startEngine(intervalMs: number) {
  let running = false;
  setInterval(async () => {
    if (running) return;
    running = true;
    try {
      const groups = await db.group.findMany({
        where: { status: { in: ["FORMING", "ORDERING", "ACTIVE"] } },
        select: { id: true, status: true },
      });
      for (const g of groups) {
        // FORMING: join requests waiting for the organizer · ORDERING: AI order proposals
        if (g.status === "ACTIVE") await tickGroup(g.id);
        else await runExpired(g.id);
      }
      await retryUnknownPayouts();
      await retryPendingRefunds();
    } catch (e) {
      console.error("engine tick failed", e);
    } finally {
      running = false;
    }
  }, intervalMs);
}
