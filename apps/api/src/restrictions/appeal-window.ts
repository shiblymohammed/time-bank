export const APPEAL_WINDOW_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

/** The last moment an appeal can be made, counted from the decision. */
export function appealDeadline(decidedAt: Date | null | undefined): Date | null {
  return decidedAt ? new Date(new Date(decidedAt).getTime() + APPEAL_WINDOW_DAYS * DAY_MS) : null;
}
