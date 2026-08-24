const SCORES = [
  { score: 0, label: "Clueless", color: "red" },
  { score: 1, label: "Hard", color: "orange" },
  { score: 2, label: "Familiar", color: "yellow" },
  { score: 3, label: "Good", color: "green" },
  { score: 4, label: "Easy", color: "teal" },
  { score: 5, label: "Mastered", color: "blue" },
] as const;

const COLOR_CLASSES: Record<string, string> = {
  red: "bg-red-50 hover:bg-red-100 border-red-200 text-red-700",
  orange: "bg-orange-50 hover:bg-orange-100 border-orange-200 text-orange-700",
  yellow: "bg-yellow-50 hover:bg-yellow-100 border-yellow-200 text-yellow-700",
  green: "bg-green-50 hover:bg-green-100 border-green-200 text-green-700",
  teal: "bg-teal-50 hover:bg-teal-100 border-teal-200 text-teal-700",
  blue: "bg-blue-50 hover:bg-blue-100 border-blue-200 text-blue-700",
};

export function FeedbackButtons({
  disabled,
  selectedScore,
  onSelect,
}: {
  disabled: boolean;
  selectedScore: number | null;
  onSelect: (score: number) => void;
}) {
  return (
    <div
      className={`mt-1 border-t border-gray-100 pt-4 transition-opacity duration-300 ${
        disabled ? "pointer-events-none opacity-50" : "opacity-100"
      }`}
    >
      <p className="mb-3 text-center text-xs font-medium text-gray-600 md:text-sm">
        How well did you know this card?
      </p>
      <div className="mx-auto grid w-full max-w-md grid-cols-3 gap-2 sm:grid-cols-6 md:gap-3">
        {SCORES.map(({ score, label, color }) => {
          const isSelected = selectedScore === score;
          const isDimmed = selectedScore !== null && !isSelected;
          return (
            <button
              key={score}
              disabled={disabled || selectedScore !== null}
              onClick={() => onSelect(score)}
              className={`flex flex-col items-center justify-center rounded-lg border px-1 py-1.5 font-bold transition-all duration-200 will-change-transform ${COLOR_CLASSES[color]} ${
                isSelected
                  ? "scale-105 ring-4 ring-indigo-500 ring-offset-2"
                  : ""
              } ${isDimmed ? "opacity-40" : "opacity-100"} ${selectedScore !== null ? "" : "hover:-translate-y-1 hover:scale-105 hover:shadow-lg active:translate-y-px active:scale-95"} `}
            >
              <span className="mb-0.5 text-base md:text-lg">{score}</span>
              <span className="text-[9px] uppercase tracking-tighter opacity-80 md:text-[10px]">
                {label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
