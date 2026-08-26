"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { DailyGoalBar } from "@/components/DailyGoalBar";
import { LevelProgressBar } from "@/components/LevelProgressBar";
import { WeakCardsList } from "@/components/WeakCardsList";
import { authClient } from "@/lib/auth/client";
import type { LevelSummary, WeakCard } from "@/types";

export default function HomePage() {
  const { data: session, isPending: sessionLoading } = authClient.useSession();
  const isAuthed = !!session?.user;

  if (sessionLoading) return null;
  return isAuthed ? <SignedInHome name={session.user.name} /> : <GuestHome />;
}

function SignedInHome({ name }: { name: string | null | undefined }) {
  const [levels, setLevels] = useState<LevelSummary[]>([]);
  const [weakCards, setWeakCards] = useState<WeakCard[]>([]);
  const [dailyGoal, setDailyGoal] = useState<{
    completed: number;
    total: number;
  } | null>(null);
  const [streak, setStreak] = useState<{
    currentStreak: number;
    longestStreak: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [levelsRes, dailyGoalRes, streakRes] = await Promise.all([
        fetch("/api/levels"),
        fetch("/api/progress/daily-goal"),
        fetch("/api/streak"),
      ]);
      if (cancelled) return;

      if (levelsRes.ok) {
        const data = await levelsRes.json();
        setLevels(data.levels ?? []);
        setWeakCards(data.weakCards ?? []);
      }
      if (dailyGoalRes.ok) {
        const data = await dailyGoalRes.json();
        setDailyGoal({
          completed: data.newCardsToday,
          total: data.newCardsCap,
        });
      }
      if (streakRes.ok) {
        setStreak(await streakRes.json());
      }
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const unlockedLevels = levels.filter((l) => l.unlocked);
  const totalMastered = levels.reduce((sum, l) => sum + l.masteredCards, 0);
  const totalCards = levels.reduce((sum, l) => sum + l.totalCards, 0);

  return (
    <div className="w-full max-w-2xl space-y-6">
      <div className="rounded-2xl bg-white p-6 shadow-xl md:p-8">
        <h1 className="mb-1 text-xl font-bold text-gray-900">
          Welcome back{name ? `, ${name}` : ""}
        </h1>
        <p className="mb-4 text-sm text-gray-500">
          {loading
            ? "Loading..."
            : `${totalMastered}/${totalCards} cards mastered across ${unlockedLevels.length} unlocked level${unlockedLevels.length === 1 ? "" : "s"}.`}
        </p>

        {streak && (
          <div className="mb-4 flex items-center gap-4 rounded-xl border border-orange-100 bg-orange-50 px-4 py-3">
            <i className="fas fa-fire text-2xl text-orange-500" />
            <div>
              <p className="text-sm font-semibold text-gray-800">
                {streak.currentStreak > 0
                  ? `${streak.currentStreak} day${streak.currentStreak === 1 ? "" : "s"} streak`
                  : "Start your streak today"}
              </p>
              {streak.longestStreak > 0 && (
                <p className="text-xs text-gray-500">
                  Best: {streak.longestStreak} day
                  {streak.longestStreak === 1 ? "" : "s"}
                </p>
              )}
            </div>
          </div>
        )}

        {dailyGoal && (
          <div className="-mx-6 mb-5 md:-mx-8">
            <DailyGoalBar
              completed={dailyGoal.completed}
              total={dailyGoal.total}
            />
          </div>
        )}

        <div className="flex flex-wrap gap-3">
          <Link
            href="/practice"
            className="rounded-full bg-red-500 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-red-600"
          >
            Continue Practicing <i className="fas fa-arrow-right ml-1" />
          </Link>
          <Link
            href="/practice?mode=weak"
            className="rounded-full border border-gray-200 bg-gray-50 px-5 py-2.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100"
          >
            Review Weak Cards
          </Link>
        </div>
      </div>

      <div className="rounded-2xl bg-white p-6 shadow-xl md:p-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-400">
          Levels
        </h2>
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

function GuestHome() {
  return (
    <div className="w-full max-w-2xl space-y-6 text-center">
      <div className="rounded-2xl bg-white p-8 shadow-xl md:p-10">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-500 text-2xl font-bold text-white shadow-md">
          日
        </div>
        <h1 className="mb-2 text-2xl font-bold text-gray-900">
          Daily Japanese
        </h1>
        <p className="mx-auto mb-6 max-w-md text-sm text-gray-500">
          Learn Japanese vocabulary with a leveled, spaced-repetition flashcard
          system — from absolute basics through JLPT N5–N1, one word at a time.
        </p>

        <div className="mb-8 flex flex-wrap justify-center gap-3">
          <Link
            href="/auth/sign-in"
            className="rounded-full bg-red-500 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-red-600"
          >
            Sign In
          </Link>
          <Link
            href="/practice"
            className="rounded-full border border-gray-200 bg-gray-50 px-5 py-2.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100"
          >
            Try without an account
          </Link>
        </div>

        <div className="grid grid-cols-1 gap-3 text-left sm:grid-cols-3">
          <FeatureBlurb
            icon="fa-layer-group"
            title="Leveled content"
            body="Vocabulary basics through JLPT N5–N1, unlocked as you master each level."
          />
          <FeatureBlurb
            icon="fa-brain"
            title="Spaced repetition"
            body="An SM-2 schedule brings words back right before you'd forget them."
          />
          <FeatureBlurb
            icon="fa-volume-up"
            title="Native pronunciation"
            body="Every card has audio, kana, and romaji alongside the kanji."
          />
        </div>
      </div>
    </div>
  );
}

function FeatureBlurb({
  icon,
  title,
  body,
}: {
  icon: string;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
      <i className={`fas ${icon} mb-2 text-red-500`} />
      <p className="mb-1 text-sm font-semibold text-gray-800">{title}</p>
      <p className="text-xs text-gray-500">{body}</p>
    </div>
  );
}
