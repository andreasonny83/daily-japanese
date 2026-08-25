ALTER TABLE "progress" ADD COLUMN "first_reviewed_at" timestamp;--> statement-breakpoint
-- Backfill: for cards reviewed exactly once, that review was their first.
-- Rows with multiple reviews already predate today in practice, so leaving
-- first_reviewed_at null for them is safe (they just won't count toward
-- "new cards today" retroactively).
UPDATE "progress" SET "first_reviewed_at" = "last_reviewed" WHERE "reviews" = 1 AND "last_reviewed" IS NOT NULL;