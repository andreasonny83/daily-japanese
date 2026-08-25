import { describe, expect, test } from "vitest";

import {
  applySm2Update,
  computeAccuracy,
  DEFAULT_EASE_FACTOR,
  MIN_EASE_FACTOR,
} from "./srs";

const NEW_CARD = { easeFactor: DEFAULT_EASE_FACTOR, intervalDays: 0, repetitions: 0 };

describe("applySm2Update", () => {
  test("first review with quality 5 sets interval to 1 day and bumps ease", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    const result = applySm2Update(NEW_CARD, 5, now);

    expect(result.repetitions).toBe(1);
    expect(result.intervalDays).toBe(1);
    expect(result.easeFactor).toBeCloseTo(2.6, 5);
    expect(result.nextReviewAt.toISOString()).toBe("2026-01-02T00:00:00.000Z");
  });

  test("second consecutive good review sets interval to 6 days", () => {
    const now = new Date("2026-01-02T00:00:00.000Z");
    const afterFirst = applySm2Update(NEW_CARD, 5, new Date("2026-01-01T00:00:00.000Z"));

    const result = applySm2Update(afterFirst, 5, now);

    expect(result.repetitions).toBe(2);
    expect(result.intervalDays).toBe(6);
  });

  test("third consecutive good review multiplies previous interval by ease factor", () => {
    const day1 = applySm2Update(NEW_CARD, 5, new Date("2026-01-01T00:00:00.000Z"));
    const day2 = applySm2Update(day1, 5, new Date("2026-01-02T00:00:00.000Z"));

    const result = applySm2Update(day2, 5, new Date("2026-01-08T00:00:00.000Z"));

    // day2.intervalDays=6, day2.easeFactor≈2.7 → new ease ≈2.8 → round(6*2.8)=17
    expect(result.repetitions).toBe(3);
    expect(result.easeFactor).toBeCloseTo(2.8, 5);
    expect(result.intervalDays).toBe(17);
  });

  test("lapse (quality < 3) resets repetitions and interval to 1 day", () => {
    const day1 = applySm2Update(NEW_CARD, 5, new Date("2026-01-01T00:00:00.000Z"));
    const day2 = applySm2Update(day1, 5, new Date("2026-01-02T00:00:00.000Z"));
    const matured = applySm2Update(day2, 5, new Date("2026-01-08T00:00:00.000Z"));

    const result = applySm2Update(matured, 0, new Date("2026-02-01T00:00:00.000Z"));

    expect(result.repetitions).toBe(0);
    expect(result.intervalDays).toBe(1);
    expect(result.nextReviewAt.toISOString()).toBe("2026-02-02T00:00:00.000Z");
  });

  test("ease factor never drops below the floor of 1.3", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    // Graduate first so repeated failures exercise the ease-factor formula
    // (ungraduated failures no longer touch ease — see below).
    let state = applySm2Update(NEW_CARD, 5, now);
    for (let i = 0; i < 20; i++) {
      state = applySm2Update(state, 0, now);
    }

    expect(state.easeFactor).toBeGreaterThanOrEqual(MIN_EASE_FACTOR);
  });

  test("failing an ungraduated (new) card resurfaces in 10 minutes without touching ease", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");

    const result = applySm2Update(NEW_CARD, 0, now);

    expect(result.repetitions).toBe(0);
    expect(result.intervalDays).toBe(0);
    expect(result.easeFactor).toBe(DEFAULT_EASE_FACTOR);
    expect(result.nextReviewAt.toISOString()).toBe("2026-01-01T00:10:00.000Z");
  });

  test("passing after a learning-step fail graduates normally", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    const afterFail = applySm2Update(NEW_CARD, 0, now);

    const result = applySm2Update(afterFail, 5, new Date("2026-01-01T00:10:00.000Z"));

    expect(result.repetitions).toBe(1);
    expect(result.intervalDays).toBe(1);
    expect(result.easeFactor).toBeCloseTo(2.6, 5);
  });
});

describe("computeAccuracy", () => {
  test("returns null when there are no reviews yet", () => {
    expect(computeAccuracy(0, 0)).toBeNull();
  });

  test("rounds correct/total to the nearest percent", () => {
    expect(computeAccuracy(2, 3)).toBe(67);
  });

  test("100% when every review was correct", () => {
    expect(computeAccuracy(4, 4)).toBe(100);
  });

  test("0% when no review was correct", () => {
    expect(computeAccuracy(0, 5)).toBe(0);
  });
});
