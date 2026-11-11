/**
 * What each PayPal webhook event does. The route (routes.ts) has already verified
 * the signature and de-duplicated the event id; every handler here is idempotent too,
 * because PayPal can deliver events late, twice or out of order.
 */
import { db } from "../db";
import { formatUSD } from "../domain/rules";
import { payoutOutcome } from "../domain/paypal-events";
import { completeContribution, completeInvoice } from "./payments";
import { completeDeposit } from "./admission";
import { onDisputeCreated } from "./disputes";
import { notify } from "./notify";

export async function handleWebhook(event: any) {
  const type = String(event?.event_type ?? "");
  switch (type) {
    case "CHECKOUT.ORDER.APPROVED":
      if (event.resource?.intent === "AUTHORIZE") await completeDeposit(event.resource.id).catch(() => undefined);
      else await completeContribution(event.resource.id).catch(() => undefined);
      return;
    case "INVOICING.INVOICE.PAID": {
      const inv = event.resource?.invoice ?? event.resource;
      if (inv?.id) await completeInvoice(inv.id);
      return;
    }
    case "CUSTOMER.DISPUTE.CREATED":
      await onDisputeCreated(event.resource);
      return;
    case "PAYMENT.CAPTURE.COMPLETED": {
      const orderId = event.resource?.supplementary_data?.related_ids?.order_id;
      if (orderId) await completeContribution(orderId).catch(() => undefined);
      return;
    }
  }
  if (payoutOutcome(type)) await onPayoutItem(type, event.resource);
}

/** A payout reached the member, failed, or is waiting for them at PayPal. */
async function onPayoutItem(type: string, resource: any) {
  const payoutId: string | undefined = resource?.payout_item?.sender_item_id;
  if (!payoutId) return;
  const outcome = payoutOutcome(type);
  const itemId: string | undefined = resource?.payout_item_id;

  if (outcome === "WAITING") {
    // The money left our account and PayPal holds it for the member. It is not a failure:
    // marking it failed would let the organizer send it again, and the member could end up with both.
    const p = await db.payout.findUnique({ where: { id: payoutId }, include: { membership: { include: { group: true } } } });
    if (!p || p.status === "SUCCEEDED" || p.paypalItemId === itemId) return;
    await db.payout.update({ where: { id: p.id }, data: { paypalItemId: itemId } });
    await notify(
      p.membership.userId,
      p.membership.groupId,
      "pot",
      "Tu dinero te espera en PayPal",
      `PayPal tiene $${formatUSD(p.amountCents)} de ${p.membership.group.name} para ti. Revisa tu correo de PayPal y confirma tu cuenta para recibirlo.`
    );
    return;
  }

  // States never go backwards: an out-of-order FAILED can't undo a SUCCEEDED.
  const changed = await db.payout.updateMany({
    where: { id: payoutId, status: { notIn: outcome === "FAILED" ? ["SUCCEEDED", "FAILED"] : ["SUCCEEDED"] } },
    data: { status: outcome!, paypalItemId: itemId },
  });
  if (outcome === "FAILED" && changed.count === 1) {
    const p = await db.payout.findUnique({ where: { id: payoutId }, include: { membership: { include: { group: true, user: true } } } });
    if (!p) return;
    const g = p.membership.group;
    await notify(g.organizerId, g.id, "action", "Un envío no llegó", `PayPal no entregó $${formatUSD(p.amountCents)} a ${p.membership.user.name}. Puedes reintentarlo desde el grupo.`);
  }
}
