const HOUR = 3600_000;

/** Time windows for reminders, grace and organizer approval. Demo mode shrinks them to minutes. */
export function windows(group: { demoMode: boolean; demoRoundMinutes: number; graceHours: number; approvalTimeoutHours: number }) {
  if (group.demoMode) {
    const round = group.demoRoundMinutes * 60_000;
    return { grace: round / 2, lead: round / 2, approval: 60_000 };
  }
  return { grace: group.graceHours * HOUR, lead: 24 * HOUR, approval: group.approvalTimeoutHours * HOUR };
}
