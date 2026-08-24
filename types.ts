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

export type PracticeMode = "auto" | "level" | "weak";

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
  confidence: number;
  isReview: boolean;
}

export interface ProgressResult {
  confidence: number;
  reviews: number;
  leveledUp: boolean;
  newLevelId: LevelId | null;
}

export interface LevelSummary {
  id: LevelId;
  order: number;
  name: string;
  description: string;
  unlocked: boolean;
  totalCards: number;
  masteredCards: number;
  avgConfidence: number;
}

export interface WeakCard extends Card {
  confidence: number;
  reviews: number;
}
