/** UTC calendar-day boundaries for `now`, used as the single definition of "today" shared by daily-cap counting and cap-reset time so the two can't disagree. */
export function utcDayRange(now: Date): { start: Date; end: Date } {
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}
