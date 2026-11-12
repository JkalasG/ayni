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
 *  - "Pasanaku de los comerciantes" (COMERC): an ACTIVE group written straight into the database with one of every
 *      case, so the calendar, turn and guarantee charts have something to show (see activeGroup below).
 *  - "Pasanaku abierto de la feria": an OPEN group with admission rules.
 *      Tomás is borderline (75% on time, rule is 80%) -> the AI recommends, the organizer decides.
 *      Kusi has no history -> newcomer: accepted, second-half turn and extra guarantee.
 */
import "dotenv/config";
import { db } from "./db";

const NAMES = ["Doña Rosa", "Juan Carlos", "Marisol", "Don Efraín", "Wara", "Tomás", "Kusi"];
// Where each one lives: Juan Carlos works in Madrid, Don Efraín in Buenos Aires, Wara in Virginia.
const COUNTRY = ["BO", "ES", "BO", "AR", "US", "BO", "PE"];
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
        update: { email, name: NAMES[i], paypalVerified: true, country: COUNTRY[i] },
        create: {
          paypalUserId: `demo-${i + 1}`,
          email,
          name: NAMES[i],
          country: COUNTRY[i],
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

  // ---------------------------------------------------------- group in progress, for the charts
  await activeGroup([rosa, juan, marisol, efrain, wara]);

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

  // ---------------------------------------------------------- open groups across borders
  // The diaspora: PayPal moves the money between countries, which a local bank cannot do.
  const abroad = [
    {
      code: "MADRID",
      name: "Pasanaku Madrid–La Paz",
      description: "Bolivianos en Madrid y sus familias en La Paz. Cada quien aporta desde su país con PayPal.",
      country: "ES",
      organizer: juan,
      members: [juan, rosa],
      contributionCents: 3000,
      frequency: "MONTHLY" as const,
      minCompleted: 1,
      minOnTimePct: 80,
      acceptNewcomers: true,
    },
    {
      code: "BAIRES",
      name: "Pasanaku de la colectividad en Buenos Aires",
      description: "Para la comunidad boliviana en Buenos Aires y quienes la apoyan desde Bolivia.",
      country: "AR",
      organizer: efrain,
      members: [efrain, marisol],
      contributionCents: 1500,
      frequency: "WEEKLY" as const,
      minCompleted: 0,
      minOnTimePct: 0,
      acceptNewcomers: true,
    },
    {
      code: "VIRGIN",
      name: "Pasanaku de la diáspora en Virginia",
      description: "Familias bolivianas en Estados Unidos y España. Pedimos historial puntual.",
      country: "US",
      organizer: wara,
      members: [wara, juan],
      contributionCents: 5000,
      frequency: "MONTHLY" as const,
      minCompleted: 2,
      minOnTimePct: 90,
      acceptNewcomers: false,
    },
  ];
  for (const a of abroad) {
    if (await db.group.findUnique({ where: { inviteCode: a.code } })) continue;
    await db.group.create({
      data: {
        name: a.name,
        description: a.description,
        inviteCode: a.code,
        country: a.country,
        organizerId: a.organizer.id,
        contributionCents: a.contributionCents,
        frequency: a.frequency,
        orderMethod: "LOTTERY",
        maxMembers: 6,
        isOpen: true,
        admissionMode: "AI",
        minCompleted: a.minCompleted,
        minOnTimePct: a.minOnTimePct,
        maxLate: null,
        acceptNewcomers: a.acceptNewcomers,
        requireDeposit: true,
        memberships: { create: a.members.map((u) => ({ userId: u.id })) },
      },
    });
  }
}

type Outcome = "onTime" | "late" | "covered";

/**
 * A pasanaku in progress with every case the charts draw. Written straight into the database (no PayPal), dated from
 * now, so it looks the same whenever it is seeded:
 *
 *   round 1  Juan receives   all paid on time; his guarantee (25 %) is withheld from the pot
 *   round 2  Marisol         Efrain paid a day late (late fee); Marisol's guarantee (10 %) is withheld
 *   round 3  Wara            Juan did not pay and his guarantee covered it. Marisol did not pay and her guarantee
 *                            was not enough, so the group closed it unpaid (part recovered). Wara's guarantee (5 %)
 *   round 4  Rosa (now)      due yesterday: Rosa, Juan and Wara paid; Marisol and Efrain are LATE
 *   round 5  Efrain          still to come
 *
 * Tomas and Kusi are not in it, so their admission cases (borderline, newcomer) stay as they are. The engine sees the
 * late contributions as already reminded (stage "due") and the grace period is a year long, so it does nothing to
 * them: no invoices, no automatic cover. Safe to run more than once.
 */
async function activeGroup(users: { id: string }[]) {
  if (await db.group.findUnique({ where: { inviteCode: "COMERC" } })) return;
  const [rosa, juan, marisol, efrain, wara] = users;
  const AMOUNT = 4000;
  const FEE = 200; // 5 %
  const dueAt = (round: number) => new Date(Date.now() + (round - 4) * 7 * DAY - DAY); // round 4 was due yesterday
  const hours = (d: Date, h: number) => new Date(d.getTime() + h * 3_600_000);

  const group = await db.group.create({
    data: {
      name: "Pasanaku de los comerciantes",
      inviteCode: "COMERC",
      organizerId: rosa.id,
      contributionCents: AMOUNT,
      frequency: "WEEKLY",
      orderMethod: "LOTTERY",
      maxMembers: 5,
      lateFeePct: 5,
      maxRetentionPct: 25,
      graceHours: 8760,
      approvalTimeoutHours: 8760,
      status: "ACTIVE",
      startsAt: new Date(dueAt(1).getTime() - 7 * DAY),
      createdAt: new Date(dueAt(1).getTime() - 14 * DAY),
    },
  });

  // turn order and what each one still has withheld right now
  const seats = [
    { user: juan, retentionPct: 25, held: 800, risk: 20 }, // 5000 withheld, 4200 used to cover round 3
    { user: marisol, retentionPct: 10, held: 0, risk: 45 }, // 2020 withheld, all of it recovered in round 3
    { user: wara, retentionPct: 5, held: 911, risk: 30 },
    { user: rosa, retentionPct: 5, held: 0, risk: 10 },
    { user: efrain, retentionPct: 0, held: 0, risk: 40 },
  ];
  const m: Record<string, string> = {};
  for (let i = 0; i < seats.length; i++) {
    const row = await db.membership.create({
      data: { userId: seats[i].user.id, groupId: group.id, turn: i + 1, retentionPct: seats[i].retentionPct, retentionHeldCents: seats[i].held, riskScore: seats[i].risk },
    });
    m[seats[i].user.id] = row.id;
  }

  type Plan = { status: "PAID" | "COVERED" | "DEFAULTED" | "PENDING"; lateDays?: number; recovered?: number };
  const paid: Plan = { status: "PAID" };
  const plans: Record<number, Record<string, Plan>> = {
    1: { [rosa.id]: paid, [juan.id]: paid, [marisol.id]: paid, [efrain.id]: paid, [wara.id]: paid },
    2: { [rosa.id]: paid, [juan.id]: paid, [marisol.id]: paid, [efrain.id]: { status: "PAID", lateDays: 1 }, [wara.id]: paid },
    3: { [rosa.id]: paid, [juan.id]: { status: "COVERED", lateDays: 2 }, [marisol.id]: { status: "DEFAULTED", recovered: 2020 }, [efrain.id]: paid, [wara.id]: paid },
    4: { [rosa.id]: paid, [juan.id]: paid, [marisol.id]: { status: "PENDING" }, [efrain.id]: { status: "PENDING" }, [wara.id]: paid },
    5: {},
  };
  const roundStatus = { 1: "PAID_OUT", 2: "PAID_OUT", 3: "PAID_OUT", 4: "COLLECTING", 5: "UPCOMING" } as const;
  const recipient = [juan, marisol, wara, rosa, efrain];
  const retained: Record<number, number> = { 1: 5000, 2: 2020, 3: 911 }; // withheld from that round's pot
  const potSent: Record<number, number> = { 1: 15000, 2: 18180, 3: 17309 }; // what reached the recipient

  for (let r = 1; r <= 5; r++) {
    const due = dueAt(r);
    const round = await db.round.create({
      data: {
        groupId: group.id,
        number: r,
        recipientId: m[recipient[r - 1].id],
        dueAt: due,
        status: roundStatus[r as 1 | 2 | 3 | 4 | 5],
        ...(retained[r] ? { retainedCents: retained[r], retainedAt: hours(due, 2) } : {}),
      },
    });
    for (const u of users) {
      const plan = plans[r][u.id] ?? { status: "PENDING" as const };
      const overdueNow = plan.status === "PENDING" && r === 4; // pending and past due: late, already reminded
      const fee = plan.lateDays || plan.status === "COVERED" || plan.status === "DEFAULTED" || overdueNow ? FEE : 0;
      await db.contribution.create({
        data: {
          roundId: round.id,
          membershipId: m[u.id],
          amountCents: AMOUNT,
          lateFeeCents: fee,
          status: plan.status,
          recoveredCents: plan.recovered ?? 0,
          paidAt: plan.status === "PENDING" || plan.status === "DEFAULTED" ? null : plan.status === "COVERED" ? hours(due, 49) : new Date(due.getTime() + (plan.lateDays ?? -1) * DAY),
          // "due" stage already handled: the engine leaves these alone
          remindersSent: overdueNow ? 2 : 0,
        },
      });
    }
    if (potSent[r]) {
      await db.payout.create({ data: { roundId: round.id, membershipId: m[recipient[r - 1].id], kind: "POT", amountCents: potSent[r], status: "SENT", createdAt: hours(due, 2) } });
    }
  }
  console.log('Group in progress "Pasanaku de los comerciantes" created (code COMERC): paid, late, covered, closed, guarantee held and used.');
}

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
