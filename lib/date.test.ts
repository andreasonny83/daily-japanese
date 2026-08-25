import { describe, expect, test } from "vitest";

import { utcDayRange } from "./date";

describe("utcDayRange", () => {
  test("returns UTC midnight-to-midnight bounds for a mid-day timestamp", () => {
    const { start, end } = utcDayRange(new Date("2026-03-05T14:30:00.000Z"));

    expect(start.toISOString()).toBe("2026-03-05T00:00:00.000Z");
    expect(end.toISOString()).toBe("2026-03-06T00:00:00.000Z");
  });

  test("a timestamp exactly at UTC midnight is its own day's start", () => {
    const { start, end } = utcDayRange(new Date("2026-03-05T00:00:00.000Z"));

    expect(start.toISOString()).toBe("2026-03-05T00:00:00.000Z");
    expect(end.toISOString()).toBe("2026-03-06T00:00:00.000Z");
  });

  test("a timestamp just before UTC midnight stays in the earlier day", () => {
    const { start, end } = utcDayRange(new Date("2026-03-05T23:59:59.999Z"));

    expect(start.toISOString()).toBe("2026-03-05T00:00:00.000Z");
    expect(end.toISOString()).toBe("2026-03-06T00:00:00.000Z");
  });

  test("bounds are consistent regardless of the host's local timezone (uses UTC getters)", () => {
    // A timestamp that would fall on a different calendar day in e.g. UTC-8 or UTC+8
    // must still bucket by its UTC date, not the process's local timezone.
    const { start, end } = utcDayRange(new Date("2026-03-05T02:00:00.000Z"));

    expect(start.toISOString()).toBe("2026-03-05T00:00:00.000Z");
    expect(end.toISOString()).toBe("2026-03-06T00:00:00.000Z");
  });
});
