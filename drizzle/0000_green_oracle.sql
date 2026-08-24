CREATE TABLE IF NOT EXISTS "cards" (
	"id" text PRIMARY KEY NOT NULL,
	"level_id" text NOT NULL,
	"type" text NOT NULL,
	"category" text,
	"grammar_point" text,
	"kanji" text NOT NULL,
	"kana" text NOT NULL,
	"romaji" text NOT NULL,
	"english" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "levels" (
	"id" text PRIMARY KEY NOT NULL,
	"order" integer NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "progress" (
	"id" serial PRIMARY KEY NOT NULL,
	"anon_id" text NOT NULL,
	"card_id" text NOT NULL,
	"confidence" real DEFAULT 0 NOT NULL,
	"reviews" integer DEFAULT 0 NOT NULL,
	"last_reviewed" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_level_state" (
	"id" serial PRIMARY KEY NOT NULL,
	"anon_id" text NOT NULL,
	"level_id" text NOT NULL,
	"unlocked_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cards" ADD CONSTRAINT "cards_level_id_levels_id_fk" FOREIGN KEY ("level_id") REFERENCES "public"."levels"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "progress" ADD CONSTRAINT "progress_card_id_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_level_state" ADD CONSTRAINT "user_level_state_level_id_levels_id_fk" FOREIGN KEY ("level_id") REFERENCES "public"."levels"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "progress_anon_card_unique" ON "progress" USING btree ("anon_id","card_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "user_level_state_anon_level_unique" ON "user_level_state" USING btree ("anon_id","level_id");