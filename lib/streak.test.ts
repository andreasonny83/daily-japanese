import { describe, expect, test } from "vitest";

import { computeStreakUpdate } from "./streak";

describe("computeStreakUpdate", () => {
  test("no prior activity starts a streak of 1", () => {
    const result = computeStreakUpdate(null, new Date("2026-03-05T10:00:00Z"));
    expect(result).toEqual({
      currentStreak: 1,
      longestStreak: 1,
      lastActiveDate: new Date("2026-03-05T00:00:00Z"),
    });
  });

  test("same UTC day as last activity is a no-op (returns existing unchanged)", () => {
    const existing = {
      currentStreak: 4,
      longestStreak: 10,
      lastActiveDate: new Date("2026-03-05T02:00:00Z"),
    };
    const result = computeStreakUpdate(
      existing,
      new Date("2026-03-05T23:00:00Z"),
    );
    expect(result).toBe(existing);
  });

  test("exactly the next UTC day continues the streak", () => {
    const existing = {
      currentStreak: 4,
      longestStreak: 10,
      lastActiveDate: new Date("2026-03-05T20:00:00Z"),
    };
    const result = computeStreakUpdate(
      existing,
      new Date("2026-03-06T01:00:00Z"),
    );
    expect(result).toEqual({
      currentStreak: 5,
      longestStreak: 10,
      lastActiveDate: new Date("2026-03-06T00:00:00Z"),
    });
  });

  test("continuing the streak past the previous best bumps longestStreak", () => {
    const existing = {
      currentStreak: 10,
      longestStreak: 10,
      lastActiveDate: new Date("2026-03-05T20:00:00Z"),
    };
    const result = computeStreakUpdate(
      existing,
      new Date("2026-03-06T01:00:00Z"),
    );
    expect(result).toEqual({
      currentStreak: 11,
      longestStreak: 11,
      lastActiveDate: new Date("2026-03-06T00:00:00Z"),
    });
  });

  test("a skipped day resets the streak to 1 but preserves longestStreak", () => {
    const existing = {
      currentStreak: 6,
      longestStreak: 12,
      lastActiveDate: new Date("2026-03-01T05:00:00Z"),
    };
    const result = computeStreakUpdate(
      existing,
      new Date("2026-03-05T05:00:00Z"),
    );
    expect(result).toEqual({
      currentStreak: 1,
      longestStreak: 12,
      lastActiveDate: new Date("2026-03-05T00:00:00Z"),
    });
  });

  test("a reset that would exceed longestStreak (streak of 1 vs longest 0) still records it", () => {
    const existing = {
      currentStreak: 0,
      longestStreak: 0,
      lastActiveDate: null,
    };
    const result = computeStreakUpdate(
      existing,
      new Date("2026-03-05T05:00:00Z"),
    );
    expect(result).toEqual({
      currentStreak: 1,
      longestStreak: 1,
      lastActiveDate: new Date("2026-03-05T00:00:00Z"),
    });
  });
});
