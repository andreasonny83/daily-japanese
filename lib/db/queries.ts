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

type CardRow = typeof cards.$inferSelect;
type ProgressRow = typeof progress.$inferSelect;

const MASTERY_CONFIDENCE_THRESHOLD = 4;
const MASTERY_MIN_REVIEWS = 2;
const WEAK_CONFIDENCE_THRESHOLD = 2;
const REVIEW_POOL_CHANCE = 0.2;

const SCORE_DELTAS: Record<number, number> = {
  0: -2,
  1: -1,
  2: -0.5,
  3: 0.5,
  4: 1,
  5: 1.5,
};

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

function computeWeight(confidence: number, lastReviewed: Date | null): number {
  let weight = Math.pow(5 - confidence, 2) + 1;
  if (lastReviewed) {
    const daysSince =
      (Date.now() - lastReviewed.getTime()) / (1000 * 60 * 60 * 24);
    weight += daysSince * 0.5;
  }
  return weight;
}

function weightedPick<T>(items: T[], weightFn: (item: T) => number): T | null {
  if (items.length === 0) return null;
  const weighted = items.map((item) => ({
    item,
    weight: Math.max(weightFn(item), 0.01),
  }));
  const totalWeight = weighted.reduce((sum, w) => sum + w.weight, 0);
  let random = Math.random() * totalWeight;
  for (const w of weighted) {
    random -= w.weight;
    if (random <= 0) return w.item;
  }
  return weighted[weighted.length - 1].item;
}

function pickWeightedCard(
  levelCards: CardRow[],
  progressByCard: Map<string, ProgressRow>,
  isReview: boolean,
): CardWithProgress | null {
  const picked = weightedPick(levelCards, (c) => {
    const p = progressByCard.get(c.id);
    return computeWeight(p?.confidence ?? 0, p?.lastReviewed ?? null);
  });
  if (!picked) return null;
  const p = progressByCard.get(picked.id);
  return {
    ...toCard(picked),
    confidence: p?.confidence ?? 0,
    isReview,
  };
}

function computeLevelMastery(
  levelCards: CardRow[],
  progressByCard: Map<string, ProgressRow>,
): { avgConfidence: number; minReviews: number; mastered: boolean } {
  if (levelCards.length === 0) {
    return { avgConfidence: 0, minReviews: 0, mastered: false };
  }
  let confSum = 0;
  let minReviews = Infinity;
  for (const c of levelCards) {
    const p = progressByCard.get(c.id);
    confSum += p?.confidence ?? 0;
    minReviews = Math.min(minReviews, p?.reviews ?? 0);
  }
  const avgConfidence = confSum / levelCards.length;
  return {
    avgConfidence,
    minReviews,
    mastered:
      avgConfidence >= MASTERY_CONFIDENCE_THRESHOLD &&
      minReviews >= MASTERY_MIN_REVIEWS,
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
    let confSum = 0;
    for (const c of levelCards) {
      const p = progressByCard.get(c.id);
      const conf = p?.confidence ?? 0;
      confSum += conf;
      if (
        conf >= MASTERY_CONFIDENCE_THRESHOLD &&
        (p?.reviews ?? 0) >= MASTERY_MIN_REVIEWS
      ) {
        masteredCount++;
      }
    }
    return {
      id: lvl.id as LevelId,
      order: lvl.order,
      name: lvl.name,
      description: lvl.description,
      unlocked: unlockedIds.has(lvl.id),
      totalCards: total,
      masteredCards: masteredCount,
      avgConfidence: total > 0 ? Number((confSum / total).toFixed(2)) : 0,
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
    avgConfidence: 0,
  }));
}

/**
 * Uniform-random card pick for guests (no session, so no confidence data to
 * weight by). Guests can browse any level but nothing is persisted.
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
  return { ...toCard(picked), confidence: 0, isReview: false };
}

export async function getNextCard(
  userId: string,
  mode: PracticeMode,
  levelId?: LevelId,
): Promise<CardWithProgress | null> {
  await ensureEntryLevelUnlocked(userId);

  const unlockedRows = await db
    .select()
    .from(userLevelState)
    .where(eq(userLevelState.userId, userId));
  const unlockedIds = unlockedRows.map((r) => r.levelId) as LevelId[];
  if (unlockedIds.length === 0) return null;

  const orderedUnlocked = LEVEL_ORDER.filter((id) => unlockedIds.includes(id));
  const currentLevelId = orderedUnlocked[orderedUnlocked.length - 1];

  const allProgress = await db
    .select()
    .from(progress)
    .where(eq(progress.userId, userId));
  const progressByCard = new Map(allProgress.map((p) => [p.cardId, p]));

  if (mode === "level" && levelId) {
    if (!unlockedIds.includes(levelId)) return null;
    const levelCards = await db
      .select()
      .from(cards)
      .where(eq(cards.levelId, levelId));
    return pickWeightedCard(
      levelCards,
      progressByCard,
      levelId !== currentLevelId,
    );
  }

  if (mode === "weak") {
    const unlockedCards = await db
      .select()
      .from(cards)
      .where(inArray(cards.levelId, orderedUnlocked));
    // Only cards actually reviewed at least once — otherwise never-seen
    // cards (confidence defaults to 0) would flood in as "weak".
    const weak = unlockedCards.filter((c) => {
      const p = progressByCard.get(c.id);
      return !!p && p.reviews > 0 && p.confidence < WEAK_CONFIDENCE_THRESHOLD;
    });
    return pickWeightedCard(weak, progressByCard, true);
  }

  // auto mode
  const currentLevelCards = await db
    .select()
    .from(cards)
    .where(eq(cards.levelId, currentLevelId));
  const otherLevelIds = orderedUnlocked.filter((id) => id !== currentLevelId);
  const otherCards =
    otherLevelIds.length > 0
      ? await db
          .select()
          .from(cards)
          .where(inArray(cards.levelId, otherLevelIds))
      : [];

  const { mastered: currentMastered } = computeLevelMastery(
    currentLevelCards,
    progressByCard,
  );
  const useReviewPool =
    otherCards.length > 0 &&
    (currentMastered || Math.random() < REVIEW_POOL_CHANCE);

  if (useReviewPool) {
    return pickWeightedCard(otherCards, progressByCard, true);
  }
  return pickWeightedCard(currentLevelCards, progressByCard, false);
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

  const delta = SCORE_DELTAS[score] ?? 0;
  const currentConfidence = existing?.confidence ?? 0;
  const newConfidence = Math.min(
    5,
    Math.max(0, Number((currentConfidence + delta).toFixed(2))),
  );
  const newReviews = (existing?.reviews ?? 0) + 1;

  if (existing) {
    await db
      .update(progress)
      .set({
        confidence: newConfidence,
        reviews: newReviews,
        lastReviewed: new Date(),
      })
      .where(and(eq(progress.userId, userId), eq(progress.cardId, cardId)));
  } else {
    await db.insert(progress).values({
      userId,
      cardId,
      confidence: newConfidence,
      reviews: newReviews,
      lastReviewed: new Date(),
    });
  }

  const { leveledUp, newLevelId } = await checkLevelProgression(
    userId,
    card.levelId as LevelId,
  );

  return {
    confidence: newConfidence,
    reviews: newReviews,
    leveledUp,
    newLevelId,
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
  const progressByCard = new Map(allProgress.map((p) => [p.cardId, p]));
  const cardsById = new Map(unlockedCards.map((c) => [c.id, c]));

  // Only cards the user has actually reviewed — otherwise every never-seen
  // card ties at confidence 0 and "weakest" is meaningless noise.
  return allProgress
    .filter((p) => p.reviews > 0 && cardsById.has(p.cardId))
    .map((p) => ({
      ...toCard(cardsById.get(p.cardId)!),
      confidence: p.confidence,
      reviews: p.reviews,
    }))
    .sort((a, b) => a.confidence - b.confidence)
    .slice(0, limit);
}
