/**
 * Mock mode only: drive a few groups through the REAL services (against the simulated
 * PayPal) so every screen has something to look at. Runs once per database.
 *
 *  - "Pasanaku de la familia" (code FAMILY, organizer Doña Rosa): round 1 paid out with a
 *    guarantee withheld, round 2 half paid, a pending turn-swap request and a chat.
 *  - "Pasanaku abierto de la feria": Tomás asked to join with a deposit; Marisol has to decide,
 *    with the AI recommendation (borderline case).
 *  - "Pasanaku del barrio" stays untouched so you can play the full cycle yourself.
 */
import { db } from "../db";
import { config } from "../config";
import { setTurnOrder, startGroup } from "../services/groups";
import { completeContribution, startCheckout } from "../services/payments";
import { execute } from "../services/actions";
import { tickGroup } from "../services/engine";
import { completeDeposit, requestToJoin } from "../services/admission";
import { chat } from "../ai/agent";
import { sendMessage } from "../services/chat";

async function waitForApi() {
  for (let i = 0; i < 50; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${config.port}/health`);
      if (r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("API did not start");
}

export async function runShowcase() {
  await waitForApi();
  if (await db.group.findUnique({ where: { inviteCode: "FAMILY" } })) return printHelp();
  console.log("   building the showcase (first run only)…");

  const user = (name: string) => db.user.findFirstOrThrow({ where: { name } });
  const [rosa, juan, marisol, efrain, wara, tomas] = await Promise.all(
    ["Doña Rosa", "Juan Carlos", "Marisol", "Don Efraín", "Wara", "Tomás"].map(user)
  );
  const web = config.appWebUrl;

  // ---------------------------------------------------------------- active group
  const family = await db.group.create({
    data: {
      name: "Pasanaku de la familia",
      inviteCode: "FAMILY",
      organizerId: rosa.id,
      contributionCents: 5000,
      frequency: "WEEKLY",
      orderMethod: "AI",
      maxMembers: 5,
      lateFeePct: 5,
      maxRetentionPct: 25,
      memberships: { create: [rosa, juan, marisol, efrain, wara].map((u) => ({ userId: u.id })) },
    },
  });
  await setTurnOrder(rosa, family.id);
  const order = await db.pendingAction.findFirstOrThrow({ where: { groupId: family.id, type: "APPROVE_ORDER" } });
  await execute(order, "APPROVED");
  await startGroup(rosa, family.id);

  const pay = async (u: { id: string }, round: number) => {
    const full = await db.user.findUniqueOrThrow({ where: { id: u.id } });
    const c = await db.contribution.findFirstOrThrow({
      where: { membership: { userId: u.id, groupId: family.id }, round: { number: round } },
    });
    await startCheckout(full, c.id, `${web}/groups/${family.id}`);
    const fresh = await db.contribution.findUniqueOrThrow({ where: { id: c.id } });
    // what the simulated checkout page does when the member presses "Pay"
    await fetch(`${config.paypal.apiBase}/checkoutnow/approve?token=${fresh.paypalOrderId}`, { redirect: "manual" });
    await completeContribution(fresh.paypalOrderId!);
  };

  for (const u of [rosa, juan, marisol, efrain, wara]) await pay(u, 1);
  await tickGroup(family.id);
  const release = await db.pendingAction.findFirstOrThrow({ where: { groupId: family.id, type: "RELEASE_POT", status: "PENDING" } });
  await execute(release, "APPROVED");
  for (const u of [juan, marisol, rosa]) await pay(u, 2);

  // members talking to each other
  await sendMessage(rosa, family.id, "¡Buen día a todos! Ya salió el pozo de la primera ronda.");
  await sendMessage(marisol, family.id, "Gracias, Doña Rosa. Yo ya pagué la segunda.");
  await sendMessage(wara, family.id, "Yo pago mañana, que me depositan desde Virginia.");
  // private questions to the assistant (each member only sees their own), answered without AI
  await chat(juan, family.id, "¿Cuánto debo?");
  await chat(efrain, family.id, "¿Cuándo me toca?");
  await chat(wara, family.id, "¿Quién falta pagar?");
  await chat(rosa, family.id, "¿Quién falta pagar?");

  const members = await db.membership.findMany({ where: { groupId: family.id }, include: { user: true } });
  const mw = members.find((m) => m.userId === wara.id)!;
  const me = members.find((m) => m.userId === efrain.id)!;
  if (mw.turn && me.turn && mw.turn > 2 && me.turn > 2) {
    await db.pendingAction.create({
      data: {
        groupId: family.id,
        type: "SWAP_TURNS",
        payload: { a: mw.id, b: me.id, reason: "Wara necesita el pozo antes por un gasto de salud; Don Efraín aceptó en el chat." },
        summary: `Cambiar turnos: Wara (#${mw.turn}) ↔ Don Efraín (#${me.turn}). Motivo: un gasto de salud; Don Efraín aceptó.`,
        createdBy: "ai",
        expiresAt: new Date(Date.now() + 24 * 3600_000),
      },
    });
  }

  // ---------------------------------------------------------------- open group with a request waiting
  const open = await db.group.findUnique({ where: { inviteCode: "ABIERT" } });
  if (open) {
    // not demo mode, so the organizer's decision doesn't auto-run after one minute
    await db.group.update({ where: { id: open.id }, data: { demoMode: false } });
    const { request } = await requestToJoin(tomas, open.id, {
      message: "Vendo en la feria hace 6 años. Una vez pagué tarde porque me enfermé, nunca más.",
      redirect: `${web}/explore`,
    });
    const r = await db.joinRequest.findUniqueOrThrow({ where: { id: request.id } });
    if (r.paypalOrderId) {
      await fetch(`${config.paypal.apiBase}/checkoutnow/approve?token=${r.paypalOrderId}`, { redirect: "manual" });
      await completeDeposit(r.paypalOrderId);
    }
  }
  printHelp();
}

function printHelp() {
  console.log(`
   ✅ Mock ready. Open the app and use "Entrar como miembro de prueba":
      · Doña Rosa  → organizer of "Pasanaku de la familia" (round 2 in progress, swap request, AI log, disputes)
      · Marisol    → organizer of the open circle: Tomás's request with the AI recommendation
      · Tomás/Kusi → "Explorar pasanakus abiertos" and "Mi perfil de confianza"
      · Doña Rosa  → "Pasanaku del barrio" (code BARRIO) to play a full cycle with 4-minute rounds
   Simulated PayPal panel: ${config.paypal.webBase}/
   Start over: npm run mock:reset
`);
}
