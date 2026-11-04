/**
 * Seeds a demo pasanaku with 5 members mapped to your PayPal SANDBOX personal accounts.
 * Put their emails in DEMO_MEMBER_EMAILS (comma separated) so payouts land in real sandbox accounts.
 *
 *   DEMO_MEMBER_EMAILS="ana@personal.example.com,luis@...,..." npm run db:seed
 */
import "dotenv/config";
import { db } from "./db";
import { generateInviteCode } from "./domain/rules";

const NAMES = ["Doña Rosa", "Juan Carlos", "Marisol", "Don Efraín", "Wara"];

async function main() {
  const emails = (process.env.DEMO_MEMBER_EMAILS ?? "").split(",").map((e) => e.trim()).filter(Boolean);
  if (emails.length < NAMES.length) {
    console.warn(`DEMO_MEMBER_EMAILS has ${emails.length} emails; using placeholders for the rest (payouts to them will fail).`);
  }
  const users = [];
  for (let i = 0; i < NAMES.length; i++) {
    const email = emails[i] ?? `demo${i + 1}@example.com`;
    users.push(
      await db.user.upsert({
        where: { paypalUserId: `demo-${i + 1}` },
        update: { email, name: NAMES[i] },
        create: { paypalUserId: `demo-${i + 1}`, email, name: NAMES[i] },
      })
    );
  }
  const group = await db.group.create({
    data: {
      name: "Pasanaku del barrio",
      inviteCode: generateInviteCode(),
      organizerId: users[0].id,
      contributionCents: 2000,
      frequency: "WEEKLY",
      orderMethod: "AI",
      maxMembers: 5,
      demoMode: true,
      demoRoundMinutes: 4,
      memberships: { create: users.map((u) => ({ userId: u.id })) },
    },
  });
  console.log(`Demo group "${group.name}" created. Invite code: ${group.inviteCode}`);
}

main().finally(() => db.$disconnect());
