/**
 * The engine runs every few seconds and moves groups forward:
 *  1. escalating reminders (written by the AI) for pending contributions
 *  2. late fees + covering with retention once the grace period is over
 *  3. when every contribution is settled -> ask the organizer to release the pot
 *  4. auto-execute actions the organizer didn't answer in time
 * In demo mode all the time windows shrink to minutes.
 */
import { db } from "../db";
import { reminderStage, STAGE_ORDER, lateFeeCents, formatUSD } from "../domain/rules";
import { writeReminder } from "../ai/agent";
import { coverWithRetention } from "./payments";
import { execute } from "./actions";
import { notify, postToGroupChat } from "./notify";

const HOUR = 3600_000;

export function windows(group: { demoMode: boolean; demoRoundMinutes: number; graceHours: number; approvalTimeoutHours: number }) {
  if (group.demoMode) {
    const round = group.demoRoundMinutes * 60_000;
    return { grace: round / 2, lead: round / 2, approval: 60_000 };
  }
  return { grace: group.graceHours * HOUR, lead: 24 * HOUR, approval: group.approvalTimeoutHours * HOUR };
}

export async function tickGroup(groupId: string, now = new Date()) {
  const group = await db.group.findUnique({ where: { id: groupId } });
  if (!group || group.status !== "ACTIVE") return;
  const w = windows(group);

  const round = await db.round.findFirst({
    where: { groupId, status: "COLLECTING" },
    include: {
      contributions: { include: { membership: { include: { user: true } } } },
      recipient: { include: { user: true } },
    },
  });

  if (round) {
    for (const c of round.contributions) {
      if (c.status !== "PENDING") continue;
      const stage = reminderStage(now, round.dueAt, w.grace, w.lead);
      const sentIdx = c.remindersSent; // number of stages already notified
      const stageIdx = STAGE_ORDER.indexOf(stage);

      if (stage !== "none" && stageIdx > sentIdx) {
        const fee = stageIdx >= STAGE_ORDER.indexOf("due") ? lateFeeCents(c.amountCents, group.lateFeePct) : 0;
        const text = await writeReminder({
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
        await db.contribution.update({
          where: { id: c.id },
          data: { remindersSent: stageIdx, lastReminderAt: now, lateFeeCents: fee },
        });
      }

      if (stage === "final") {
        const covered = await coverWithRetention(c.id);
        if (covered) {
          await postToGroupChat(
            groupId,
            `🛡️ El aporte de ${c.membership.user.name} se cubrió con su garantía retenida. El grupo no pierde nada.`
          );
        } else if (c.remindersSent < STAGE_ORDER.length) {
          await notify(
            group.organizerId,
            groupId,
            "mediation",
            "Aporte sin cubrir",
            `${c.membership.user.name} no pagó y no tiene garantía suficiente. Abre el chat: el asistente puede ayudar a mediar.`
          );
          await db.contribution.update({ where: { id: c.id }, data: { remindersSent: STAGE_ORDER.length } });
        }
      }
    }

    const fresh = await db.contribution.count({ where: { roundId: round.id, status: "PENDING" } });
    if (fresh === 0) {
      const claim = await db.round.updateMany({ where: { id: round.id, status: "COLLECTING" }, data: { status: "READY" } });
      if (claim.count === 1) {
        await db.pendingAction.create({
          data: {
            groupId,
            type: "RELEASE_POT",
            payload: { roundId: round.id },
            summary: `Enviar el pozo de la ronda ${round.number} a ${round.recipient.user.name}`,
            createdBy: "system",
            expiresAt: new Date(now.getTime() + w.approval),
          },
        });
        await notify(group.organizerId, groupId, "action", "Pozo listo", `Todos pagaron la ronda ${round.number}. Confirma el envío.`);
        await postToGroupChat(groupId, `🧺 ¡Todos cumplieron la ronda ${round.number}! Esperando confirmación del organizador.`);
      }
    }
  }

  const expired = await db.pendingAction.findMany({
    where: { groupId, status: "PENDING", expiresAt: { lte: now } },
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
      const groups = await db.group.findMany({ where: { status: { in: ["ACTIVE", "ORDERING"] } }, select: { id: true, status: true } });
      for (const g of groups) {
        if (g.status === "ACTIVE") await tickGroup(g.id);
        else {
          // ORDERING groups may have an AI order proposal waiting for approval
          const expired = await db.pendingAction.findMany({ where: { groupId: g.id, status: "PENDING", expiresAt: { lte: new Date() } } });
          for (const a of expired) await execute(a, "AUTO_EXECUTED").catch((e) => console.error(e));
        }
      }
    } catch (e) {
      console.error("engine tick failed", e);
    } finally {
      running = false;
    }
  }, intervalMs);
}
