/** How one member's contribution to one round looks in the payment calendar, for the person who is looking. */
export type CellStatus = "PENDING" | "PAID" | "COVERED" | "DEFAULTED" | "CLOSED";
export type CellState = "paid" | "covered" | "pending" | "late" | "upcoming" | "closed";

/**
 * The server already hides what the viewer may not see (someone else's covered or unpaid contribution arrives as
 * "paid" or "closed"). "Late" is the one thing decided here, and it is shown only to the person and the organizer:
 * for everyone else an overdue contribution is just "pending".
 */
export function cellState(
  cell: { membershipId: string; status: CellStatus },
  round: { status: string; dueAt: string },
  viewer: { isOrganizer: boolean; myMembershipId: string },
  now: number
): CellState {
  if (cell.status === "PAID") return "paid";
  if (cell.status === "COVERED") return "covered";
  if (cell.status === "DEFAULTED" || cell.status === "CLOSED") return "closed";
  if (round.status === "UPCOMING") return "upcoming";
  const overdue = new Date(round.dueAt).getTime() < now;
  if (overdue && (viewer.isOrganizer || cell.membershipId === viewer.myMembershipId)) return "late";
  return "pending";
}
