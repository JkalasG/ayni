/**
 * PayPal disputes on this group's money. The platform account receives every
 * contribution, so we list its disputes and keep only the ones whose disputed
 * transaction is one of this group's captures.
 */
import { db } from "../db";
import * as paypal from "../paypal";
import { formatUSD } from "../domain/rules";
import { notify, postToGroupChat } from "./notify";

export type GroupDispute = {
  id: string;
  reason: string;
  status: string;
  amount: string;
  memberName: string;
  round: number | null;
  createdAt: string;
};

async function groupCaptures(groupId: string) {
  const contributions = await db.contribution.findMany({
    where: { round: { groupId }, paypalCaptureId: { not: null } },
    include: { round: true, membership: { include: { user: true } } },
  });
  const deposits = await db.membership.findMany({
    where: { groupId, depositCaptureId: { not: null } },
    include: { user: true },
  });
  const map = new Map<string, { memberName: string; round: number | null }>();
  for (const c of contributions) map.set(c.paypalCaptureId!, { memberName: c.membership.user.name, round: c.round.number });
  for (const d of deposits) map.set(d.depositCaptureId!, { memberName: d.user.name, round: 1 });
  return map;
}

export async function groupDisputes(groupId: string): Promise<GroupDispute[]> {
  const captures = await groupCaptures(groupId);
  if (captures.size === 0) return [];
  const all = await paypal.listDisputes(20);
  const out: GroupDispute[] = [];
  for (const d of all) {
    const tx = d.sellerTransactionIds.find((id) => captures.has(id));
    if (!tx) continue;
    const who = captures.get(tx)!;
    out.push({
      id: d.id,
      reason: d.reason,
      status: d.status,
      amount: formatUSD(d.amountCents),
      memberName: who.memberName,
      round: who.round,
      createdAt: d.createdAt,
    });
  }
  return out;
}

/** Webhook CUSTOMER.DISPUTE.CREATED: tell the organizer of the affected group right away. */
export async function onDisputeCreated(resource: any) {
  const ids: string[] = (resource?.disputed_transactions ?? []).map((t: any) => t.seller_transaction_id).filter(Boolean);
  if (ids.length === 0) return;
  const c = await db.contribution.findFirst({
    where: { paypalCaptureId: { in: ids } },
    include: { round: { include: { group: true } }, membership: { include: { user: true } } },
  });
  if (!c) return;
  const g = c.round.group;
  await notify(
    g.organizerId,
    g.id,
    "mediation",
    `Disputa de PayPal · ${g.name}`,
    `${c.membership.user.name} abrió una disputa por su aporte de la ronda ${c.round.number} (${resource?.reason ?? "sin motivo"}). Revisa "Disputas" en el grupo.`
  );
  await postToGroupChat(g.id, `Se abrió una disputa de PayPal sobre un aporte de la ronda ${c.round.number}. El organizador la está revisando.`);
}
