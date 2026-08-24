import Link from "next/link";

import type { WeakCard } from "@/types";

export function WeakCardsList({ cards }: { cards: WeakCard[] }) {
  if (cards.length === 0) {
    return (
      <p className="text-sm text-gray-500">
        No weak cards yet — keep practicing!
      </p>
    );
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">Weakest cards</h3>
        <Link
          href="/?mode=weak"
          className="rounded-full bg-red-50 px-3 py-1 text-xs font-medium text-red-600 transition-colors hover:bg-red-100"
        >
          Review these <i className="fas fa-arrow-right ml-1" />
        </Link>
      </div>
      <ul className="divide-y divide-gray-100 rounded-xl border border-gray-100 bg-white">
        {cards.map((c) => (
          <li
            key={c.id}
            className="flex items-center justify-between px-4 py-2 text-sm"
          >
            <div>
              <span className="japanese-text font-medium text-gray-800">
                {c.kanji}
              </span>
              <span className="ml-2 text-gray-400">{c.english}</span>
            </div>
            <span className="text-xs font-semibold text-gray-500">
              {c.confidence.toFixed(1)}/5
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
