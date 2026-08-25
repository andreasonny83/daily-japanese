export const LEVEL_ORDER = [
  "vocab-basics",
  "n5",
  "n4",
  "n3",
  "n2",
  "n1",
] as const;

export type LevelId = (typeof LEVEL_ORDER)[number];

export type CardType = "vocab" | "sentence";

export type PracticeMode = "auto" | "level" | "weak" | "review";

export interface Card {
  id: string;
  levelId: LevelId;
  type: CardType;
  category: string | null;
  grammarPoint: string | null;
  kanji: string;
  kana: string;
  romaji: string;
  english: string;
}

export interface CardWithProgress extends Card {
  intervalDays: number;
  repetitions: number;
  isReview: boolean;
  accuracy: number | null;
}

export interface ProgressResult {
  easeFactor: number;
  intervalDays: number;
  repetitions: number;
  nextReviewAt: string;
  reviews: number;
  leveledUp: boolean;
  newLevelId: LevelId | null;
  newCardsToday: number;
  newCardsCap: number;
}

export interface LevelSummary {
  id: LevelId;
  order: number;
  name: string;
  description: string;
  unlocked: boolean;
  totalCards: number;
  masteredCards: number;
  avgIntervalDays: number;
}

export interface WeakCard extends Card {
  easeFactor: number;
  intervalDays: number;
  reviews: number;
  accuracy: number | null;
}
