export const DEFAULT_EASE_FACTOR = 2.5;
export const MIN_EASE_FACTOR = 1.3;
export const LEARNING_STEP_MINUTES = 10;

export interface Sm2State {
  easeFactor: number;
  intervalDays: number;
  repetitions: number;
}

export interface Sm2Result extends Sm2State {
  nextReviewAt: Date;
}

/** SM-2 spaced-repetition update. `quality` is 0-5 (matches the app's rating scale). */
export function applySm2Update(
  prev: Sm2State,
  quality: number,
  now: Date,
): Sm2Result {
  const neverGraduated = prev.repetitions === 0 && prev.intervalDays === 0;

  if (quality < 3 && neverGraduated) {
    // Still in the initial learning phase: resurface soon, same session,
    // without touching ease — Anki doesn't adjust ease during learning.
    const nextReviewAt = new Date(
      now.getTime() + LEARNING_STEP_MINUTES * 60 * 1000,
    );
    return {
      easeFactor: prev.easeFactor,
      intervalDays: 0,
      repetitions: 0,
      nextReviewAt,
    };
  }

  const easeDelta = 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02);
  const easeFactor = Math.max(MIN_EASE_FACTOR, prev.easeFactor + easeDelta);

  let repetitions: number;
  let intervalDays: number;

  if (quality < 3) {
    repetitions = 0;
    intervalDays = 1;
  } else {
    repetitions = prev.repetitions + 1;
    if (repetitions === 1) {
      intervalDays = 1;
    } else if (repetitions === 2) {
      intervalDays = 6;
    } else {
      intervalDays = Math.round(prev.intervalDays * easeFactor);
    }
  }

  const nextReviewAt = new Date(
    now.getTime() + intervalDays * 24 * 60 * 60 * 1000,
  );

  return { easeFactor, intervalDays, repetitions, nextReviewAt };
}

/** Quality threshold (matches SM-2's pass/fail split) above which a review counts as correct. */
export const PASSING_QUALITY = 3;

/** Partial credit given to a "Familiar" (quality 2) rating toward accuracy. */
export const FAMILIAR_CREDIT = 0.5;

/** How much a rating counts toward accuracy: full credit at/above PASSING_QUALITY, half credit for "Familiar" (2), none below that. */
export function computeReviewCredit(quality: number): number {
  if (quality >= PASSING_QUALITY) return 1;
  if (quality === 2) return FAMILIAR_CREDIT;
  return 0;
}

/** Percentage of accumulated review credit out of total reviews, rounded to the nearest whole percent. */
export function computeAccuracy(
  correctReviews: number,
  reviews: number,
): number | null {
  if (reviews === 0) return null;
  return Math.round((correctReviews / reviews) * 100);
}
