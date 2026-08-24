import type { LevelSummary } from "@/types";

export function LevelProgressBar({ level }: { level: LevelSummary }) {
  const pct =
    level.totalCards > 0
      ? Math.round((level.masteredCards / level.totalCards) * 100)
      : 0;

  return (
    <div
      className={`rounded-xl border p-4 ${
        level.unlocked
          ? "border-gray-200 bg-white"
          : "border-gray-100 bg-gray-50 opacity-60"
      }`}
    >
      <div className="mb-1 flex items-center justify-between">
        <span className="font-semibold text-gray-800">{level.name}</span>
        {!level.unlocked && <i className="fas fa-lock text-gray-400" />}
      </div>
      <p className="mb-2 text-xs text-gray-500">{level.description}</p>
      {level.unlocked ? (
        <>
          <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
            <div className="h-full bg-red-500" style={{ width: `${pct}%` }} />
          </div>
          <div className="mt-1 flex justify-between text-[11px] text-gray-500">
            <span>
              {level.masteredCards}/{level.totalCards} mastered
            </span>
            <span>avg {level.avgConfidence.toFixed(1)}/5</span>
          </div>
        </>
      ) : (
        <p className="text-[11px] text-gray-400">
          Unlock by mastering the previous level (avg confidence ≥ 4/5, each
          card reviewed ≥ 2x).
        </p>
      )}
    </div>
  );
}
