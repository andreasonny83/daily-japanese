# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev              # Next.js dev server
npm run build            # production build (also the fastest full typecheck)
npm run lint             # eslint
npm test                 # vitest run (one-shot)
npx vitest run lib/srs.test.ts -t "second consecutive"   # single file / single test
npm run format           # prettier --write .

npm run db:generate      # drizzle-kit generate — new migration from lib/db/schema.ts
npm run db:migrate       # apply migrations to DATABASE_URL
npm run db:seed          # upsert levels + all lib/data/*.ts cards (idempotent)
```

There is no separate `typecheck` script — `npm run build` is the typecheck.

Requires `.env.local` (see `.env.local.example`): `DATABASE_URL` (Neon Postgres), `NEON_AUTH_BASE_URL`, `NEON_AUTH_COOKIE_SECRET`. `lib/db/index.ts` and `lib/auth/server.ts` throw at import time if these are missing, so _any_ module touching them fails fast without env.

## Stack

Next.js 16 App Router + React 19 · Neon serverless Postgres via Drizzle (`drizzle-orm/neon-http`) · Neon Auth (Managed Better Auth) · Tailwind. Path alias `@/*` maps to repo root.

## Architecture

Flashcard app: shows English, user reveals the Japanese, then self-rates 0–5. Ratings drive an SM-2 spaced-repetition schedule and level unlocking.

### The three layers that matter

1. **`lib/srs.ts`** — pure SM-2 math, no DB, no I/O. The only unit-tested module (`lib/srs.test.ts`). Change scheduling behavior here, not in queries.
2. **`lib/db/queries.ts`** — all persistence + card-selection policy. Every API route is a thin auth-check wrapper over one function here. This is the file to read first.
3. **`app/page.tsx`** — the practice loop and the only place with _session-scoped_ (non-persisted) state.

### Auth split: signed-in vs guest

Every read path forks on `getCurrentUserId()` (`lib/auth/session.ts`, returns `null` for guests):

- **Guest** → `getLevelsPublic()` / `getRandomCardForLevel()`. All levels browsable, uniform-random cards, nothing persisted. `POST /api/progress` 401s.
- **Signed in** → `getLevels()` / `getNextCard()`. Unlock gating, SM-2 scheduling, daily caps.

Auth is entirely delegated: `app/api/auth/[...path]/route.ts` is `auth.handler()`, and `app/auth/[path]/page.tsx` renders `<AuthView>` from `@neondatabase/auth-ui`. User records live in **Neon Auth's own store**, so `progress.userId` / `userLevelState.userId` have **no DB-level FK** — don't add one.

### Practice modes (`PracticeMode` in `types.ts`)

`getNextCard(userId, mode, levelId?, pullAhead?, requeueCardIds?)` branches per mode:

- `auto` — due reviews across all unlocked levels first; only when nothing is due does a new card appear, capped by `NEW_CARDS_PER_DAY` (15).
- `level` — same policy, restricted to one unlocked level.
- `weak` / `review` — **drill modes**. No due-date gate, no daily cap, only cards with `reviews > 0`. Critically, `submitProgress` detects these (`isDrillMode`) and **skips the SM-2 update entirely** — drilling a card ten times in one sitting must not compound its real interval.

`pullAhead` is the "Review early anyway" escape hatch: when nothing is due, fall back to the soonest-due card. Once used, `app/page.tsx` keeps `pullAheadActive` true for the rest of the session.

### Session-scoped retry lives on the client

When a _brand-new_ card (`isReview === false`) is failed on first attempt, `app/page.tsx` records it in `pendingRequeueRef` (cardId → 2 more appearances) and sends those ids as `?requeueIds=` on subsequent fetches. `pickRequeuedCard` in queries.ts forces them ahead of normal pool logic. `requeueGapRef` enforces at least one intervening card so repeats aren't back-to-back. **None of this is persisted** — it dies with the page.

### Scoring and accuracy

Rating scale 0–5 maps to SM-2 quality directly (`FeedbackButtons`: Clueless…Mastered). `PASSING_QUALITY = 3`. A "Familiar" (2) earns `FAMILIAR_CREDIT = 0.5` via `computeReviewCredit` — which is why `progress.correctReviews` is a `real` column, not `integer`. Accuracy = `correctReviews / reviews`.

Two distinct "weak" definitions exist and are intentionally different:

- `getWeakCards` (the /progress list) filters by **accuracy < 80%**, sorted worst-first.
- `pickWeakestCard` (weak practice mode) ranks by **lowest easeFactor**, random pick among the top 5. It has no absolute cutoff on purpose, so weak mode never comes up empty just because nothing crossed a threshold.

### Timestamp fields with non-obvious purposes

- `firstReviewedAt` — set once, never updated. Daily new-card counts (`countNewCardsToday`) key off this rather than `lastReviewed`/`reviews`, which churn on every same-day retry and would make requeued cards flicker in and out of the count.
- `nextReviewAt` null ⇒ card is "new" (`isNew`). Non-null and in the past ⇒ due.

### Level progression

`LEVEL_ORDER` in `types.ts` is the source of truth for ordering. A level unlocks the next when **every** card in it has `intervalDays >= 21` (`MASTERY_INTERVAL_THRESHOLD`). Unlock inserts use `onConflictDoNothing().returning()` — the empty-vs-non-empty result is how a genuine unlock is distinguished from a concurrent duplicate call, which is what makes the "Level unlocked!" toast fire exactly once. Same pattern in `ensureEntryLevelUnlocked`, which is called defensively at the top of most read queries.

## Content data

`lib/data/{vocab-basics,n5,n4,n3,n2,n1}.ts` export `CardSeed[]` (~1700 lines each, hand-authored). Card ids are stable strings (`n5_1`, …) and are the join key for `progress` — **never renumber existing ids**, that silently orphans user progress. `scripts/seed.ts` upserts via `onConflictDoUpdate`, so editing a card's text and re-seeding is safe.

## Conventions

- Migrations are generated, never hand-written: edit `lib/db/schema.ts` then `npm run db:generate`. `drizzle/**` is eslint-ignored.
- API routes validate input inline and return `NextResponse.json`; no validation library.
- `/api/tts` proxies Google's unofficial translate TTS endpoint and requires the browser User-Agent spoof to work.
- `next.config.mjs` sets `agentRules: false` to stop Next from auto-generating its own CLAUDE.md/AGENTS.md.
- Prettier with `prettier-plugin-tailwindcss` orders Tailwind classes — don't hand-sort them.
