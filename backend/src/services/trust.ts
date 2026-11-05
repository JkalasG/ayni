import { db } from "../db";
import { buildTrustProfile, type TrustProfile } from "../domain/rules";

/** Trust profile across ALL of a person's Ayni groups. Payment behaviour only. */
export async function trustProfile(userId: string): Promise<TrustProfile> {
  const user = await db.user.findUniqueOrThrow({
    where: { id: userId },
    include: {
      memberships: {
        include: {
          group: { select: { status: true } },
          contributions: { include: { round: { select: { dueAt: true } } } },
        },
      },
    },
  });
  return buildTrustProfile({
    accountCreatedAt: user.createdAt,
    paypalVerified: user.paypalVerified,
    now: new Date(),
    memberships: user.memberships.map((m) => ({
      groupStatus: m.group.status,
      contributions: m.contributions.map((c) => ({ status: c.status, paidAt: c.paidAt, dueAt: c.round.dueAt })),
    })),
  });
}
