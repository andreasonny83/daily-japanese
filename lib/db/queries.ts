import { and, eq, inArray } from "drizzle-orm";

import {
  type CardType,
  type CardWithProgress,
  LEVEL_ORDER,
  type LevelId,
  type LevelSummary,
  type PracticeMode,
  type ProgressResult,
  type WeakCard,
} from "@/types";

import { db } from "./index";
import { cards, levels, progress, userLevelState } from "./schema";
import {
  applySm2Update,
  computeAccuracy,
  DEFAULT_EASE_FACTOR,
  PASSING_QUALITY,
  type Sm2State,
} from "../srs";

type CardRow = typeof cards.$inferSelect;
type ProgressRow = typeof progress.$inferSelect;

const MASTERY_INTERVAL_THRESHOLD = 21;
const NEW_CARDS_PER_DAY = 15;

function toCard(row: CardRow): {
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

function toCardWithProgress(
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

function isDue(p: ProgressRow | undefined, now: Date): boolean {
  return !!p?.nextReviewAt && p.nextReviewAt.getTime() <= now.getTime();
}

function isNew(p: ProgressRow | undefined): boolean {
  return !p || !p.nextReviewAt;
}

// Weak-card practice always surfaces the relatively weakest reviewed cards
// you have — it doesn't gate on an absolute ease/interval cutoff, so it
// never comes up empty just because nothing has crossed a fixed threshold.
function pickWeakestCard(
  reviewedCards: CardRow[],
  progressByCard: Map<string, ProgressRow>,
): CardRow | null {
  if (reviewedCards.length === 0) return null;
  const ranked = reviewedCards
    .map((card) => ({ card, easeFactor: progressByCard.get(card.id)!.easeFactor }))
    .sort((a, b) => a.easeFactor - b.easeFactor);
  const topSlice = ranked.slice(0, Math.min(5, ranked.length));
  return topSlice[Math.floor(Math.random() * topSlice.length)].card;
}

function pickRandom<T>(items: T[]): T | null {
  if (items.length === 0) return null;
  return items[Math.floor(Math.random() * items.length)];
}

// Among due cards, favor the most overdue, with light randomization among
// the top few so the same card doesn't dominate every "most overdue" tie.
function pickMostOverdueCard(
  dueCards: CardRow[],
  progressByCard: Map<string, ProgressRow>,
  now: Date,
): CardRow {
  const ranked = dueCards
    .map((card) => ({
      card,
      overdueMs: now.getTime() - progressByCard.get(card.id)!.nextReviewAt!.getTime(),
    }))
    .sort((a, b) => b.overdueMs - a.overdueMs);
  const topSlice = ranked.slice(0, Math.min(3, ranked.length));
  return topSlice[Math.floor(Math.random() * topSlice.length)].card;
}

function pickSoonestDueCard(
  reviewedCards: CardRow[],
  progressByCard: Map<string, ProgressRow>,
): CardRow {
  return reviewedCards.reduce((soonest, card) => {
    const a = progressByCard.get(card.id)!.nextReviewAt!;
    const b = progressByCard.get(soonest.id)!.nextReviewAt!;
    return a < b ? card : soonest;
  });
}

function countNewCardsToday(allProgress: ProgressRow[], now: Date): number {
  const todayKey = now.toISOString().slice(0, 10);
  return allProgress.filter(
    (p) =>
      p.reviews === 1 &&
      p.lastReviewed &&
      p.lastReviewed.toISOString().slice(0, 10) === todayKey,
  ).length;
}

// Picks the next card from a pool: due reviews first (most overdue), then a
// fresh new card if the daily cap allows, then (pull-ahead only) the
// soonest-due reviewed card or, failing that, a new card ignoring the cap.
function pickFromPool(
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
    const picked = pickRandom(pool.filter((c) => isNew(progressByCard.get(c.id))));
    if (picked) return toCardWithProgress(picked, progressByCard, false);
  }

  if (!opts.pullAhead) return null;

  const reviewedPool = pool.filter((c) => !!progressByCard.get(c.id)?.nextReviewAt);
  if (reviewedPool.length > 0) {
    const picked = pickSoonestDueCard(reviewedPool, progressByCard);
    return toCardWithProgress(picked, progressByCard, true);
  }

  if (opts.allowNewCards) {
    const picked = pickRandom(pool.filter((c) => isNew(progressByCard.get(c.id))));
    if (picked) return toCardWithProgress(picked, progressByCard, false);
  }

  return null;
}

function computeLevelMastery(
  levelCards: CardRow[],
  progressByCard: Map<string, ProgressRow>,
): { avgIntervalDays: number; mastered: boolean } {
  if (levelCards.length === 0) {
    return { avgIntervalDays: 0, mastered: false };
  }
  let intervalSum = 0;
  let allPastThreshold = true;
  for (const c of levelCards) {
    const p = progressByCard.get(c.id);
    const intervalDays = p?.intervalDays ?? 0;
    intervalSum += intervalDays;
    if (intervalDays < MASTERY_INTERVAL_THRESHOLD) allPastThreshold = false;
  }
  return {
    avgIntervalDays: intervalSum / levelCards.length,
    mastered: allPastThreshold,
  };
}

/**
 * Unlocks the entry level for a brand-new signed-in user. Safe to call
 * repeatedly, including concurrently (e.g. multiple API routes hit on
 * initial page load) thanks to the ON CONFLICT DO NOTHING upsert.
 */
export async function ensureEntryLevelUnlocked(userId: string): Promise<void> {
  const entryLevelId = LEVEL_ORDER[0];
  await db
    .insert(userLevelState)
    .values({ userId, levelId: entryLevelId })
    .onConflictDoNothing();
}

export async function getLevels(userId: string): Promise<LevelSummary[]> {
  await ensureEntryLevelUnlocked(userId);

  const [allLevels, unlockedRows, allCards, allProgress] = await Promise.all([
    db.select().from(levels).orderBy(levels.order),
    db.select().from(userLevelState).where(eq(userLevelState.userId, userId)),
    db.select().from(cards),
    db.select().from(progress).where(eq(progress.userId, userId)),
  ]);

  const unlockedIds = new Set(unlockedRows.map((r) => r.levelId));
  const progressByCard = new Map(allProgress.map((p) => [p.cardId, p]));

  return allLevels.map((lvl) => {
    const levelCards = allCards.filter((c) => c.levelId === lvl.id);
    const total = levelCards.length;
    let masteredCount = 0;
    let intervalSum = 0;
    for (const c of levelCards) {
      const p = progressByCard.get(c.id);
      const intervalDays = p?.intervalDays ?? 0;
      intervalSum += intervalDays;
      if (intervalDays >= MASTERY_INTERVAL_THRESHOLD) masteredCount++;
    }
    return {
      id: lvl.id as LevelId,
      order: lvl.order,
      name: lvl.name,
      description: lvl.description,
      unlocked: unlockedIds.has(lvl.id),
      totalCards: total,
      masteredCards: masteredCount,
      avgIntervalDays: total > 0 ? Number((intervalSum / total).toFixed(2)) : 0,
    };
  });
}

/**
 * Level list for guests (no session). All levels are freely browsable — no
 * unlock gating or mastery tracking applies since nothing is persisted for
 * an unauthenticated visitor.
 */
export async function getLevelsPublic(): Promise<LevelSummary[]> {
  const [allLevels, allCards] = await Promise.all([
    db.select().from(levels).orderBy(levels.order),
    db.select().from(cards),
  ]);

  return allLevels.map((lvl) => ({
    id: lvl.id as LevelId,
    order: lvl.order,
    name: lvl.name,
    description: lvl.description,
    unlocked: true,
    totalCards: allCards.filter((c) => c.levelId === lvl.id).length,
    masteredCards: 0,
    avgIntervalDays: 0,
  }));
}

/**
 * Uniform-random card pick for guests (no session, so no review history to
 * schedule by). Guests can browse any level but nothing is persisted.
 */
export async function getRandomCardForLevel(
  levelId: LevelId,
): Promise<CardWithProgress | null> {
  const levelCards = await db
    .select()
    .from(cards)
    .where(eq(cards.levelId, levelId));
  if (levelCards.length === 0) return null;
  const picked = levelCards[Math.floor(Math.random() * levelCards.length)];
  return {
    ...toCard(picked),
    intervalDays: 0,
    repetitions: 0,
    isReview: false,
    accuracy: null,
  };
}

export async function getNextCard(
  userId: string,
  mode: PracticeMode,
  levelId?: LevelId,
  pullAhead = false,
): Promise<CardWithProgress | null> {
  await ensureEntryLevelUnlocked(userId);

  const unlockedRows = await db
    .select()
    .from(userLevelState)
    .where(eq(userLevelState.userId, userId));
  const unlockedIds = unlockedRows.map((r) => r.levelId) as LevelId[];
  if (unlockedIds.length === 0) return null;

  const orderedUnlocked = LEVEL_ORDER.filter((id) => unlockedIds.includes(id));

  const allProgress = await db
    .select()
    .from(progress)
    .where(eq(progress.userId, userId));
  const progressByCard = new Map(allProgress.map((p) => [p.cardId, p]));

  const now = new Date();
  const newCardsToday = countNewCardsToday(allProgress, now);

  if (mode === "level" && levelId) {
    if (!unlockedIds.includes(levelId)) return null;
    const levelCards = await db
      .select()
      .from(cards)
      .where(eq(cards.levelId, levelId));
    return pickFromPool(levelCards, progressByCard, now, {
      pullAhead,
      allowNewCards: true,
      newCardsToday,
    });
  }

  if (mode === "weak") {
    const unlockedCards = await db
      .select()
      .from(cards)
      .where(inArray(cards.levelId, orderedUnlocked));
    // Only cards actually reviewed at least once — never-seen cards aren't
    // "weak", they're just new. Weak-card review is a deliberate drill, not
    // the spaced schedule: no due-date gate, no daily cap, always surfaces
    // whichever reviewed cards are relatively weakest right now.
    const reviewed = unlockedCards.filter((c) => {
      const p = progressByCard.get(c.id);
      return !!p && p.reviews > 0;
    });
    const picked = pickWeakestCard(reviewed, progressByCard);
    return picked ? toCardWithProgress(picked, progressByCard, true) : null;
  }

  // auto mode: due reviews take priority across every unlocked level; only
  // once nothing is due does a new card get introduced.
  const allUnlockedCards = await db
    .select()
    .from(cards)
    .where(inArray(cards.levelId, orderedUnlocked));
  return pickFromPool(allUnlockedCards, progressByCard, now, {
    pullAhead,
    allowNewCards: true,
    newCardsToday,
  });
}

export async function checkLevelProgression(
  userId: string,
  levelId: LevelId,
): Promise<{ leveledUp: boolean; newLevelId: LevelId | null }> {
  const idx = LEVEL_ORDER.indexOf(levelId);
  const nextLevelId =
    idx >= 0 && idx < LEVEL_ORDER.length - 1 ? LEVEL_ORDER[idx + 1] : null;
  if (!nextLevelId) return { leveledUp: false, newLevelId: null };

  const [levelCards, allProgress] = await Promise.all([
    db.select().from(cards).where(eq(cards.levelId, levelId)),
    db.select().from(progress).where(eq(progress.userId, userId)),
  ]);
  const progressByCard = new Map(allProgress.map((p) => [p.cardId, p]));

  const { mastered } = computeLevelMastery(levelCards, progressByCard);
  if (!mastered) return { leveledUp: false, newLevelId: null };

  // onConflictDoNothing + returning() lets us tell whether this call is the
  // one that actually unlocked the level, vs. a concurrent duplicate call.
  const inserted = await db
    .insert(userLevelState)
    .values({ userId, levelId: nextLevelId })
    .onConflictDoNothing()
    .returning();
  if (inserted.length === 0) return { leveledUp: false, newLevelId: null };

  return { leveledUp: true, newLevelId: nextLevelId };
}

export async function submitProgress(
  userId: string,
  cardId: string,
  score: number,
): Promise<ProgressResult> {
  const [card] = await db
    .select()
    .from(cards)
    .where(eq(cards.id, cardId))
    .limit(1);
  if (!card) throw new Error("Card not found");

  const [existing] = await db
    .select()
    .from(progress)
    .where(and(eq(progress.userId, userId), eq(progress.cardId, cardId)))
    .limit(1);

  const prevState: Sm2State = existing
    ? {
        easeFactor: existing.easeFactor,
        intervalDays: existing.intervalDays,
        repetitions: existing.repetitions,
      }
    : { easeFactor: DEFAULT_EASE_FACTOR, intervalDays: 0, repetitions: 0 };

  const now = new Date();
  const updated = applySm2Update(prevState, score, now);
  const newReviews = (existing?.reviews ?? 0) + 1;
  const newCorrectReviews =
    (existing?.correctReviews ?? 0) + (score >= PASSING_QUALITY ? 1 : 0);

  if (existing) {
    await db
      .update(progress)
      .set({
        easeFactor: updated.easeFactor,
        intervalDays: updated.intervalDays,
        repetitions: updated.repetitions,
        nextReviewAt: updated.nextReviewAt,
        reviews: newReviews,
        correctReviews: newCorrectReviews,
        lastReviewed: now,
      })
      .where(and(eq(progress.userId, userId), eq(progress.cardId, cardId)));
  } else {
    await db.insert(progress).values({
      userId,
      cardId,
      easeFactor: updated.easeFactor,
      intervalDays: updated.intervalDays,
      repetitions: updated.repetitions,
      nextReviewAt: updated.nextReviewAt,
      reviews: newReviews,
      correctReviews: newCorrectReviews,
      lastReviewed: now,
    });
  }

  const { leveledUp, newLevelId } = await checkLevelProgression(
    userId,
    card.levelId as LevelId,
  );

  const progressAfter = await db
    .select()
    .from(progress)
    .where(eq(progress.userId, userId));

  return {
    easeFactor: updated.easeFactor,
    intervalDays: updated.intervalDays,
    repetitions: updated.repetitions,
    nextReviewAt: updated.nextReviewAt.toISOString(),
    reviews: newReviews,
    leveledUp,
    newLevelId,
    newCardsToday: countNewCardsToday(progressAfter, now),
    newCardsCap: NEW_CARDS_PER_DAY,
  };
}

export async function getDailyNewCardProgress(
  userId: string,
): Promise<{ newCardsToday: number; newCardsCap: number }> {
  const allProgress = await db
    .select()
    .from(progress)
    .where(eq(progress.userId, userId));
  return {
    newCardsToday: countNewCardsToday(allProgress, new Date()),
    newCardsCap: NEW_CARDS_PER_DAY,
  };
}

export async function resetProgress(userId: string): Promise<void> {
  await db.delete(progress).where(eq(progress.userId, userId));
  await db.delete(userLevelState).where(eq(userLevelState.userId, userId));
  await ensureEntryLevelUnlocked(userId);
}

export async function getWeakCards(
  userId: string,
  limit = 20,
): Promise<WeakCard[]> {
  await ensureEntryLevelUnlocked(userId);

  const unlockedRows = await db
    .select()
    .from(userLevelState)
    .where(eq(userLevelState.userId, userId));
  const unlockedIds = unlockedRows.map((r) => r.levelId) as LevelId[];
  if (unlockedIds.length === 0) return [];

  const [unlockedCards, allProgress] = await Promise.all([
    db.select().from(cards).where(inArray(cards.levelId, unlockedIds)),
    db.select().from(progress).where(eq(progress.userId, userId)),
  ]);
  const cardsById = new Map(unlockedCards.map((c) => [c.id, c]));

  // Only cards the user has actually reviewed — ranked weakest-first below,
  // not filtered against an absolute threshold (see pickWeakestCard).
  return allProgress
    .filter((p) => p.reviews > 0 && cardsById.has(p.cardId))
    .map((p) => ({
      ...toCard(cardsById.get(p.cardId)!),
      easeFactor: p.easeFactor,
      intervalDays: p.intervalDays,
      reviews: p.reviews,
      accuracy: computeAccuracy(p.correctReviews, p.reviews),
    }))
    .sort((a, b) => a.easeFactor - b.easeFactor)
    .slice(0, limit);
}
