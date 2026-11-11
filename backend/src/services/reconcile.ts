/**
 * Daily reconciliation with PayPal Transaction Search: compares the charges Ayni recorded with the
 * ones PayPal reports and tells the organizer of any group with a difference. Read-only on PayPal.
 *
 * PayPal needs some hours before a transaction shows up in Transaction Search, so the window ends
 * a few hours ago: a payment made a minute ago is never reported missing.
 */
import { db } from "../db";
import type { User } from "@prisma/client";
import * as paypal from "../paypal";
import { reconcile, type Issue, type OurCharge } from "../domain/reconcile";
import { formatUSD } from "../domain/rules";
import { HttpError } from "./errors";
import { notify } from "./notify";

const LAG_MS = 4 * 3600_000; // PayPal can take up to ~3 hours
const WINDOW_MS = 3 * 86_400_000; // always well under PayPal's 31-day limit
const EVERY_MS = 24 * 3600_000;
const MANUAL_COOLDOWN_MS = 5 * 60_000;

export async function runReconciliation(now = new Date()) {
  const to = new Date(now.getTime() - LAG_MS);
  const from = new Date(to.getTime() - WINDOW_MS);

  let pp: Awaited<ReturnType<typeof paypal.searchCharges>>;
  try {
    pp = await paypal.searchCharges(from, to);
  } catch (e) {
    // Usually "Transaction Search is not enabled for this app". Recorded, never a crash.
    const reason = e instanceof paypal.PayPalError ? `PayPal ${e.status}` : "network";
    console.warn("reconciliation unavailable:", reason);
    return db.reconciliation.create({ data: { from, to, status: "UNAVAILABLE", detail: reason, issues: [], perGroup: {} } });
  }

  const [contributions, deposits, refunds] = await Promise.all([
    db.contribution.findMany({
      where: { paypalCaptureId: { not: null }, paidAt: { gte: from, lte: to } },
      select: { paypalCaptureId: true, amountCents: true, lateFeeCents: true, round: { select: { groupId: true } } },
    }),
    // A deposit that has not become a contribution yet (the group has not started).
    db.membership.findMany({
      where: { depositCaptureId: { not: null }, joinedAt: { gte: from, lte: to }, group: { rounds: { none: {} } } },
      select: { depositCaptureId: true, groupId: true, group: { select: { contributionCents: true } } },
    }),
    db.refund.findMany({ select: { captureId: true } }),
  ]);
  const ours: OurCharge[] = [
    ...contributions.map((c) => ({ captureId: c.paypalCaptureId!, amountCents: c.amountCents + c.lateFeeCents, groupId: c.round.groupId })),
    ...deposits.map((m) => ({ captureId: m.depositCaptureId!, amountCents: m.group.contributionCents, groupId: m.groupId })),
  ];
  const result = reconcile(ours, pp.charges, new Set(refunds.map((r) => r.captureId)));
  const run = await db.reconciliation.create({
    data: { from, to, status: result.issues.length ? "ISSUES" : "OK", checked: result.checked, matched: result.matched, issues: result.issues as any, perGroup: result.perGroup as any },
  });

  // Each organizer hears once per run, only about their own group.
  const byGroup = new Map<string, Issue[]>();
  for (const i of result.issues) if (i.groupId) byGroup.set(i.groupId, [...(byGroup.get(i.groupId) ?? []), i]);
  for (const [groupId, list] of byGroup) {
    const g = await db.group.findUnique({ where: { id: groupId } });
    if (!g) continue;
    await notify(g.organizerId, g.id, "mediation", "Diferencia con PayPal", `La revisión diaria encontró ${list.length} cobro(s) de ${g.name} que no coinciden con PayPal. Revisa el historial de pagos.`);
  }
  return run;
}

/** Engine: once a day. */
export async function maybeReconcile(now = new Date()) {
  const last = await db.reconciliation.findFirst({ orderBy: { ranAt: "desc" } });
  if (last && now.getTime() - last.ranAt.getTime() < EVERY_MS) return null;
  return runReconciliation(now);
}

/** What a member of the group may know: how many of THEIR GROUP's charges PayPal confirmed, and the problems in it. */
export async function groupReconciliation(user: User, groupId: string) {
  const g = await db.group.findUnique({ where: { id: groupId }, include: { memberships: { select: { userId: true } } } });
  if (!g) throw new HttpError(404, "not_found");
  if (!g.memberships.some((m) => m.userId === user.id)) throw new HttpError(403, "not_a_member");
  const isOrganizer = g.organizerId === user.id;
  // The last run that could actually check something.
  const run = await db.reconciliation.findFirst({ where: { status: { in: ["OK", "ISSUES"] } }, orderBy: { ranAt: "desc" } });
  const latest = await db.reconciliation.findFirst({ orderBy: { ranAt: "desc" } });
  if (!run) return { ranAt: null, available: latest?.status !== "UNAVAILABLE", checked: 0, matched: 0, issues: [], isOrganizer };
  const mine = ((run.perGroup as any)?.[groupId] ?? { checked: 0, matched: 0 }) as { checked: number; matched: number };
  const issues = ((run.issues as unknown as Issue[]) ?? []).filter((i) => i.groupId === groupId);
  return {
    ranAt: run.ranAt,
    from: run.from,
    to: run.to,
    available: true,
    checked: mine.checked,
    matched: mine.matched,
    // The organizer sees the detail; members only whether everything matches.
    issues: isOrganizer ? issues.map((i) => ({ type: i.type, captureId: i.captureId, amount: "ours" in i ? formatUSD(i.ours) : formatUSD((i as any).theirs ?? 0), theirs: "theirs" in i ? formatUSD(i.theirs) : null })) : [],
    issueCount: issues.length,
    isOrganizer,
  };
}

/** Organizer asks for a fresh check now (with a pause, so it cannot be used to hammer PayPal). */
export async function reconcileNow(user: User, groupId: string) {
  const g = await db.group.findUnique({ where: { id: groupId } });
  if (!g) throw new HttpError(404, "not_found");
  if (g.organizerId !== user.id) throw new HttpError(403, "organizer_only");
  const last = await db.reconciliation.findFirst({ orderBy: { ranAt: "desc" } });
  if (!last || Date.now() - last.ranAt.getTime() >= MANUAL_COOLDOWN_MS) await runReconciliation();
  return groupReconciliation(user, groupId);
}
