import { utcDayRange } from "./date";

export interface StreakState {
  currentStreak: number;
  longestStreak: number;
  lastActiveDate: Date | null;
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Pure streak transition: same UTC day as last activity -> unchanged: the
 * caller can skip writing. Exactly one UTC day later -> streak continues.
 * Anything else (a gap, or no prior activity) -> streak restarts at 1.
 */
export function computeStreakUpdate(
  existing: StreakState | null,
  now: Date,
): StreakState {
  const { start: today } = utcDayRange(now);

  if (!existing || !existing.lastActiveDate) {
    return {
      currentStreak: 1,
      longestStreak: Math.max(1, existing?.longestStreak ?? 0),
      lastActiveDate: today,
    };
  }

  const { start: lastActiveDay } = utcDayRange(existing.lastActiveDate);
  if (lastActiveDay.getTime() === today.getTime()) {
    return existing;
  }

  const isConsecutiveDay =
    today.getTime() - lastActiveDay.getTime() === ONE_DAY_MS;
  const currentStreak = isConsecutiveDay ? existing.currentStreak + 1 : 1;

  return {
    currentStreak,
    longestStreak: Math.max(existing.longestStreak, currentStreak),
    lastActiveDate: today,
  };
}
