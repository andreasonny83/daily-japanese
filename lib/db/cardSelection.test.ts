import { describe, expect, test } from "vitest";

import {
  excludeLastShown,
  type CardRow,
  pickRequeuedCard,
} from "./cardSelection";

function makeCard(id: string): CardRow {
  return {
    id,
    levelId: "n5",
    type: "vocab",
    category: null,
    grammarPoint: null,
    kanji: id,
    kana: id,
    romaji: id,
    english: id,
  };
}

describe("excludeLastShown", () => {
  const pool = [makeCard("a"), makeCard("b"), makeCard("c")];

  test("filters out the excluded card", () => {
    const result = excludeLastShown(pool, "b");
    expect(result.map((c) => c.id)).toEqual(["a", "c"]);
  });

  test("returns the full pool when excludeCardId is undefined", () => {
    expect(excludeLastShown(pool, undefined)).toEqual(pool);
  });

  test("falls back to the full pool when excluding would leave nothing", () => {
    const singleCardPool = [makeCard("only")];
    expect(excludeLastShown(singleCardPool, "only")).toEqual(singleCardPool);
  });
});

describe("pickRequeuedCard", () => {
  const pool = [makeCard("a"), makeCard("b"), makeCard("c")];

  test("returns null when there are no requeue ids", () => {
    expect(pickRequeuedCard(pool, undefined)).toBeNull();
    expect(pickRequeuedCard(pool, [])).toBeNull();
  });

  test("only picks from the requeue candidates present in the pool", () => {
    const picked = pickRequeuedCard(pool, ["b"]);
    expect(picked?.id).toBe("b");
  });

  test("never returns the just-shown card, even if it's the only requeue candidate", () => {
    const picked = pickRequeuedCard(pool, ["b"], "b");
    expect(picked).toBeNull();
  });

  test("excludes just the shown card, still returning another valid requeue candidate", () => {
    const picked = pickRequeuedCard(pool, ["a", "b"], "b");
    expect(picked?.id).toBe("a");
  });

  test("ignores requeue ids not present in the pool", () => {
    expect(pickRequeuedCard(pool, ["not-in-pool"])).toBeNull();
  });
});
