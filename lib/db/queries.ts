import { and, count, eq, gte, inArray, lt, sql } from "drizzle-orm";

import {
  type CardWithProgress,
  LEVEL_ORDER,
  type LevelId,
  type LevelSummary,
  type PracticeMode,
  type ProgressResult,
  type WeakCard,
} from "@/types";

import { utcDayRange } from "../date";
import {
  applySm2Update,
  computeAccuracy,
  computeReviewCredit,
  DEFAULT_EASE_FACTOR,
  type Sm2State,
} from "../srs";
import { computeStreakUpdate } from "../streak";
import {
  computeLevelMastery,
  excludeLastShown,
  isNew,
  NEW_CARDS_PER_DAY,
  pickFromPool,
  pickRandom,
  pickRequeuedCard,
  pickWeakestAnyCard,
  pickWeakestCard,
  toCard,
  toCardWithProgress,
} from "./cardSelection";
import { db } from "./index";
import { cards, levels, progress, userLevelState, userStreak } from "./schema";

export { excludeLastShown, pickRequeuedCard } from "./cardSelection";

const STRONG_ACCURACY_THRESHOLD = 80;

// firstReviewedAt is set once and never changes, so a requeued card being
// reviewed a second/third time today doesn't drop back out of the count
// (unlike reviews/lastReviewed, which mutate on every retry). "Today" is
// always the UTC calendar day (see lib/date.ts's utcDayRange) — the same
// boundary getNextAvailableAt uses for its cap-reset time, so the two can't
// disagree about when the count rolls over.
async function countNewCardsToday(userId: string, now: Date): Promise<number> {
  const { start, end } = utcDayRange(now);
  const [row] = await db
    .select({ value: count() })
    .from(progress)
    .where(
      and(
        eq(progress.userId, userId),
        gte(progress.firstReviewedAt, start),
        lt(progress.firstReviewedAt, end),
      ),
    );
  return row?.value ?? 0;
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
    const { avgIntervalDays, masteredCount } = computeLevelMastery(
      levelCards,
      progressByCard,
    );
    return {
      id: lvl.id as LevelId,
      order: lvl.order,
      name: lvl.name,
      description: lvl.description,
      unlocked: unlockedIds.has(lvl.id),
      totalCards: levelCards.length,
      masteredCards: masteredCount,
      avgIntervalDays: Number(avgIntervalDays.toFixed(2)),
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
  excludeCardId?: string,
): Promise<CardWithProgress | null> {
  const levelCards = await db
    .select()
    .from(cards)
    .where(eq(cards.levelId, levelId));
  if (levelCards.length === 0) return null;
  const pool = excludeLastShown(levelCards, excludeCardId);
  const picked = pool[Math.floor(Math.random() * pool.length)];
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
  requeueCardIds?: string[],
  excludeCardId?: string,
): Promise<CardWithProgress | null> {
  await ensureEntryLevelUnlocked(userId);

  const now = new Date();
  const [unlockedRows, allProgress, newCardsToday] = await Promise.all([
    db.select().from(userLevelState).where(eq(userLevelState.userId, userId)),
    db.select().from(progress).where(eq(progress.userId, userId)),
    countNewCardsToday(userId, now),
  ]);
  const unlockedIds = unlockedRows.map((r) => r.levelId) as LevelId[];
  if (unlockedIds.length === 0) return null;

  const orderedUnlocked = LEVEL_ORDER.filter((id) => unlockedIds.includes(id));
  const progressByCard = new Map(allProgress.map((p) => [p.cardId, p]));

  if (mode === "level" && levelId) {
    if (!unlockedIds.includes(levelId)) return null;
    const levelCards = await db
      .select()
      .from(cards)
      .where(eq(cards.levelId, levelId));
    const requeued = pickRequeuedCard(
      levelCards,
      requeueCardIds,
      excludeCardId,
    );
    if (requeued) return toCardWithProgress(requeued, progressByCard, true);

    if (levelId === "vocab-basics") {
      // Pure drill: pulls from the whole level regardless of nextReviewAt,
      // weighted toward the weakest cards (see submitProgress's isDrillMode,
      // which skips SM-2 progression for reviews picked this way).
      const picked = pickWeakestAnyCard(
        excludeLastShown(levelCards, excludeCardId),
        progressByCard,
      );
      if (!picked) return null;
      return toCardWithProgress(
        picked,
        progressByCard,
        !!progressByCard.get(picked.id),
      );
    }

    return pickFromPool(
      excludeLastShown(levelCards, excludeCardId),
      progressByCard,
      now,
      {
        pullAhead,
        allowNewCards: true,
        newCardsToday,
      },
    );
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
    const picked = pickWeakestCard(
      excludeLastShown(reviewed, excludeCardId),
      progressByCard,
    );
    return picked ? toCardWithProgress(picked, progressByCard, true) : null;
  }

  if (mode === "review") {
    const unlockedCards = await db
      .select()
      .from(cards)
      .where(inArray(cards.levelId, orderedUnlocked));
    // Any previously-studied card, not just the weakest ones — a broader
    // drill pool than "weak", still excluding never-seen (new) cards.
    const reviewed = unlockedCards.filter((c) => {
      const p = progressByCard.get(c.id);
      return !!p && p.reviews > 0;
    });
    const picked = pickRandom(excludeLastShown(reviewed, excludeCardId));
    return picked ? toCardWithProgress(picked, progressByCard, true) : null;
  }

  // auto mode: due reviews take priority across every unlocked level; only
  // once nothing is due does a new card get introduced.
  const allUnlockedCards = await db
    .select()
    .from(cards)
    .where(inArray(cards.levelId, orderedUnlocked));
  const requeued = pickRequeuedCard(
    allUnlockedCards,
    requeueCardIds,
    excludeCardId,
  );
  if (requeued) return toCardWithProgress(requeued, progressByCard, true);
  return pickFromPool(
    excludeLastShown(allUnlockedCards, excludeCardId),
    progressByCard,
    now,
    {
      pullAhead,
      allowNewCards: true,
      newCardsToday,
    },
  );
}

/**
 * When practice mode has nothing left to show (no due reviews, daily new-card
 * cap reached or no new cards left), returns the earliest time something
 * becomes available again — the soonest upcoming `nextReviewAt`, or tomorrow's
 * cap reset if new cards are still waiting behind today's cap. Null means
 * there's genuinely nothing left (e.g. everything mastered).
 */
export async function getNextAvailableAt(
  userId: string,
): Promise<string | null> {
  const unlockedRows = await db
    .select()
    .from(userLevelState)
    .where(eq(userLevelState.userId, userId));
  const unlockedIds = unlockedRows.map((r) => r.levelId) as LevelId[];
  if (unlockedIds.length === 0) return null;

  const [unlockedCards, allProgress] = await Promise.all([
    db.select().from(cards).where(inArray(cards.levelId, unlockedIds)),
    db.select().from(progress).where(eq(progress.userId, userId)),
  ]);
  const progressByCard = new Map(allProgress.map((p) => [p.cardId, p]));
  const now = new Date();

  let soonest: Date | null = null;
  for (const p of allProgress) {
    if (p.nextReviewAt && p.nextReviewAt.getTime() > now.getTime()) {
      if (!soonest || p.nextReviewAt < soonest) soonest = p.nextReviewAt;
    }
  }

  const newCardsToday = await countNewCardsToday(userId, now);
  const hasNewCardsRemaining = unlockedCards.some((c) =>
    isNew(progressByCard.get(c.id)),
  );
  if (newCardsToday >= NEW_CARDS_PER_DAY && hasNewCardsRemaining) {
    const { end: capReset } = utcDayRange(now);
    if (!soonest || capReset < soonest) soonest = capReset;
  }

  return soonest ? soonest.toISOString() : null;
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
  mode: PracticeMode = "auto",
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
  // Weak/review-mode reviews, and the vocab-basics level drill (see
  // pickWeakestCard/mode==="review"/levelId==="vocab-basics" above), are a
  // deliberate drill, not the spaced schedule — they shouldn't push the
  // real SM-2 schedule further out, otherwise repeatedly drilling the same
  // card in one sitting compounds the interval unrealistically.
  const isDrillMode =
    (mode === "weak" ||
      mode === "review" ||
      (mode === "level" && card.levelId === "vocab-basics")) &&
    !!existing;
  const updated = isDrillMode
    ? { ...prevState, nextReviewAt: existing!.nextReviewAt ?? now }
    : applySm2Update(prevState, score, now);
  const credit = computeReviewCredit(score);

  // Single atomic upsert (the neon-http driver doesn't support
  // db.transaction()): reviews/correctReviews are SQL-computed increments
  // relative to whatever row is actually on disk when this statement runs,
  // so two concurrent submissions for the same card can neither crash on a
  // duplicate insert nor lose one's increment. The SM-2 schedule fields
  // (easeFactor/intervalDays/repetitions/nextReviewAt) are still computed in
  // JS from the `existing` row read above, so a narrow race remains only for
  // those fields under truly concurrent double-submission of the same card
  // by the same user (e.g. multi-tab replay) — an accepted edge case, since
  // the UI already disables re-submit once a score is selected.
  const [saved] = await db
    .insert(progress)
    .values({
      userId,
      cardId,
      easeFactor: updated.easeFactor,
      intervalDays: updated.intervalDays,
      repetitions: updated.repetitions,
      nextReviewAt: updated.nextReviewAt,
      reviews: 1,
      correctReviews: credit,
      lastReviewed: now,
      firstReviewedAt: now,
    })
    .onConflictDoUpdate({
      target: [progress.userId, progress.cardId],
      set: {
        easeFactor: updated.easeFactor,
        intervalDays: updated.intervalDays,
        repetitions: updated.repetitions,
        nextReviewAt: updated.nextReviewAt,
        reviews: sql`${progress.reviews} + 1`,
        correctReviews: sql`${progress.correctReviews} + ${credit}`,
        lastReviewed: now,
      },
    })
    .returning();

  // Drill-mode reviews never touch intervalDays (see isDrillMode above), so
  // they can never change level mastery — skip the two extra queries.
  // Streak activity is recorded regardless of drill mode: any practice today
  // keeps the streak alive, per the streak's own "any activity counts" rule.
  const [{ leveledUp, newLevelId }, , newCardsToday] = await Promise.all([
    isDrillMode
      ? Promise.resolve({ leveledUp: false, newLevelId: null })
      : checkLevelProgression(userId, card.levelId as LevelId),
    recordStreakActivity(userId, now),
    countNewCardsToday(userId, now),
  ]);

  return {
    easeFactor: updated.easeFactor,
    intervalDays: updated.intervalDays,
    repetitions: updated.repetitions,
    nextReviewAt: updated.nextReviewAt.toISOString(),
    reviews: saved.reviews,
    leveledUp,
    newLevelId,
    newCardsToday,
    newCardsCap: NEW_CARDS_PER_DAY,
  };
}

// Same-day repeat calls are a no-op (computeStreakUpdate returns the
// existing state by reference), so this only writes to the DB on a
// genuine day boundary — not on every single card rating.
async function recordStreakActivity(userId: string, now: Date): Promise<void> {
  const [existing] = await db
    .select()
    .from(userStreak)
    .where(eq(userStreak.userId, userId))
    .limit(1);

  const existingState = existing
    ? {
        currentStreak: existing.currentStreak,
        longestStreak: existing.longestStreak,
        lastActiveDate: existing.lastActiveDate,
      }
    : null;
  const updated = computeStreakUpdate(existingState, now);
  if (updated === existingState) return;

  await db
    .insert(userStreak)
    .values({
      userId,
      currentStreak: updated.currentStreak,
      longestStreak: updated.longestStreak,
      lastActiveDate: updated.lastActiveDate,
    })
    .onConflictDoUpdate({
      target: userStreak.userId,
      set: {
        currentStreak: updated.currentStreak,
        longestStreak: updated.longestStreak,
        lastActiveDate: updated.lastActiveDate,
      },
    });
}

export async function getStreak(
  userId: string,
): Promise<{ currentStreak: number; longestStreak: number }> {
  const [row] = await db
    .select()
    .from(userStreak)
    .where(eq(userStreak.userId, userId))
    .limit(1);
  return {
    currentStreak: row?.currentStreak ?? 0,
    longestStreak: row?.longestStreak ?? 0,
  };
}

export async function getDailyNewCardProgress(
  userId: string,
): Promise<{ newCardsToday: number; newCardsCap: number }> {
  return {
    newCardsToday: await countNewCardsToday(userId, new Date()),
    newCardsCap: NEW_CARDS_PER_DAY,
  };
}

export async function resetProgress(userId: string): Promise<void> {
  await db.delete(progress).where(eq(progress.userId, userId));
  await db.delete(userLevelState).where(eq(userLevelState.userId, userId));
  await ensureEntryLevelUnlocked(userId);
}

// Only caller today (GET /api/levels, feeding the /progress weak-cards
// widget) always passes this explicitly — the default only matters if a
// future caller omits the argument, so it's kept equal to that call site
// rather than left at a different, effectively-dead value.
export const WEAK_CARDS_LIST_LIMIT = 10;

export async function getWeakCards(
  userId: string,
  limit = WEAK_CARDS_LIST_LIMIT,
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

  // Only cards the user has actually reviewed and hasn't already nailed —
  // strong-accuracy cards aren't "weak" even if their ease factor is still
  // relatively low. Otherwise unranked (see pickWeakestCard).
  return allProgress
    .filter(
      (p) =>
        p.reviews > 0 &&
        cardsById.has(p.cardId) &&
        (computeAccuracy(p.correctReviews, p.reviews) ?? 0) <
          STRONG_ACCURACY_THRESHOLD,
    )
    .map((p) => ({
      ...toCard(cardsById.get(p.cardId)!),
      easeFactor: p.easeFactor,
      intervalDays: p.intervalDays,
      reviews: p.reviews,
      accuracy: computeAccuracy(p.correctReviews, p.reviews),
    }))
    .sort((a, b) => (a.accuracy ?? 0) - (b.accuracy ?? 0))
    .slice(0, limit);
}
