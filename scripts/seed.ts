import { sql } from "drizzle-orm";

import { db } from "../lib/db";
import { cards as vocabBasics } from "../lib/data/vocab-basics";
import { cards as n5Cards } from "../lib/data/n5";
import { cards as n4Cards } from "../lib/data/n4";
import { cards as n3Cards } from "../lib/data/n3";
import { cards as n2Cards } from "../lib/data/n2";
import { cards as n1Cards } from "../lib/data/n1";
import { cards, levels } from "../lib/db/schema";

const LEVEL_META = [
  {
    id: "vocab-basics",
    order: 0,
    name: "Vocabulary Basics",
    description: "Colors, animals, food, numbers, family, and greetings.",
  },
  {
    id: "n5",
    order: 1,
    name: "JLPT N5",
    description: "Basic vocabulary, simple sentences, and core grammar.",
  },
  {
    id: "n4",
    order: 2,
    name: "JLPT N4",
    description:
      "Intermediate grammar: conditionals, potential form, giving/receiving.",
  },
  {
    id: "n3",
    order: 3,
    name: "JLPT N3",
    description: "Passive/causative forms, hearsay, and more nuanced grammar.",
  },
  {
    id: "n2",
    order: 4,
    name: "JLPT N2",
    description: "Advanced connectors and formal written grammar.",
  },
  {
    id: "n1",
    order: 5,
    name: "JLPT N1",
    description: "Advanced literary and formal grammar patterns.",
  },
] as const;

const BATCH_SIZE = 100;

async function main() {
  console.log("Seeding levels...");
  for (const level of LEVEL_META) {
    await db
      .insert(levels)
      .values(level)
      .onConflictDoUpdate({
        target: levels.id,
        set: {
          order: level.order,
          name: level.name,
          description: level.description,
        },
      });
  }

  const allCards = [
    ...vocabBasics,
    ...n5Cards,
    ...n4Cards,
    ...n3Cards,
    ...n2Cards,
    ...n1Cards,
  ];
  console.log(`Seeding ${allCards.length} cards...`);

  for (let i = 0; i < allCards.length; i += BATCH_SIZE) {
    const batch = allCards.slice(i, i + BATCH_SIZE);
    await db
      .insert(cards)
      .values(batch)
      .onConflictDoUpdate({
        target: cards.id,
        set: {
          levelId: sql`excluded.level_id`,
          type: sql`excluded.type`,
          category: sql`excluded.category`,
          grammarPoint: sql`excluded.grammar_point`,
          kanji: sql`excluded.kanji`,
          kana: sql`excluded.kana`,
          romaji: sql`excluded.romaji`,
          english: sql`excluded.english`,
        },
      });
    console.log(
      `  ...${Math.min(i + BATCH_SIZE, allCards.length)}/${allCards.length}`,
    );
  }

  console.log("Done.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
