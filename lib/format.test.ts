import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
  formatNextAvailable,
  formatNextReview,
  humanizeDuration,
} from "./format";

describe("humanizeDuration", () => {
  test("rounds down to minutes below the hour boundary", () => {
    expect(humanizeDuration(59 * 60 * 1000)).toEqual({
      value: 59,
      unit: "minute",
    });
  });

  test("59m59.9s rolls over to 1 hour instead of displaying 60 minutes", () => {
    expect(humanizeDuration(59 * 60 * 1000 + 59900)).toEqual({
      value: 1,
      unit: "hour",
    });
  });

  test("23h59m59.9s rolls over to 1 day instead of displaying 24 hours", () => {
    expect(
      humanizeDuration(23 * 60 * 60 * 1000 + 59 * 60 * 1000 + 59900),
    ).toEqual({
      value: 1,
      unit: "day",
    });
  });

  test("minutes floor at 1 even for sub-minute durations", () => {
    expect(humanizeDuration(5000)).toEqual({ value: 1, unit: "minute" });
  });

  test("multi-day durations round to whole days", () => {
    expect(humanizeDuration(3 * 24 * 60 * 60 * 1000)).toEqual({
      value: 3,
      unit: "day",
    });
  });
});

describe("formatNextAvailable / formatNextReview", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("formatNextAvailable shows 'under a minute' at the floor", () => {
    const soon = new Date(Date.now() + 30 * 1000).toISOString();
    expect(formatNextAvailable(soon)).toBe(
      "You can continue in under a minute",
    );
  });

  test("formatNextAvailable rolls a near-hour duration over correctly", () => {
    const target = new Date(Date.now() + 59 * 60 * 1000 + 59900).toISOString();
    expect(formatNextAvailable(target)).toBe("You can continue in 1 hour");
  });

  test("formatNextReview uses minutes within the same-session learning step", () => {
    const target = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    expect(formatNextReview(target, 0)).toBe("Review again in 10 minutes");
  });

  test("formatNextReview says 'tomorrow' for a 1-day interval", () => {
    const target = new Date(Date.now() + 25 * 60 * 60 * 1000).toISOString();
    expect(formatNextReview(target, 1)).toBe("Next review: tomorrow");
  });

  test("formatNextReview reports the SM-2 interval in days otherwise", () => {
    const target = new Date(Date.now() + 6 * 24 * 60 * 60 * 1000).toISOString();
    expect(formatNextReview(target, 6)).toBe("Next review in 6 days");
  });
});
