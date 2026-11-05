/**
 * Demo data for judges and the video. Safe to run more than once.
 *
 *   DEMO_MEMBER_EMAILS="rosa@personal.example.com,juan@...,..." npm run db:seed
 *
 * Emails map, in order, to: Doña Rosa, Juan Carlos, Marisol, Don Efraín, Wara, Tomás, Kusi.
 * Use your PayPal SANDBOX personal accounts so payouts land somewhere real.
 *
 * Creates:
 *  - a FINISHED past pasanaku, so trust profiles have real history (some late payments, one covered by guarantee)
 *  - "Pasanaku del barrio": 5 members, demo mode (4-minute rounds), AI turn order — the main demo
 *  - "Pasanaku abierto de la feria": an OPEN group with admission rules.
 *      Tomás is borderline (75% on time, rule is 80%) -> the AI recommends, the organizer decides.
 *      Kusi has no history -> newcomer: accepted, second-half turn and extra guarantee.
 */
import "dotenv/config";
import { db } from "./db";

const NAMES = ["Doña Rosa", "Juan Carlos", "Marisol", "Don Efraín", "Wara", "Tomás", "Kusi"];
const DAY = 86_400_000;

async function main() {
  const emails = (process.env.DEMO_MEMBER_EMAILS ?? "").split(",").map((e) => e.trim()).filter(Boolean);
  if (emails.length < NAMES.length && process.env.APP_MODE !== "mock") {
    console.warn(`DEMO_MEMBER_EMAILS has ${emails.length} emails; using placeholders for the rest (payouts to them will fail).`);
  }
  const users = [];
  for (let i = 0; i < NAMES.length; i++) {
    const email = emails[i] ?? `demo${i + 1}@example.com`;
    users.push(
      await db.user.upsert({
        where: { paypalUserId: `demo-${i + 1}` },
        update: { email, name: NAMES[i], paypalVerified: true },
        create: {
          paypalUserId: `demo-${i + 1}`,
          email,
          name: NAMES[i],
          paypalVerified: true,
          createdAt: new Date(Date.now() - (i === 6 ? 2 : 200) * DAY),
        },
      })
    );
  }
  const [rosa, juan, marisol, efrain, wara, tomas] = users;

  // ---------------------------------------------------------- history
  if (!(await db.group.findUnique({ where: { inviteCode: "FERIA5" } }))) {
    await pastGroup("FERIA5", "Pasanaku de la feria (2025)", rosa.id, [rosa.id, juan.id, marisol.id, efrain.id, wara.id], (member, round) => {
      if (member === efrain.id && (round === 2 || round === 4)) return "late";
      if (member === wara.id && round === 3) return "covered";
      return "onTime";
    });
    // Tomás: 3 of 4 on time = 75% (the open group asks for 80%): a borderline case.
    await pastGroup("TOMAS4", "Pasanaku del mercado (2025)", juan.id, [juan.id, tomas.id, marisol.id, wara.id], (member, round) =>
      member === tomas.id && round === 2 ? "late" : "onTime"
    );
    console.log("Past pasanakus created (trust history).");
  }

  // ---------------------------------------------------------- main demo group
  const barrio = await db.group.findUnique({ where: { inviteCode: "BARRIO" } });
  if (!barrio) {
    await db.group.create({
      data: {
        name: "Pasanaku del barrio",
        inviteCode: "BARRIO",
        organizerId: rosa.id,
        contributionCents: 2000,
        frequency: "WEEKLY",
        orderMethod: "AI",
        maxMembers: 5,
        demoMode: true,
        demoRoundMinutes: 4,
        memberships: { create: [rosa, juan, marisol, efrain, wara].map((u) => ({ userId: u.id })) },
      },
    });
    console.log('Demo group "Pasanaku del barrio" created. Invite code: BARRIO');
  }

  // ---------------------------------------------------------- open group
  const open = await db.group.findUnique({ where: { inviteCode: "ABIERT" } });
  if (!open) {
    await db.group.create({
      data: {
        name: "Pasanaku abierto de la feria",
        description: "Para comerciantes de la feria. Aporte semanal de $10. Buscamos gente puntual.",
        inviteCode: "ABIERT",
        organizerId: marisol.id,
        contributionCents: 1000,
        frequency: "WEEKLY",
        orderMethod: "LOTTERY",
        maxMembers: 6,
        demoMode: true,
        demoRoundMinutes: 4,
        isOpen: true,
        admissionMode: "AI",
        minCompleted: 1,
        minOnTimePct: 80,
        maxLate: 1,
        acceptNewcomers: true,
        requireDeposit: true,
        memberships: { create: [marisol, rosa].map((u) => ({ userId: u.id })) },
      },
    });
    console.log('Open group "Pasanaku abierto de la feria" created (log in as Tomás or Kusi and use Explore).');
  }
}

type Outcome = "onTime" | "late" | "covered";

/** A finished pasanaku in the past, with every round paid out. */
async function pastGroup(code: string, name: string, organizerId: string, memberIds: string[], outcome: (m: string, r: number) => Outcome) {
  const start = new Date(Date.now() - 150 * DAY);
  const group = await db.group.create({
    data: {
      name,
      inviteCode: code,
      organizerId,
      contributionCents: 1000,
      frequency: "WEEKLY",
      orderMethod: "LOTTERY",
      maxMembers: memberIds.length,
      status: "FINISHED",
      startsAt: start,
      createdAt: start,
    },
  });
  const memberships = [];
  for (let i = 0; i < memberIds.length; i++) {
    memberships.push(await db.membership.create({ data: { userId: memberIds[i], groupId: group.id, turn: i + 1 } }));
  }
  for (let r = 1; r <= memberIds.length; r++) {
    const dueAt = new Date(start.getTime() + 7 * r * DAY);
    await db.round.create({
      data: {
        groupId: group.id,
        number: r,
        recipientId: memberships[r - 1].id,
        dueAt,
        status: "PAID_OUT",
        contributions: {
          create: memberships.map((m) => {
            const o = outcome(m.userId, r);
            return {
              membershipId: m.id,
              amountCents: 1000,
              status: o === "covered" ? ("COVERED" as const) : ("PAID" as const),
              lateFeeCents: o === "onTime" ? 0 : 50,
              paidAt: new Date(dueAt.getTime() + (o === "onTime" ? -DAY : 2 * DAY)),
            };
          }),
        },
      },
    });
  }
}

main().finally(() => db.$disconnect());
