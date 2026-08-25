import {
  integer,
  pgTable,
  real,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const levels = pgTable("levels", {
  id: text("id").primaryKey(),
  order: integer("order").notNull(),
  name: text("name").notNull(),
  description: text("description").notNull(),
});

export const cards = pgTable("cards", {
  id: text("id").primaryKey(),
  levelId: text("level_id")
    .notNull()
    .references(() => levels.id),
  type: text("type").notNull(),
  category: text("category"),
  grammarPoint: text("grammar_point"),
  kanji: text("kanji").notNull(),
  kana: text("kana").notNull(),
  romaji: text("romaji").notNull(),
  english: text("english").notNull(),
});

export const progress = pgTable(
  "progress",
  {
    id: serial("id").primaryKey(),
    // References the Neon Auth (Managed Better Auth) user id. No DB-level FK
    // since user records live in Neon Auth's own store, not this schema.
    userId: text("user_id").notNull(),
    cardId: text("card_id")
      .notNull()
      .references(() => cards.id),
    reviews: integer("reviews").notNull().default(0),
    correctReviews: integer("correct_reviews").notNull().default(0),
    lastReviewed: timestamp("last_reviewed", { mode: "date" }),
    easeFactor: real("ease_factor").notNull().default(2.5),
    intervalDays: integer("interval_days").notNull().default(0),
    repetitions: integer("repetitions").notNull().default(0),
    nextReviewAt: timestamp("next_review_at", { mode: "date" }),
  },
  (t) => ({
    userCardUnique: uniqueIndex("progress_user_card_unique").on(
      t.userId,
      t.cardId,
    ),
  }),
);

export const userLevelState = pgTable(
  "user_level_state",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    levelId: text("level_id")
      .notNull()
      .references(() => levels.id),
    unlockedAt: timestamp("unlocked_at", { mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    userLevelUnique: uniqueIndex("user_level_state_user_level_unique").on(
      t.userId,
      t.levelId,
    ),
  }),
);
