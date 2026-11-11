import { Router, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { db } from "./db";
import { config } from "./config";
import * as paypal from "./paypal";
import {
  appendQuery,
  isAllowedRedirect,
  issueToken,
  readState,
  requireAuth,
  signState,
  type AuthedRequest,
} from "./auth";
import {
  createGroup,
  groupDetail,
  joinGroup,
  myGroups,
  setTurnOrder,
  startGroup,
  updateAdmission,
  HttpError,
} from "./services/groups";
import { captureForMember, completeContribution, retryPayout, startCheckout } from "./services/payments";
import { resolveAction } from "./services/actions";
import { tickGroup } from "./services/engine";
import { completeDeposit, exploreOpenGroups, myRequest, requestToJoin } from "./services/admission";
import { trustProfile } from "./services/trust";
import { groupDisputes } from "./services/disputes";
import { handleWebhook } from "./services/webhooks";
import { groupLedger, myLedger } from "./services/ledger";
import { cancelGroup, retryRefund } from "./services/refunds";
import { removeSavedMethod, setAutoPay } from "./services/autopay";
import { listClaims, openClaim, refundClaim, rejectClaim } from "./services/claims";
import { summarizeDisputes } from "./ai/agent";
import { hideMessage, listMessages, markRead, sendMessage } from "./services/chat";

export const router = Router();

type H = (req: AuthedRequest, res: Response) => Promise<unknown>;
const wrap = (fn: H) => (req: Request, res: Response, next: NextFunction) =>
  fn(req as AuthedRequest, res).catch(next);
const authed = (fn: H) => [requireAuth, wrap(fn)] as const;

router.get("/health", (_req, res) => res.json({ ok: true, mode: config.mode }));

// ---------------------------------------------------------------- auth

const loginRedirectUri = () => `${config.publicApiUrl}/auth/paypal/callback`;

router.get("/auth/paypal/start", (req, res) => {
  const redirect = String(req.query.redirect ?? "");
  if (!isAllowedRedirect(redirect)) return res.status(400).send("redirect_not_allowed");
  res.redirect(paypal.loginUrl(loginRedirectUri(), signState({ redirect })));
});

router.get(
  "/auth/paypal/callback",
  wrap(async (req, res) => {
    const { redirect } = readState(String(req.query.state ?? ""));
    if (!req.query.code) return res.redirect(appendQuery(redirect, { error: "login_cancelled" }));
    const token = await paypal.exchangeLoginCode(String(req.query.code));
    const info = await paypal.getUserInfo(token);
    const user = await db.user.upsert({
      where: { paypalUserId: info.userId },
      update: { email: info.email, name: info.name, paypalVerified: true, ...(info.payerId ? { paypalPayerId: info.payerId } : {}) },
      create: { paypalUserId: info.userId, paypalPayerId: info.payerId, email: info.email, name: info.name, paypalVerified: true },
    });
    res.redirect(appendQuery(redirect, { token: issueToken(user.id) }));
  })
);

/** Judges' shortcut: log in as one of the seeded sandbox members. Disabled unless ENABLE_DEMO_LOGIN=true. */
router.get("/auth/demo/users", async (_req, res) => {
  if (!config.enableDemoLogin) return res.status(404).end();
  res.json(await db.user.findMany({ where: { paypalUserId: { startsWith: "demo-" } }, select: { id: true, name: true, email: true } }));
});
router.post(
  "/auth/demo",
  wrap(async (req, res) => {
    if (!config.enableDemoLogin) return res.status(404).end();
    const user = await db.user.findFirst({ where: { id: String(req.body.userId), paypalUserId: { startsWith: "demo-" } } });
    if (!user) throw new HttpError(404, "not_found");
    res.json({ token: issueToken(user.id) });
  })
);

/** Countries Ayni groups can be based in: Latin America and the main destinations of its diaspora. */
export const COUNTRIES = ["AR", "BO", "BR", "CL", "CO", "EC", "MX", "PE", "PY", "US", "ES", "IT"] as const;

/** What the app may know about the signed-in person. PayPal account ids stay on the server. */
const publicUser = ({ paypalUserId: _a, paypalPayerId: _b, pushToken: _c, paypalVaultId, ...u }: AuthedRequest["user"]) => ({ ...u, hasSavedMethod: !!paypalVaultId });

router.get("/me", ...authed(async (req, res) => res.json(publicUser(req.user))));
router.patch(
  "/me",
  ...authed(async (req, res) => {
    const data = z.object({ locale: z.enum(["es", "en"]).optional(), country: z.enum(COUNTRIES).nullable().optional() }).parse(req.body);
    res.json(publicUser(await db.user.update({ where: { id: req.user.id }, data })));
  })
);
router.get("/me/profile", ...authed(async (req, res) => res.json(await trustProfile(req.user.id))));
/** Remove my saved PayPal method: deleted at PayPal, and automatic payment stops in all my groups. */
router.delete("/me/payment-method", ...authed(async (req, res) => res.json(await removeSavedMethod(req.user))));
/** Everything I paid and received through PayPal, across my groups. */
router.get("/me/payments", ...authed(async (req, res) => res.json(await myLedger(req.user))));
router.post(
  "/me/push-token",
  ...authed(async (req, res) => {
    const { token } = z.object({ token: z.string().max(200).nullable() }).parse(req.body);
    // one device token belongs to one account at a time
    if (token) await db.user.updateMany({ where: { pushToken: token, id: { not: req.user.id } }, data: { pushToken: null } });
    await db.user.update({ where: { id: req.user.id }, data: { pushToken: token } });
    res.json({ ok: true });
  })
);

// ---------------------------------------------------------------- groups

const createSchema = z.object({
  name: z.string().min(2).max(60),
  country: z.enum(COUNTRIES).default("BO"),
  contributionCents: z.number().int().min(100).max(1_000_000),
  frequency: z.enum(["WEEKLY", "BIWEEKLY", "MONTHLY"]),
  orderMethod: z.enum(["LOTTERY", "AI", "ORGANIZER"]),
  maxMembers: z.number().int().min(2).max(30).default(10),
  lateFeePct: z.number().int().min(0).max(20).default(5),
  maxRetentionPct: z.number().int().min(0).max(50).default(25),
  demoMode: z.boolean().default(false),
  demoRoundMinutes: z.number().int().min(1).max(60).optional(),
});

const admissionSchema = z.object({
  isOpen: z.boolean(),
  description: z.string().max(400).nullable().optional(),
  admissionMode: z.enum(["MANUAL", "AUTO", "AI"]).default("AI"),
  minCompleted: z.number().int().min(0).max(50).default(0),
  minOnTimePct: z.number().int().min(0).max(100).default(0),
  maxLate: z.number().int().min(0).max(100).nullable().default(null),
  acceptNewcomers: z.boolean().default(true),
  requireDeposit: z.boolean().default(true),
});

router.get("/groups", ...authed(async (req, res) => res.json(await myGroups(req.user))));
router.post(
  "/groups",
  ...authed(async (req, res) => {
    const base = createSchema.parse(req.body);
    const admission = req.body?.isOpen ? admissionSchema.parse(req.body) : {};
    res.status(201).json(await createGroup(req.user, { ...base, ...admission }));
  })
);
router.patch(
  "/groups/:id/admission",
  ...authed(async (req, res) => res.json(await updateAdmission(req.user, req.params.id, admissionSchema.parse(req.body))))
);

// ---------------------------------------------------------------- open pasanakus

router.get("/explore", ...authed(async (req, res) => res.json(await exploreOpenGroups(req.user))));
router.post(
  "/groups/:id/requests",
  ...authed(async (req, res) => {
    const input = z.object({ message: z.string().max(500).optional(), redirect: z.string() }).parse(req.body);
    res.status(201).json(await requestToJoin(req.user, req.params.id, input));
  })
);
router.get("/requests/:id", ...authed(async (req, res) => res.json(await myRequest(req.user, req.params.id))));

/** PayPal sends the applicant back here after approving the deposit hold. */
router.get("/paypal/deposit-return", async (req, res) => {
  let redirect = config.appWebUrl;
  try {
    const state = readState(String(req.query.state ?? ""));
    redirect = state.redirect;
    const orderId = String(req.query.token ?? "");
    const r = await db.joinRequest.findUnique({ where: { id: state.jr } });
    if (!r || r.paypalOrderId !== orderId) throw new Error("order_mismatch");
    await completeDeposit(orderId);
    res.redirect(appendQuery(redirect, { status: "deposit", request: r.id }));
  } catch (e) {
    console.error("deposit return failed", e);
    res.redirect(appendQuery(redirect, { status: "error" }));
  }
});
router.post(
  "/groups/join",
  ...authed(async (req, res) => res.json(await joinGroup(req.user, z.object({ code: z.string().min(4) }).parse(req.body).code)))
);
router.get("/groups/:id", ...authed(async (req, res) => res.json(await groupDetail(req.user, req.params.id))));
router.post(
  "/groups/:id/order",
  ...authed(async (req, res) => {
    const { order } = z.object({ order: z.array(z.string()).optional() }).parse(req.body ?? {});
    res.json(await setTurnOrder(req.user, req.params.id, order));
  })
);
router.post("/groups/:id/start", ...authed(async (req, res) => res.json(await startGroup(req.user, req.params.id))));
/** Organizer cancels a pasanaku that has not started: deposits are refunded, holds released. */
router.post("/groups/:id/cancel", ...authed(async (req, res) => res.json(await cancelGroup(req.user, req.params.id))));

/** Demo helper for the video: run the engine for this group right now. */
router.post(
  "/groups/:id/tick",
  ...authed(async (req, res) => {
    const g = await db.group.findUnique({ where: { id: req.params.id } });
    if (!g?.demoMode || g.organizerId !== req.user.id) throw new HttpError(403, "demo_organizer_only");
    await tickGroup(g.id);
    res.json({ ok: true });
  })
);

// ---------------------------------------------------------------- transparency + disputes

/** Payment history of the group, masked for whoever asks (see domain/ledger.ts). */
router.get("/groups/:id/ledger", ...authed(async (req, res) => res.json(await groupLedger(req.user, req.params.id))));

router.get(
  "/groups/:id/ai-log",
  ...authed(async (req, res) => {
    await assertMember(req.user.id, req.params.id);
    const g = await db.group.findUniqueOrThrow({ where: { id: req.params.id } });
    const visible =
      g.organizerId === req.user.id ? {} : { OR: [{ audience: "group" }, { subjectUserId: req.user.id }] };
    res.json(await db.aiLog.findMany({ where: { groupId: g.id, ...visible }, orderBy: { createdAt: "desc" }, take: 100 }));
  })
);

router.get(
  "/groups/:id/disputes",
  ...authed(async (req, res) => {
    const g = await db.group.findUnique({ where: { id: req.params.id } });
    if (!g || g.organizerId !== req.user.id) throw new HttpError(403, "organizer_only");
    const disputes = await groupDisputes(g.id);
    res.json({ disputes, summary: await summarizeDisputes(g.id, disputes, req.user.locale) });
  })
);

router.post("/payouts/:id/retry", ...authed(async (req, res) => res.json(await retryPayout(req.user, req.params.id))));
router.post("/refunds/:id/retry", ...authed(async (req, res) => res.json(await retryRefund(req.user, req.params.id))));

// ---------------------------------------------------------------- actions

router.post(
  "/actions/:id/:decision(approve|reject)",
  ...authed(async (req, res) => {
    await resolveAction(req.user, req.params.id, req.params.decision === "approve");
    res.json({ ok: true });
  })
);

// ---------------------------------------------------------------- payments

router.post(
  "/contributions/:id/checkout",
  ...authed(async (req, res) => {
    const { redirect, popup, save } = z.object({ redirect: z.string(), popup: z.boolean().optional(), save: z.boolean().optional() }).parse(req.body);
    res.json(await startCheckout(req.user, req.params.id, redirect, popup === true, save === true));
  })
);

// ---------------------------------------------------------------- claims

/** Report a problem with one of MY contributions. */
router.post(
  "/contributions/:id/claim",
  ...authed(async (req, res) => {
    const { kind, message } = z.object({ kind: z.string().max(30), message: z.string().max(1000).optional() }).parse(req.body);
    res.status(201).json(await openClaim(req.user, req.params.id, kind, message));
  })
);
/** My claims in this group; the organizer sees all of them. */
router.get("/groups/:id/claims", ...authed(async (req, res) => res.json(await listClaims(req.user, req.params.id))));
router.post("/claims/:id/refund", ...authed(async (req, res) => res.json(await refundClaim(req.user, req.params.id))));
router.post(
  "/claims/:id/reject",
  ...authed(async (req, res) => {
    const { note } = z.object({ note: z.string().max(1000) }).parse(req.body);
    res.json(await rejectClaim(req.user, req.params.id, note));
  })
);

/** Turn my automatic payment on or off in this group (on needs a PayPal method I saved while paying). */
router.post(
  "/groups/:id/autopay",
  ...authed(async (req, res) => {
    const { enabled } = z.object({ enabled: z.boolean() }).parse(req.body);
    res.json(await setAutoPay(req.user, req.params.id, enabled));
  })
);

/** Popup flow (JS SDK v6): the buyer approved in the popup, now capture. */
router.post(
  "/contributions/:id/capture",
  ...authed(async (req, res) => {
    const { orderId } = z.object({ orderId: z.string().min(5).max(64) }).parse(req.body);
    res.json(await captureForMember(req.user, req.params.id, orderId));
  })
);

/** What the web app needs to open PayPal in a popup. Mock mode has no real SDK: the app falls back to the redirect. */
router.get(
  "/paypal/sdk-config",
  ...authed(async (_req, res) => {
    if (config.mode === "mock") return res.json({ enabled: false });
    res.json({ enabled: true, sdkUrl: paypal.sdkUrl, clientId: paypal.publicClientId });
  })
);

/** PayPal sends the buyer back here after approving. We capture, then bounce to the app. */
router.get("/paypal/return", async (req, res) => {
  let redirect = config.appWebUrl;
  try {
    const state = readState(String(req.query.state ?? ""));
    redirect = state.redirect;
    const orderId = String(req.query.token ?? "");
    const c = await db.contribution.findUnique({ where: { id: state.cid } });
    if (!c || c.paypalOrderId !== orderId) throw new Error("order_mismatch");
    await completeContribution(orderId);
    res.redirect(appendQuery(redirect, { status: "paid" }));
  } catch (e) {
    console.error("paypal return failed", e);
    res.redirect(appendQuery(redirect, { status: "error" }));
  }
});

/** Backup path: PayPal webhooks keep us correct even if the app never comes back. */
router.post("/paypal/webhook", async (req, res) => {
  try {
    if (!(await paypal.verifyWebhook(req.headers, req.body))) return res.status(400).end();
    const event = req.body;
    // PayPal re-delivers events: handle each event id once (handlers are idempotent too).
    if (event.id) {
      const fresh = await db.webhookEvent
        .create({ data: { id: String(event.id), type: String(event.event_type ?? "") } })
        .then(() => true)
        .catch(() => false);
      if (!fresh) return res.json({ ok: true, duplicate: true });
    }
    try {
      await handleWebhook(event);
    } catch (e) {
      // Let PayPal retry: forget we saw it.
      if (event.id) await db.webhookEvent.delete({ where: { id: String(event.id) } }).catch(() => {});
      throw e;
    }
    res.json({ ok: true });
  } catch (e) {
    console.error("webhook failed", e);
    res.status(500).end();
  }
});

// ---------------------------------------------------------------- chat + notifications

async function assertMember(userId: string, groupId: string) {
  const m = await db.membership.findUnique({ where: { userId_groupId: { userId, groupId } } });
  if (!m) throw new HttpError(403, "not_a_member");
}

/** The latest messages; with ?after=<ISO date> only the newer ones (the app polls with it). */
router.get(
  "/groups/:id/chat",
  ...authed(async (req, res) => {
    const { after } = z.object({ after: z.string().datetime().optional() }).parse(req.query);
    res.json(await listMessages(req.user, req.params.id, after ? new Date(after) : undefined));
  })
);
/** Write to the group, or to the assistant (`toAssistant`, or an @ayni mention): that exchange is private. */
router.post(
  "/groups/:id/chat",
  ...authed(async (req, res) => {
    const { text, toAssistant } = z.object({ text: z.string().min(1).max(4000), toAssistant: z.boolean().optional() }).parse(req.body);
    res.json(await sendMessage(req.user, req.params.id, text, toAssistant === true));
  })
);
router.post(
  "/groups/:id/chat/read",
  ...authed(async (req, res) => {
    await assertMember(req.user.id, req.params.id);
    await markRead(req.user, req.params.id);
    res.json({ ok: true });
  })
);
/** Take back my own message, or (organizer) moderate someone else's. */
router.post(
  "/groups/:id/chat/:messageId/hide",
  ...authed(async (req, res) => {
    await hideMessage(req.user, req.params.id, req.params.messageId);
    res.json({ ok: true });
  })
);

router.get(
  "/notifications",
  ...authed(async (req, res) =>
    res.json(await db.notification.findMany({ where: { userId: req.user.id }, orderBy: { createdAt: "desc" }, take: 50 }))
  )
);
router.post(
  "/notifications/read",
  ...authed(async (req, res) => {
    await db.notification.updateMany({ where: { userId: req.user.id, read: false }, data: { read: true } });
    res.json({ ok: true });
  })
);
