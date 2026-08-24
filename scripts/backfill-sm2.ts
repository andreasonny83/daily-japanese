import { sql } from "drizzle-orm";

import { db } from "../lib/db/index";

// One-time backfill: derive initial SM-2 state (ease/interval/nextReviewAt)
// from the legacy `confidence` score before that column is dropped.
async function main() {
  const result = await db.execute(sql`
    UPDATE progress
    SET
      repetitions = reviews,
      ease_factor = LEAST(2.5, GREATEST(1.3, 1.3 + confidence * 0.24)),
      interval_days = CASE
        WHEN confidence >= 4 THEN 21
        WHEN confidence >= 2 THEN 6
        ELSE 1
      END,
      next_review_at = COALESCE(last_reviewed, now()) + (
        CASE
          WHEN confidence >= 4 THEN 21
          WHEN confidence >= 2 THEN 6
          ELSE 1
        END || ' days'
      )::interval
    WHERE reviews > 0
  `);

  console.log("Backfilled rows:", result.rowCount ?? "unknown");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
