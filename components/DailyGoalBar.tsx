export function DailyGoalBar({
  completed,
  total,
}: {
  completed: number;
  total: number;
}) {
  const pct = total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0;
  const done = completed >= total;

  return (
    <div className="border-b border-gray-100 px-6 py-3 md:px-8">
      <div className="mb-1 flex items-center justify-between text-xs text-gray-500">
        <span>
          {done ? (
            <>
              <i className="fas fa-check-circle mr-1 text-green-500" />
              Daily goal reached
            </>
          ) : (
            "New words today"
          )}
        </span>
        <span>
          {completed}/{total}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
        <div
          className={`h-full transition-all ${done ? "bg-green-500" : "bg-red-500"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
