"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { LevelProgressBar } from "@/components/LevelProgressBar";
import { WeakCardsList } from "@/components/WeakCardsList";
import { authClient } from "@/lib/auth/client";
import type { LevelSummary, WeakCard } from "@/types";

export default function ProgressPage() {
  const { data: session, isPending: sessionLoading } = authClient.useSession();
  const isAuthed = !!session?.user;

  const [levels, setLevels] = useState<LevelSummary[]>([]);
  const [weakCards, setWeakCards] = useState<WeakCard[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (sessionLoading || !isAuthed) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    fetch("/api/levels")
      .then((res) => res.json())
      .then((data) => {
        setLevels(data.levels ?? []);
        setWeakCards(data.weakCards ?? []);
      })
      .finally(() => setLoading(false));
  }, [sessionLoading, isAuthed]);

  if (sessionLoading) return null;

  if (!isAuthed) {
    return (
      <div className="w-full max-w-2xl rounded-2xl bg-white p-8 text-center shadow-xl">
        <h1 className="mb-2 text-xl font-bold text-gray-900">
          Sign in to see your progress
        </h1>
        <p className="mb-6 text-sm text-gray-500">
          Progress and level mastery are only tracked for signed-in accounts.
        </p>
        <Link
          href="/auth/sign-in"
          className="inline-block rounded-full bg-red-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-600"
        >
          Sign In
        </Link>
      </div>
    );
  }

  const totalMastered = levels.reduce((sum, l) => sum + l.masteredCards, 0);
  const totalCards = levels.reduce((sum, l) => sum + l.totalCards, 0);

  return (
    <div className="w-full max-w-2xl space-y-6">
      <div className="rounded-2xl bg-white p-6 shadow-xl md:p-8">
        <h1 className="mb-1 text-xl font-bold text-gray-900">Your Progress</h1>
        <p className="mb-6 text-sm text-gray-500">
          {loading
            ? "Loading..."
            : `${totalMastered}/${totalCards} cards mastered across all unlocked levels.`}
        </p>

        <div className="space-y-3">
          {levels.map((level) => (
            <LevelProgressBar key={level.id} level={level} />
          ))}
        </div>
      </div>

      <div className="rounded-2xl bg-white p-6 shadow-xl md:p-8">
        <WeakCardsList cards={weakCards} />
      </div>
    </div>
  );
}
