/**
 * The tools Ayni's MCP server offers to a member's own AI assistant. Read-only: every tool is a GET
 * on Ayni's API with the member's read-only key, so it sees exactly what the member sees in the app
 * (other members' private details stay masked by the API itself) and cannot change anything.
 *
 * Pure: each tool takes an `api(path)` function, so it is tested without a network.
 */
export type Api = (path: string) => Promise<any>;

const usd = (cents: number | null | undefined) => `$${((cents ?? 0) / 100).toFixed(2)}`;

export type Tool = {
  name: string;
  title: string;
  description: string;
  /** Names of the string arguments the tool needs. */
  args: Record<string, string>;
  run: (api: Api, args: Record<string, string>) => Promise<unknown>;
};

const safeId = (v: string) => {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(v)) throw new Error("invalid_id");
  return v;
};

export const TOOLS: Tool[] = [
  {
    name: "list_my_groups",
    title: "My savings circles",
    description: "Lists the savings circles (pasanakus) the member belongs to, with their id, state and contribution.",
    args: {},
    run: async (api) => {
      const groups: any[] = await api("/groups");
      return groups.map((g) => ({ id: g.id, name: g.name, status: g.status, contribution: usd(g.contributionCents), frequency: g.frequency, members: g._count?.memberships ?? null }));
    },
  },
  {
    name: "group_status",
    title: "Circle status",
    description: "Where one circle stands: current round, who receives the pot, how many have paid, and what the member owes. Use list_my_groups to get the group_id.",
    args: { group_id: "Id of the circle" },
    run: async (api, a) => {
      const g = await api(`/groups/${safeId(a.group_id)}`);
      const current = g.rounds?.find((r: any) => r.status === "COLLECTING" || r.status === "READY");
      const mine = current?.contributions?.find((c: any) => c.membershipId === g.myMembershipId);
      const nameOf = (membershipId: string) => g.memberships?.find((m: any) => m.id === membershipId)?.user?.name;
      const me = g.memberships?.find((m: any) => m.id === g.myMembershipId);
      return {
        name: g.name,
        status: g.status,
        contribution: usd(g.contributionCents),
        pot: usd(g.potCents),
        rounds: g.rounds?.length ?? 0,
        myTurn: me?.turn ?? null,
        currentRound: current && {
          number: current.number,
          dueAt: current.dueAt,
          receives: current.recipient?.user?.name,
          paid: current.contributions.filter((c: any) => c.status !== "PENDING").length,
          of: current.contributions.length,
          // names of who is missing: the app shows this to every member too
          pending: current.contributions.filter((c: any) => c.status === "PENDING").map((c: any) => nameOf(c.membershipId)),
        },
        myContribution: mine && { status: mine.status, amount: usd(mine.amountCents + mine.lateFeeCents) },
        myGuaranteeHeld: usd(me?.retentionHeldCents),
        automaticPayment: g.autoPay ?? false,
      };
    },
  },
  {
    name: "my_payments",
    title: "My payments",
    description: "What the member paid and received through PayPal across all their circles, newest first, with PayPal references.",
    args: {},
    run: async (api) => {
      const r = await api("/me/payments");
      return {
        paid: usd(r.totals?.paidCents),
        received: usd(r.totals?.receivedCents),
        guaranteeHeld: usd(r.guaranteeHeldCents),
        recent: (r.entries ?? []).slice(0, 20).map((e: any) => ({ at: e.at, circle: e.groupName, type: e.type, round: e.round, amount: usd(e.amountCents), status: e.status, paypalRef: e.ref })),
      };
    },
  },
  {
    name: "group_payments",
    title: "Circle payment history",
    description: "Every PayPal charge and payout of one circle with totals, as the member is allowed to see it.",
    args: { group_id: "Id of the circle" },
    run: async (api, a) => {
      const r = await api(`/groups/${safeId(a.group_id)}/ledger`);
      return {
        charged: usd(r.totals?.inCents),
        sent: usd(r.totals?.outCents),
        paypalFees: r.totals?.feesCents == null ? null : usd(r.totals.feesCents),
        guaranteeHeld: usd(r.guaranteeHeldCents),
        recent: (r.entries ?? []).slice(0, 25).map((e: any) => ({ at: e.at, type: e.type, member: e.memberName, round: e.round, amount: usd(e.amountCents), status: e.status, mine: e.mine })),
      };
    },
  },
  {
    name: "my_claims",
    title: "Claims in a circle",
    description: "The member's claims about their contributions in one circle (or all of them if they are the organizer), with state and PayPal dispute if any.",
    args: { group_id: "Id of the circle" },
    run: async (api, a) => {
      const r = await api(`/groups/${safeId(a.group_id)}/claims`);
      return (r.claims ?? []).map((c: any) => ({ status: c.status, kind: c.kind, round: c.round, amount: usd(c.amountCents), paypalDispute: c.paypalDisputeId, outcome: c.outcome, openedAt: c.createdAt }));
    },
  },
  {
    name: "my_calendar",
    title: "My money calendar",
    description:
      "What the member pays and receives, day by day, across all their circles: confirmed movements and estimates for the days to come. Use it to answer how much they will pay or receive on a date, or how much they will have by then.",
    args: {},
    run: async (api) => {
      const r = await api("/me/calendar");
      return {
        today: String(r.now).slice(0, 10),
        movements: (r.events ?? []).map((e: any) => ({
          date: String(e.at).slice(0, 10),
          circle: e.groupName,
          what: e.kind === "pay" ? "contribution" : e.kind === "receive" ? "pot received" : "guarantee returned",
          round: e.round,
          amount: (e.kind === "pay" ? "-" : "+") + usd(e.amountCents),
          status: e.status,
          estimated: e.estimated,
        })),
      };
    },
  },
  {
    name: "my_trust_profile",
    title: "My trust profile",
    description: "The member's trust profile: circles completed, on-time payments and late payments, built only from payment behaviour inside Ayni.",
    args: {},
    run: async (api) => {
      const p = await api("/me/profile");
      return { completed: p.completed, abandoned: p.abandoned, onTimePercent: p.onTimePct, late: p.late, streak: p.streak, paypalVerified: p.paypalVerified };
    },
  },
];
