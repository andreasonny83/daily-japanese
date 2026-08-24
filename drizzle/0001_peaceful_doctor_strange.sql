DROP INDEX IF EXISTS "progress_anon_card_unique";--> statement-breakpoint
DROP INDEX IF EXISTS "user_level_state_anon_level_unique";--> statement-breakpoint
ALTER TABLE "progress" DROP COLUMN IF EXISTS "anon_id";--> statement-breakpoint
ALTER TABLE "user_level_state" DROP COLUMN IF EXISTS "anon_id";