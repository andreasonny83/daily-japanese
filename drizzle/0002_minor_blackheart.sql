ALTER TABLE "progress" ADD COLUMN "user_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "user_level_state" ADD COLUMN "user_id" text NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "progress_user_card_unique" ON "progress" USING btree ("user_id","card_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "user_level_state_user_level_unique" ON "user_level_state" USING btree ("user_id","level_id");