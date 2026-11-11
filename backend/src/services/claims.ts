/**
 * Claims ("reclamos"): a member reports a problem with one of THEIR contributions inside Ayni
 * (double charge, wrong amount, a charge they do not recognise…) before going to PayPal.
 *
 *   OPEN ──organizer refunds──▶ REFUNDING ──PayPal confirms──▶ REFUNDED   (contribution is pending again)
 *     │
 *     ├──organizer explains──▶ REJECTED ──member opens a PayPal dispute──▶ ESCALATED
 *     └──member opens a PayPal dispute──▶ ESCALATED ──PayPal decides──▶ RESOLVED
 *
 * The link with PayPal is the capture id: a dispute names the capture it is about, and every paid
 * contribution stores its capture. When PayPal reports a dispute, the claim for that contribution is
 * escalated and carries the dispute id (or one is created, so every dispute has its record here).
 * Once escalated, Ayni no longer refunds that contribution by itself: PayPal decides, so the money
 * cannot be given back twice.
 *
 * Only the member who paid and the organizer see a claim.
 */
import { db } from "../db";
import type { Claim, User } from "@prisma/client";
import { cleanMessage } from "../domain/chat";
import { formatUSD } from "../domain/rules";
import { HttpError } from "./errors";
import { notify } from "./notify";
import { sendRefund } from "./refunds";

export const CLAIM_KINDS = ["DOUBLE_CHARGE", "WRONG_AMOUNT", "NOT_RECOGNIZED", "OTHER"] as const;
const MAX_OPEN_PER_MEMBER = 3;

type Event = { at: string; type: string; text: string };
const event = (type: string, text: string): Event => ({ at: new Date().toISOString(), type, text });

async function addEvent(claimId: string, ev: Event) {
  const c = await db.claim.findUnique({ where: { id: claimId }, select: { timeline: true } });
  const timeline = [...((c?.timeline as unknown as Event[]) ?? []), ev];
  await db.claim.update({ where: { id: claimId }, data: { timeline: timeline as any } });
}

/** What the member and the organizer are shown. */
function present(c: Claim, names: { claimant: string; round: number | null; amountCents: number }, viewerIsOrganizer: boolean) {
  return {
    id: c.id,
    contributionId: c.contributionId,
    kind: c.kind,
    status: c.status,
    message: c.message,
    claimant: names.claimant,
    round: names.round,
    amountCents: names.amountCents,
    paypalDisputeId: c.paypalDisputeId,
    outcome: c.outcome,
    note: c.note,
    timeline: c.timeline,
    createdAt: c.createdAt,
    resolvedAt: c.resolvedAt,
    // What each side can do now
    canRefund: viewerIsOrganizer && c.status === "OPEN",
    canReject: viewerIsOrganizer && c.status === "OPEN",
  };
}

export async function openClaim(user: User, contributionId: string, kind: string, rawMessage: unknown) {
  if (!(CLAIM_KINDS as readonly string[]).includes(kind)) throw new HttpError(400, "invalid_kind");
  const message = cleanMessage(rawMessage)?.slice(0, 500) ?? null;
  if (kind === "OTHER" && !message) throw new HttpError(400, "message_required");

  const c = await db.contribution.findUnique({
    where: { id: contributionId },
    include: { membership: { include: { user: true } }, round: { include: { group: true } } },
  });
  // Only the person who paid: anyone else gets "not found", not a hint that it exists.
  if (!c || c.membership.userId !== user.id) throw new HttpError(404, "not_found");
  if (!c.paypalCaptureId || (c.status !== "PAID" && c.status !== "COVERED")) throw new HttpError(409, "nothing_to_claim");
  if (c.status === "COVERED") throw new HttpError(409, "nothing_to_claim"); // paid from the guarantee: no PayPal charge to claim
  const g = c.round.group;

  const active = await db.claim.findFirst({ where: { contributionId, status: { in: ["OPEN", "REFUNDING", "ESCALATED"] } } });
  if (active) throw new HttpError(409, "claim_exists");
  const open = await db.claim.count({ where: { userId: user.id, groupId: g.id, status: "OPEN" } });
  if (open >= MAX_OPEN_PER_MEMBER) throw new HttpError(429, "too_many_claims");

  const claim = await db.claim.create({
    data: {
      groupId: g.id,
      contributionId,
      membershipId: c.membershipId,
      userId: user.id,
      kind,
      message,
      captureId: c.paypalCaptureId,
      timeline: [event("opened", "Reclamo abierto")] as any,
    },
  });
  await notify(
    g.organizerId,
    g.id,
    "mediation",
    `Reclamo · ${g.name}`,
    `${user.name} reporta un problema con su aporte de la ronda ${c.round.number}. Revísalo en "Reclamos" del grupo.`
  );
  return { id: claim.id, status: claim.status };
}

/** The member's own claims, or every claim of the group for the organizer. */
export async function listClaims(user: User, groupId: string) {
  const m = await db.membership.findUnique({ where: { userId_groupId: { userId: user.id, groupId } }, include: { group: true } });
  if (!m) throw new HttpError(403, "not_a_member");
  const isOrganizer = m.group.organizerId === user.id;
  const claims = await db.claim.findMany({
    where: { groupId, ...(isOrganizer ? {} : { userId: user.id }) },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  const contributions = await db.contribution.findMany({
    where: { id: { in: claims.map((c) => c.contributionId) } },
    select: { id: true, amountCents: true, lateFeeCents: true, round: { select: { number: true } } },
  });
  const users = await db.user.findMany({ where: { id: { in: claims.map((c) => c.userId) } }, select: { id: true, name: true } });
  return {
    isOrganizer,
    claims: claims.map((c) => {
      const k = contributions.find((x) => x.id === c.contributionId);
      return present(c, { claimant: users.find((u) => u.id === c.userId)?.name ?? "", round: k?.round.number ?? null, amountCents: (k?.amountCents ?? 0) + (k?.lateFeeCents ?? 0) }, isOrganizer);
    }),
  };
}

async function organizerClaim(user: User, claimId: string) {
  const claim = await db.claim.findUnique({ where: { id: claimId } });
  if (!claim) throw new HttpError(404, "not_found");
  const g = await db.group.findUniqueOrThrow({ where: { id: claim.groupId } });
  if (g.organizerId !== user.id) throw new HttpError(403, "organizer_only");
  return { claim, group: g };
}

/** The organizer gives the money back. Only while the pot has not left, and never once PayPal has the case. */
export async function refundClaim(user: User, claimId: string) {
  const { claim, group } = await organizerClaim(user, claimId);
  if (claim.status === "ESCALATED") throw new HttpError(409, "escalated_to_paypal");
  const c = await db.contribution.findUniqueOrThrow({ where: { id: claim.contributionId }, include: { round: true } });
  if (c.round.status === "PAID_OUT") throw new HttpError(409, "pot_already_sent");
  if (!c.paypalCaptureId || c.paypalCaptureId !== claim.captureId || c.status !== "PAID") throw new HttpError(409, "nothing_to_refund");

  // Claim the decision first: two taps refund once.
  const taken = await db.claim.updateMany({ where: { id: claim.id, status: "OPEN" }, data: { status: "REFUNDING" } });
  if (taken.count === 0) throw new HttpError(409, "not_open");
  const refund = await db.refund
    .create({
      data: {
        groupId: group.id,
        userId: claim.userId,
        membershipId: claim.membershipId,
        contributionId: c.id,
        captureId: c.paypalCaptureId,
        amountCents: c.amountCents + c.lateFeeCents,
        reason: "CLAIM_REFUND",
        dedupeKey: `claim-${claim.id}`,
        reopened: true,
      },
    })
    .catch(() => null);
  if (!refund) throw new HttpError(409, "already_refunding");
  await addEvent(claim.id, event("refunding", "El organizador aceptó devolver el aporte"));
  await notify(claim.userId, group.id, "action", `Reclamo · ${group.name}`, "El organizador aceptó tu reclamo y PayPal está devolviendo tu aporte.");
  return { ok: await sendRefund(refund.id) };
}

/** The organizer explains why the contribution is right. The member can still go to PayPal. */
export async function rejectClaim(user: User, claimId: string, rawNote: unknown) {
  const { claim, group } = await organizerClaim(user, claimId);
  const note = cleanMessage(rawNote)?.slice(0, 500);
  if (!note) throw new HttpError(400, "note_required");
  const done = await db.claim.updateMany({ where: { id: claim.id, status: "OPEN" }, data: { status: "REJECTED", note, resolvedAt: new Date() } });
  if (done.count === 0) throw new HttpError(409, "not_open");
  await addEvent(claim.id, event("rejected", "El organizador respondió"));
  await notify(
    claim.userId,
    group.id,
    "action",
    `Reclamo · ${group.name}`,
    `El organizador respondió tu reclamo: ${note} Si no estás de acuerdo, puedes abrir una disputa en el Centro de resoluciones de PayPal; Ayni la vinculará a este reclamo.`
  );
  return { ok: true };
}

/** A PayPal refund we asked for was confirmed: the contribution is pending again and the claim is closed. */
export async function onClaimRefunded(refund: { contributionId: string | null; captureId: string; groupId: string }) {
  if (!refund.contributionId) return;
  const c = await db.contribution.findUnique({ where: { id: refund.contributionId }, include: { round: { include: { group: true } } } });
  if (!c) return;
  const reopened = await db.$transaction(async (tx) => {
    const back = await tx.contribution.updateMany({
      where: { id: c.id, status: "PAID", paypalCaptureId: refund.captureId, round: { status: { in: ["COLLECTING", "READY"] } } },
      data: { status: "PENDING", paidAt: null, paypalOrderId: null, paypalCaptureId: null, paypalFeeCents: null, paypalNetCents: null, remindersSent: 0, lastReminderAt: null, autoPayAttemptedAt: null, autoPayNoticeAt: null },
    });
    if (back.count === 0) return false;
    await tx.round.updateMany({ where: { id: c.roundId, status: "READY" }, data: { status: "COLLECTING" } });
    await tx.pendingAction.updateMany({
      where: { groupId: c.round.groupId, type: "RELEASE_POT", status: "PENDING", payload: { path: ["roundId"], equals: c.roundId } },
      data: { status: "REJECTED", resolvedAt: new Date() },
    });
    return true;
  });
  const claim = await db.claim.findFirst({ where: { contributionId: c.id, status: "REFUNDING" } });
  if (claim) {
    await db.claim.update({ where: { id: claim.id }, data: { status: "REFUNDED", resolvedAt: new Date(), outcome: "REFUNDED_BY_ORGANIZER" } });
    await addEvent(claim.id, event("refunded", `PayPal devolvió $${formatUSD((await db.refund.findFirst({ where: { dedupeKey: `claim-${claim.id}` } }))?.amountCents ?? 0)}`));
    await notify(
      claim.userId,
      c.round.groupId,
      "pot",
      `Reclamo · ${c.round.group.name}`,
      reopened ? `PayPal te devolvió tu aporte de la ronda ${c.round.number}. Para seguir al día, vuelve a pagarlo desde el grupo.` : `PayPal te devolvió tu aporte de la ronda ${c.round.number}.`
    );
  }
}

/**
 * PayPal reports a dispute on one of our captures. Link it to the claim of that contribution, or create the
 * record so every dispute has its place in Ayni. Safe to receive twice.
 */
export async function linkDispute(captureIds: string[], disputeId: string, reason: string | undefined) {
  const c = await db.contribution.findFirst({
    where: { paypalCaptureId: { in: captureIds } },
    include: { round: { include: { group: true } }, membership: { include: { user: true } } },
  });
  if (!c) return null;
  const g = c.round.group;
  const existing = await db.claim.findFirst({ where: { contributionId: c.id, status: { in: ["OPEN", "REJECTED", "ESCALATED", "REFUNDING"] } }, orderBy: { createdAt: "desc" } });
  if (existing) {
    if (existing.paypalDisputeId === disputeId) return existing;
    if (existing.status === "OPEN" || existing.status === "REJECTED") {
      const done = await db.claim.updateMany({ where: { id: existing.id, status: { in: ["OPEN", "REJECTED"] } }, data: { status: "ESCALATED", paypalDisputeId: disputeId, resolvedAt: null } });
      if (done.count === 1) await addEvent(existing.id, event("escalated", "Se abrió una disputa en PayPal"));
    } else if (!existing.paypalDisputeId) {
      await db.claim.update({ where: { id: existing.id }, data: { paypalDisputeId: disputeId } });
    }
    return db.claim.findUnique({ where: { id: existing.id } });
  }
  const created = await db.claim
    .create({
      data: {
        groupId: g.id,
        contributionId: c.id,
        membershipId: c.membershipId,
        userId: c.membership.userId,
        kind: "PAYPAL_DISPUTE",
        message: reason ? `Disputa abierta en PayPal: ${reason}` : null,
        captureId: c.paypalCaptureId!,
        status: "ESCALATED",
        paypalDisputeId: disputeId,
        timeline: [event("escalated", "Se abrió una disputa en PayPal")] as any,
      },
    })
    .catch(() => null);
  return created;
}

/** PayPal decided the dispute: write the outcome in the claim. */
export async function resolveDispute(disputeId: string, outcomeCode: string | undefined, outcomeText: string) {
  const claim = await db.claim.findFirst({ where: { paypalDisputeId: disputeId, status: "ESCALATED" } });
  if (!claim) return null;
  const done = await db.claim.updateMany({ where: { id: claim.id, status: "ESCALATED" }, data: { status: "RESOLVED", outcome: outcomeCode ?? "RESOLVED", note: outcomeText, resolvedAt: new Date() } });
  if (done.count === 0) return null;
  await addEvent(claim.id, event("resolved", `PayPal resolvió: ${outcomeText}`));
  const g = await db.group.findUnique({ where: { id: claim.groupId } });
  await notify(claim.userId, claim.groupId, "mediation", `Reclamo · ${g?.name ?? ""}`, `PayPal resolvió tu disputa: ${outcomeText}.`);
  return claim;
}
