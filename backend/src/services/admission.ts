/**
 * Open pasanakus: strangers ask to join, and the organizer's rules (plus the AI
 * in borderline cases) decide, based only on the applicant's trust profile.
 *
 *   request -> [deposit authorized on PayPal] -> evaluate
 *     AUTO:   meets rules ? accept : reject
 *     AI:     meets ? accept : borderline ? AI recommends + organizer decides : reject
 *     MANUAL: organizer decides (silence = reject, deposit voided)
 *   accept  -> capture the deposit (it becomes their round-1 contribution) -> membership
 *   reject  -> void the deposit: nothing is charged
 */
import { db } from "../db";
import type { Group, JoinRequest, User } from "@prisma/client";
import * as paypal from "../paypal";
import { config } from "../config";
import { appendQuery, isAllowedRedirect, signState } from "../auth";
import { checkAdmission, formatUSD, type AdmissionCheck, type TrustProfile } from "../domain/rules";
import { recommendAdmission } from "../ai/agent";
import { HttpError } from "./errors";
import { trustProfile } from "./trust";
import { notify, postToGroupChat } from "./notify";
import { logAi } from "./ailog";
import { windows } from "./windows";

const ACTIVE_REQUEST = ["AWAITING_DEPOSIT", "PENDING"] as const;

export function rulesOf(g: Group) {
  return { minCompleted: g.minCompleted, minOnTimePct: g.minOnTimePct, maxLate: g.maxLate, acceptNewcomers: g.acceptNewcomers };
}

/** Explore screen: open groups with free seats, and whether *this* user meets each group's rules. */
export async function exploreOpenGroups(user: User) {
  const [groups, profile] = await Promise.all([
    db.group.findMany({
      where: { isOpen: true, status: "FORMING" },
      include: {
        _count: { select: { memberships: true } },
        organizer: { select: { name: true } },
        memberships: { where: { userId: user.id }, select: { id: true } },
        joinRequests: { where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 1 },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    trustProfile(user.id),
  ]);
  return {
    profile,
    groups: groups
      .filter((g) => g._count.memberships < g.maxMembers)
      .map((g) => ({
        id: g.id,
        name: g.name,
        description: g.description,
        organizerName: g.organizer.name,
        contributionCents: g.contributionCents,
        frequency: g.frequency,
        members: g._count.memberships,
        maxMembers: g.maxMembers,
        admissionMode: g.admissionMode,
        requireDeposit: g.requireDeposit,
        rules: rulesOf(g),
        check: checkAdmission(profile, rulesOf(g)),
        isMember: g.memberships.length > 0,
        myRequest: g.joinRequests[0] ? { id: g.joinRequests[0].id, status: g.joinRequests[0].status } : null,
      })),
  };
}

export async function requestToJoin(user: User, groupId: string, input: { message?: string; redirect: string }) {
  if (!isAllowedRedirect(input.redirect)) throw new HttpError(400, "redirect_not_allowed");
  const group = await db.group.findUnique({ where: { id: groupId }, include: { _count: { select: { memberships: true } } } });
  if (!group || !group.isOpen) throw new HttpError(404, "not_found");
  if (group.status !== "FORMING") throw new HttpError(409, "group_already_started");
  if (group._count.memberships >= group.maxMembers) throw new HttpError(409, "group_full");
  if (await db.membership.findUnique({ where: { userId_groupId: { userId: user.id, groupId } } }))
    throw new HttpError(409, "already_member");

  const existing = await db.joinRequest.findFirst({ where: { groupId, userId: user.id, status: { in: [...ACTIVE_REQUEST] } } });
  if (existing?.status === "PENDING") throw new HttpError(409, "request_already_pending");
  if (existing) await db.joinRequest.update({ where: { id: existing.id }, data: { status: "CANCELLED", resolvedAt: new Date() } });

  const profile = await trustProfile(user.id);
  const check = checkAdmission(profile, rulesOf(group));
  const base = {
    groupId,
    userId: user.id,
    message: input.message?.trim() || null,
    profile: profile as any,
    failures: check.failures as any,
    meetsRules: check.meets,
    borderline: check.borderline,
  };

  // Clearly not eligible under automatic modes: answer now, never touch their money.
  if (group.admissionMode !== "MANUAL" && !check.meets && !(group.admissionMode === "AI" && check.borderline)) {
    const r = await db.joinRequest.create({ data: { ...base, status: "REJECTED", resolvedAt: new Date() } });
    await logAi({
      groupId,
      kind: "admission",
      source: "rules",
      subject: `Solicitud de ${user.name}: no cumple los requisitos`,
      consulted: { profile, rules: rulesOf(group) },
      output: `Reglas no cumplidas: ${check.failures.join(", ")}`,
      audience: "organizer",
      subjectUserId: user.id,
    });
    return { request: r, approveUrl: null };
  }

  if (!group.requireDeposit) {
    const r = await db.joinRequest.create({ data: { ...base, status: "PENDING" } });
    await evaluate(r.id);
    return { request: await db.joinRequest.findUniqueOrThrow({ where: { id: r.id } }), approveUrl: null };
  }

  const r = await db.joinRequest.create({ data: { ...base, status: "AWAITING_DEPOSIT", depositCents: group.contributionCents } });
  const state = signState({ jr: r.id, redirect: input.redirect });
  const order = await paypal.createOrder({
    intent: "AUTHORIZE",
    amountCents: group.contributionCents,
    customId: r.id,
    description: `Ayni · depósito de admisión · ${group.name}`,
    returnUrl: `${config.publicApiUrl}/paypal/deposit-return?state=${encodeURIComponent(state)}`,
    cancelUrl: appendQuery(input.redirect, { status: "cancelled" }),
    locale: user.locale,
  });
  await db.joinRequest.update({ where: { id: r.id }, data: { paypalOrderId: order.id } });
  return { request: r, approveUrl: order.approveUrl };
}

/** Buyer approved the deposit (return URL or webhook): place the hold, then evaluate. Idempotent. */
export async function completeDeposit(orderId: string) {
  const r = await db.joinRequest.findUnique({ where: { paypalOrderId: orderId } });
  if (!r) throw new HttpError(404, "request_not_found");
  if (r.status !== "AWAITING_DEPOSIT") return r;

  let authorizationId: string | undefined;
  try {
    const auth = await paypal.authorizeOrder(orderId);
    authorizationId = auth.authorizationId;
  } catch (e) {
    // Already authorized (webhook won the race): read it back instead of failing.
    authorizationId = await paypal.getOrderAuthorization(orderId);
    if (!authorizationId) throw e;
  }
  const claim = await db.joinRequest.updateMany({
    where: { id: r.id, status: "AWAITING_DEPOSIT" },
    data: { status: "PENDING", authorizationId },
  });
  if (claim.count === 1) await evaluate(r.id);
  return r;
}

async function evaluate(requestId: string) {
  const r = await db.joinRequest.findUniqueOrThrow({ where: { id: requestId }, include: { group: true, user: true } });
  const g = r.group;
  const check: AdmissionCheck = { meets: r.meetsRules, borderline: r.borderline, failures: r.failures as any };
  const w = windows(g);
  const expiresAt = new Date(Date.now() + w.approval);

  if (g.admissionMode === "AUTO" || (g.admissionMode === "AI" && check.meets)) {
    await logAi({
      groupId: g.id,
      kind: "admission",
      source: "rules",
      subject: `Solicitud de ${r.user.name}: cumple los requisitos`,
      consulted: { profile: r.profile, rules: rulesOf(g) },
      output: check.meets ? "Admitido automáticamente." : `Rechazado: ${check.failures.join(", ")}`,
      audience: "organizer",
      subjectUserId: r.userId,
    });
    return check.meets ? acceptRequest(r.id) : rejectRequest(r.id, "rules");
  }

  let summary = `Solicitud de ${r.user.name} para unirse`;
  let autoDecision: "accept" | "reject" = "reject";
  if (g.admissionMode === "AI") {
    const organizer = await db.user.findUniqueOrThrow({ where: { id: g.organizerId } });
    const rec = await recommendAdmission({
      groupId: g.id,
      applicantUserId: r.userId,
      applicantName: r.user.name,
      profile: r.profile as unknown as TrustProfile,
      rules: rulesOf(g),
      failures: check.failures,
      message: r.message,
      locale: organizer.locale,
    });
    await db.joinRequest.update({ where: { id: r.id }, data: { aiRecommendation: rec.recommendation, aiReason: rec.reason } });
    autoDecision = rec.recommendation;
    summary += ` · la IA recomienda ${rec.recommendation === "accept" ? "aceptar" : "rechazar"}`;
  }
  await db.pendingAction.create({
    data: {
      groupId: g.id,
      type: "ADMIT_MEMBER",
      payload: { requestId: r.id, autoDecision },
      summary,
      createdBy: g.admissionMode === "AI" ? "ai" : "system",
      expiresAt,
    },
  });
  await notify(g.organizerId, g.id, "action", "Nueva solicitud", `${r.user.name} quiere unirse a ${g.name}. Revisa su perfil de confianza.`);
}

export async function acceptRequest(requestId: string) {
  const r = await db.joinRequest.findUniqueOrThrow({
    where: { id: requestId },
    include: { group: { include: { _count: { select: { memberships: true } } } }, user: true },
  });
  if (r.status !== "PENDING") return;
  const g = r.group;
  if (g.status !== "FORMING" || g._count.memberships >= g.maxMembers) return rejectRequest(r.id, "full");

  const claim = await db.joinRequest.updateMany({ where: { id: r.id, status: "PENDING" }, data: { status: "ACCEPTED", resolvedAt: new Date() } });
  if (claim.count === 0) return;

  let depositCaptureId: string | null = null;
  if (r.authorizationId) {
    try {
      depositCaptureId = (await paypal.captureAuthorization(r.authorizationId)).captureId;
    } catch (e) {
      // The hold expired or failed: they can still join, but pay round 1 normally.
      console.error("deposit capture failed", e);
    }
  }
  const profile = r.profile as unknown as TrustProfile;
  await db.membership.create({
    data: { userId: r.userId, groupId: g.id, isNewcomer: profile.isNewcomer, depositCaptureId },
  });
  await notify(
    r.userId,
    g.id,
    "action",
    "¡Te aceptaron!",
    `Ya eres parte de ${g.name}.` + (depositCaptureId ? ` Tu depósito de $${formatUSD(r.depositCents)} cuenta como tu primer aporte.` : "")
  );
  await postToGroupChat(g.id, `${r.user.name} se unió al pasanaku${profile.isNewcomer ? " (miembro nuevo: turno en la segunda mitad y garantía adicional)" : ""}.`);
}

export async function rejectRequest(requestId: string, why: "organizer" | "rules" | "timeout" | "full") {
  const r = await db.joinRequest.findUniqueOrThrow({ where: { id: requestId }, include: { group: true } });
  const claim = await db.joinRequest.updateMany({
    where: { id: r.id, status: { in: [...ACTIVE_REQUEST] } },
    data: { status: "REJECTED", resolvedAt: new Date() },
  });
  if (claim.count === 0) return;
  if (r.authorizationId) await paypal.voidAuthorization(r.authorizationId).catch((e) => console.error("void failed", e));
  const reason = {
    organizer: "El organizador no aprobó la solicitud.",
    rules: "Tu perfil aún no cumple los requisitos de este grupo.",
    timeout: "El organizador no respondió a tiempo.",
    full: "El grupo ya se llenó o ya empezó.",
  }[why];
  await notify(r.userId, r.groupId, "action", `Solicitud a ${r.group.name}`, `${reason} No se te cobró nada.`);
}

export async function myRequest(user: User, requestId: string): Promise<JoinRequest> {
  const r = await db.joinRequest.findUnique({ where: { id: requestId } });
  if (!r || r.userId !== user.id) throw new HttpError(404, "not_found");
  return r;
}
