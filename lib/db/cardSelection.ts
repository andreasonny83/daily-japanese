// Pure card-selection logic, deliberately free of any DB import — mirrors
// lib/srs.ts's "pure math, fully unit-testable" pattern so these functions
// can be tested (lib/db/queries.test.ts) without needing a live database or
// DATABASE_URL. Anything here that touches `db` belongs in queries.ts instead.
import { computeAccuracy, DEFAULT_EASE_FACTOR } from "../srs";
import type { CardType, CardWithProgress, LevelId } from "../../types";
import type { cards, progress } from "./schema";

export type CardRow = typeof cards.$inferSelect;
export type ProgressRow = typeof progress.$inferSelect;

export const MASTERY_INTERVAL_THRESHOLD = 21;
export const NEW_CARDS_PER_DAY = 15;
export const WEAK_PICK_POOL_SIZE = 5;
export const OVERDUE_PICK_POOL_SIZE = 3;

export function toCard(row: CardRow): {
  id: string;
  levelId: LevelId;
  type: CardType;
  category: string | null;
  grammarPoint: string | null;
  kanji: string;
  kana: string;
  romaji: string;
  english: string;
} {
  return {
    id: row.id,
    levelId: row.levelId as LevelId,
    type: row.type as CardType,
    category: row.category,
    grammarPoint: row.grammarPoint,
    kanji: row.kanji,
    kana: row.kana,
    romaji: row.romaji,
    english: row.english,
  };
}

export function toCardWithProgress(
  card: CardRow,
  progressByCard: Map<string, ProgressRow>,
  isReview: boolean,
): CardWithProgress {
  const p = progressByCard.get(card.id);
  return {
    ...toCard(card),
    intervalDays: p?.intervalDays ?? 0,
    repetitions: p?.repetitions ?? 0,
    isReview,
    accuracy: computeAccuracy(p?.correctReviews ?? 0, p?.reviews ?? 0),
  };
}

export function isDue(p: ProgressRow | undefined, now: Date): boolean {
  return !!p?.nextReviewAt && p.nextReviewAt.getTime() <= now.getTime();
}

export function isNew(p: ProgressRow | undefined): boolean {
  return !p || !p.nextReviewAt;
}

// Weak-card practice always surfaces the relatively weakest reviewed cards
// you have — it doesn't gate on an absolute ease/interval cutoff, so it
// never comes up empty just because nothing has crossed a fixed threshold.
export function pickWeakestCard(
  reviewedCards: CardRow[],
  progressByCard: Map<string, ProgressRow>,
): CardRow | null {
  if (reviewedCards.length === 0) return null;
  const ranked = reviewedCards
    .map((card) => ({
      card,
      easeFactor: progressByCard.get(card.id)!.easeFactor,
    }))
    .sort((a, b) => a.easeFactor - b.easeFactor);
  const topSlice = ranked.slice(
    0,
    Math.min(WEAK_PICK_POOL_SIZE, ranked.length),
  );
  return topSlice[Math.floor(Math.random() * topSlice.length)].card;
}

// Like pickWeakestCard, but for a pool that isn't pre-filtered to reviewed
// cards only — never-reviewed cards get the default ease factor, so they
// compete on equal footing with genuinely weak (low-ease) reviewed cards
// rather than being excluded outright.
export function pickWeakestAnyCard(
  pool: CardRow[],
  progressByCard: Map<string, ProgressRow>,
): CardRow | null {
  if (pool.length === 0) return null;
  const ranked = pool
    .map((card) => ({
      card,
      easeFactor:
        progressByCard.get(card.id)?.easeFactor ?? DEFAULT_EASE_FACTOR,
    }))
    .sort((a, b) => a.easeFactor - b.easeFactor);
  const topSlice = ranked.slice(
    0,
    Math.min(WEAK_PICK_POOL_SIZE, ranked.length),
  );
  return topSlice[Math.floor(Math.random() * topSlice.length)].card;
}

export function pickRandom<T>(items: T[]): T | null {
  if (items.length === 0) return null;
  return items[Math.floor(Math.random() * items.length)];
}

// Filters out the just-shown card so the same one never repeats back-to-back
// — unless it's the only candidate left, in which case showing it again is
// the only option.
export function excludeLastShown(
  pool: CardRow[],
  excludeCardId: string | undefined,
): CardRow[] {
  if (!excludeCardId) return pool;
  const filtered = pool.filter((c) => c.id !== excludeCardId);
  return filtered.length > 0 ? filtered : pool;
}

// Forces a same-session retry card back into rotation ahead of the normal
// due/new pool logic — see app/page.tsx's pendingRequeueRef for how the
// client decides which ids to send and when. excludeCardId is filtered out
// too, so the card just shown can't be immediately re-picked as its own
// requeue candidate (the "no back-to-back repeat" guarantee applies here
// same as it does to normal pool selection).
export function pickRequeuedCard(
  pool: CardRow[],
  requeueCardIds: string[] | undefined,
  excludeCardId?: string,
): CardRow | null {
  if (!requeueCardIds || requeueCardIds.length === 0) return null;
  const candidates = pool.filter(
    (c) => requeueCardIds.includes(c.id) && c.id !== excludeCardId,
  );
  return pickRandom(candidates);
}

// Among due cards, favor the most overdue, with light randomization among
// the top few so the same card doesn't dominate every "most overdue" tie.
export function pickMostOverdueCard(
  dueCards: CardRow[],
  progressByCard: Map<string, ProgressRow>,
  now: Date,
): CardRow {
  const ranked = dueCards
    .map((card) => ({
      card,
      overdueMs:
        now.getTime() - progressByCard.get(card.id)!.nextReviewAt!.getTime(),
    }))
    .sort((a, b) => b.overdueMs - a.overdueMs);
  const topSlice = ranked.slice(
    0,
    Math.min(OVERDUE_PICK_POOL_SIZE, ranked.length),
  );
  return topSlice[Math.floor(Math.random() * topSlice.length)].card;
}

export function pickSoonestDueCard(
  reviewedCards: CardRow[],
  progressByCard: Map<string, ProgressRow>,
): CardRow {
  return reviewedCards.reduce((soonest, card) => {
    const a = progressByCard.get(card.id)!.nextReviewAt!;
    const b = progressByCard.get(soonest.id)!.nextReviewAt!;
    return a < b ? card : soonest;
  });
}

// Picks the next card from a pool: due reviews first (most overdue), then a
// fresh new card if the daily cap allows, then (pull-ahead only) the
// soonest-due reviewed card or, failing that, a new card ignoring the cap.
export function pickFromPool(
  pool: CardRow[],
  progressByCard: Map<string, ProgressRow>,
  now: Date,
  opts: { pullAhead: boolean; allowNewCards: boolean; newCardsToday: number },
): CardWithProgress | null {
  const duePool = pool.filter((c) => isDue(progressByCard.get(c.id), now));
  if (duePool.length > 0) {
    const picked = pickMostOverdueCard(duePool, progressByCard, now);
    return toCardWithProgress(picked, progressByCard, true);
  }

  if (opts.allowNewCards && opts.newCardsToday < NEW_CARDS_PER_DAY) {
    const picked = pickRandom(
      pool.filter((c) => isNew(progressByCard.get(c.id))),
    );
    if (picked) return toCardWithProgress(picked, progressByCard, false);
  }

  if (!opts.pullAhead) return null;

  const reviewedPool = pool.filter(
    (c) => !!progressByCard.get(c.id)?.nextReviewAt,
  );
  if (reviewedPool.length > 0) {
    const picked = pickSoonestDueCard(reviewedPool, progressByCard);
    return toCardWithProgress(picked, progressByCard, true);
  }

  if (opts.allowNewCards) {
    const picked = pickRandom(
      pool.filter((c) => isNew(progressByCard.get(c.id))),
    );
    if (picked) return toCardWithProgress(picked, progressByCard, false);
  }

  return null;
}

export function computeLevelMastery(
  levelCards: CardRow[],
  progressByCard: Map<string, ProgressRow>,
): { avgIntervalDays: number; masteredCount: number; mastered: boolean } {
  if (levelCards.length === 0) {
    return { avgIntervalDays: 0, masteredCount: 0, mastered: false };
  }
  let intervalSum = 0;
  let masteredCount = 0;
  for (const c of levelCards) {
    const p = progressByCard.get(c.id);
    const intervalDays = p?.intervalDays ?? 0;
    intervalSum += intervalDays;
    if (intervalDays >= MASTERY_INTERVAL_THRESHOLD) masteredCount++;
  }
  return {
    avgIntervalDays: intervalSum / levelCards.length,
    masteredCount,
    mastered: masteredCount === levelCards.length,
  };
}
