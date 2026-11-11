/**
 * Rules for moving turns around once a pasanaku is running. Pure, so every case is tested.
 *
 * What never changes: the date each round is due. Round 3 is always due on its date; a swap only
 * changes WHO receives that round (and therefore their guarantee).
 */

export type RoundStatus = "UPCOMING" | "COLLECTING" | "READY" | "PAID_OUT";

/**
 * Two members can swap turns only if neither round has started: a round that is collecting has people
 * paying toward a named recipient, and one that is ready or paid out has money committed or sent.
 */
export function swapProblem(a: { memberId: string; roundStatus: RoundStatus }, b: { memberId: string; roundStatus: RoundStatus }): null | "same_member" | "round_not_upcoming" {
  if (a.memberId === b.memberId) return "same_member";
  if (a.roundStatus !== "UPCOMING" || b.roundStatus !== "UPCOMING") return "round_not_upcoming";
  return null;
}

export type SwapCandidate = { membershipId: string; turn: number; riskScore: number; roundStatus: RoundStatus; lateNow: boolean };

/** A member this reliable (0 = safest, 100 = riskiest) may take an earlier turn. */
const MAX_RISK_FOR_EARLIER_TURN = 70;

/**
 * Someone is late and their own turn has not come yet: who should take their place?
 * The NEAREST later turn, so the rest of the schedule moves as little as possible, among members who
 * are up to date and reliable. Null when nobody qualifies (for example the late member has the last turn).
 */
export function pickSwapPartner(lateTurn: number, candidates: SwapCandidate[]): SwapCandidate | null {
  return (
    [...candidates]
      .sort((x, y) => x.turn - y.turn)
      .find((c) => c.turn > lateTurn && c.roundStatus === "UPCOMING" && !c.lateNow && c.riskScore <= MAX_RISK_FOR_EARLIER_TURN) ?? null
  );
}
