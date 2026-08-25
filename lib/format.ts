export type DurationUnit = "minute" | "hour" | "day";

// Rounds to whole minutes/hours/days *before* picking a bucket, so a value
// like 59m59.9s (which naively rounds to "60 minutes") correctly rolls over
// to "1 hour" instead of displaying an out-of-range number.
export function humanizeDuration(diffMs: number): {
  value: number;
  unit: DurationUnit;
} {
  const totalMinutes = Math.round(diffMs / 60000);
  if (totalMinutes < 60)
    return { value: Math.max(1, totalMinutes), unit: "minute" };

  const totalHours = Math.round(diffMs / (60 * 60 * 1000));
  if (totalHours < 24) return { value: totalHours, unit: "hour" };

  const totalDays = Math.round(diffMs / (24 * 60 * 60 * 1000));
  return { value: totalDays, unit: "day" };
}

function pluralize(value: number, unit: DurationUnit): string {
  return `${value} ${unit}${value === 1 ? "" : "s"}`;
}

/** Guest/practice "nothing due" message — precise down to under a minute. */
export function formatNextAvailable(nextAvailableAt: string): string {
  const diffMs = new Date(nextAvailableAt).getTime() - Date.now();
  if (diffMs <= 60 * 1000) return "You can continue in under a minute";
  const { value, unit } = humanizeDuration(diffMs);
  return `You can continue in ${pluralize(value, unit)}`;
}

/** Post-rating toast — minutes for the same-session learning step, otherwise the SM-2 day-based schedule. */
export function formatNextReview(
  nextReviewAt: string,
  intervalDays: number,
): string {
  const diffMs = new Date(nextReviewAt).getTime() - Date.now();
  const { value, unit } = humanizeDuration(diffMs);
  if (unit === "minute") {
    return `Review again in ${pluralize(value, "minute")}`;
  }
  if (intervalDays === 1) return "Next review: tomorrow";
  return `Next review in ${intervalDays} days`;
}
