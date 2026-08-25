"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";

import { DailyGoalBar } from "@/components/DailyGoalBar";
import { FeedbackButtons } from "@/components/FeedbackButtons";
import { FlashCard } from "@/components/FlashCard";
import { ResetModal } from "@/components/ResetModal";
import { Toast } from "@/components/Toast";
import { authClient } from "@/lib/auth/client";
import { formatNextReview } from "@/lib/format";
import { useToast } from "@/lib/hooks/useToast";
import { PASSING_QUALITY } from "@/lib/srs";
import {
  LEVEL_ORDER,
  type CardWithProgress,
  type LevelSummary,
  type PracticeMode,
} from "@/types";

const SESSION_GOAL_CARDS = 20;
// Brief pause so the selected score is visible before advancing to the next card.
const RATE_ADVANCE_DELAY_MS = 600;

const LEVEL_LABELS: Record<string, string> = {
  "vocab-basics": "Vocabulary Basics",
  n5: "JLPT N5",
  n4: "JLPT N4",
  n3: "JLPT N3",
  n2: "JLPT N2",
  n1: "JLPT N1",
};

export default function PracticePage() {
  return (
    <Suspense fallback={null}>
      <PracticePageContent />
    </Suspense>
  );
}

function PracticePageContent() {
  const { data: session, isPending: sessionLoading } = authClient.useSession();
  const isAuthed = !!session?.user;
  const searchParams = useSearchParams();

  const [mode, setMode] = useState<PracticeMode>("auto");
  const [selectedLevelId, setSelectedLevelId] = useState<string | undefined>(
    undefined,
  );
  const [levels, setLevels] = useState<LevelSummary[]>([]);

  const [card, setCard] = useState<CardWithProgress | null>(null);
  const [nextAvailableAt, setNextAvailableAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [revealed, setRevealed] = useState(false);
  const [selectedScore, setSelectedScore] = useState<number | null>(null);

  const [dailyGoal, setDailyGoal] = useState<{
    completed: number;
    total: number;
  } | null>(null);
  const [sessionReviewed, setSessionReviewed] = useState(0);
  // Once "Review early anyway" is used, keep pulling ahead of the due-date
  // schedule for the rest of this session instead of reverting to the
  // normal due-only pool after a single card.
  const [pullAheadActive, setPullAheadActive] = useState(false);
  // True once sessionReviewed hits SESSION_GOAL_CARDS during the
  // post-daily-cap "session progress" phase — stops fetching more cards
  // instead of letting pull-ahead run indefinitely.
  const [sessionComplete, setSessionComplete] = useState(false);

  const [showResetModal, setShowResetModal] = useState(false);
  const { message: toastMsg, visible: toastVisible, showToast } = useToast();

  // Cards that failed on their first attempt this session get forced back
  // into rotation at least twice more (cardId -> remaining reappearances),
  // with a gap of at least one other card so the repeat isn't back-to-back.
  const pendingRequeueRef = useRef<Map<string, number>>(new Map());
  const requeueGapRef = useRef(0);
  // Tracks the most-recently-shown card id so loadCard can ask the server
  // to exclude it, preventing the same card from repeating back-to-back.
  const lastCardIdRef = useRef<string | null>(null);

  const loadCard = useCallback(
    async (nextMode: PracticeMode, levelId?: string, pullAhead = false) => {
      setLoading(true);
      setSelectedScore(null);
      setRevealed(false);
      const params = new URLSearchParams({ mode: nextMode });
      if (levelId) params.set("levelId", levelId);
      if (pullAhead) params.set("pullAhead", "true");
      if (lastCardIdRef.current) {
        params.set("excludeCardId", lastCardIdRef.current);
      }

      const requeueIds = [...pendingRequeueRef.current.keys()];
      if (requeueIds.length > 0 && requeueGapRef.current >= 1) {
        params.set("requeueIds", requeueIds.join(","));
      }

      const res = await fetch(`/api/cards/next?${params.toString()}`);
      if (!res.ok) {
        setLoading(false);
        return;
      }
      const data = await res.json();
      const nextCard: CardWithProgress | null = data.card ?? null;
      setCard(nextCard);
      setNextAvailableAt(data.nextAvailableAt ?? null);
      setLoading(false);
      lastCardIdRef.current = nextCard?.id ?? null;

      requeueGapRef.current =
        nextCard && pendingRequeueRef.current.has(nextCard.id)
          ? 0
          : requeueGapRef.current + 1;
    },
    [],
  );

  const loadLevels = useCallback(async () => {
    const res = await fetch("/api/levels");
    if (!res.ok) return;
    const data = await res.json();
    setLevels(data.levels ?? []);
  }, []);

  const loadDailyGoal = useCallback(async () => {
    const res = await fetch("/api/progress/daily-goal");
    if (!res.ok) return;
    const data = await res.json();
    setDailyGoal({ completed: data.newCardsToday, total: data.newCardsCap });
  }, []);

  // Wait for the session to resolve, then load the initial data set exactly
  // once — full SRS mode for a signed-in user, a single freely-browsable
  // level for a guest.
  const hasLoadedInitial = useRef(false);
  useEffect(() => {
    if (sessionLoading || hasLoadedInitial.current) return;
    hasLoadedInitial.current = true;

    loadLevels();
    if (isAuthed) {
      const initialMode = searchParams.get("mode") === "weak" ? "weak" : "auto";
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMode(initialMode);
      loadDailyGoal();
      loadCard(initialMode);
    } else {
      setMode("level");
      setSelectedLevelId(LEVEL_ORDER[0]);
      loadCard("level", LEVEL_ORDER[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionLoading]);

  // React to `?mode=weak` on later client-side navigations (e.g. from the
  // "Review these" link on /progress), since the initial-load effect above
  // only fires once and won't pick up a query-param change on its own.
  const weakModeParam = searchParams.get("mode") === "weak";
  useEffect(() => {
    if (!hasLoadedInitial.current || !isAuthed || !weakModeParam) return;
    if (mode === "weak") return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMode("weak");
    setSelectedLevelId(undefined);
    loadCard("weak");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weakModeParam, isAuthed]);

  async function handleModeChange(value: string) {
    setPullAheadActive(false);
    setSessionComplete(false);
    setSessionReviewed(0);
    if (value === "auto" || value === "weak" || value === "review") {
      setMode(value);
      setSelectedLevelId(undefined);
      await loadCard(value);
    } else {
      setMode("level");
      setSelectedLevelId(value);
      await loadCard("level", value);
    }
  }

  async function handleRate(score: number) {
    if (!card || !revealed || selectedScore !== null || !isAuthed) return;
    setSelectedScore(score);

    const wasSessionMode =
      mode !== "weak" &&
      mode !== "review" &&
      !!dailyGoal &&
      dailyGoal.completed >= dailyGoal.total;
    const newSessionCount = sessionReviewed + 1;

    const res = await fetch("/api/progress", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cardId: card.id, score, mode }),
    });
    if (!res.ok) {
      setSelectedScore(null);
      showToast("Something went wrong — try again");
      return;
    }
    const result = await res.json();
    setSessionReviewed(newSessionCount);

    const wasPending = pendingRequeueRef.current.has(card.id);
    if (wasPending) {
      const remaining = pendingRequeueRef.current.get(card.id)! - 1;
      if (remaining <= 0) pendingRequeueRef.current.delete(card.id);
      else pendingRequeueRef.current.set(card.id, remaining);
    } else if (score < PASSING_QUALITY && card.isReview === false) {
      // First-attempt failure on a brand-new word: force it back into
      // rotation at least twice more this session.
      pendingRequeueRef.current.set(card.id, 2);
    }

    setCard((prev) =>
      prev
        ? {
            ...prev,
            intervalDays: result.intervalDays,
            repetitions: result.repetitions,
          }
        : prev,
    );
    setDailyGoal({
      completed: result.newCardsToday,
      total: result.newCardsCap,
    });

    if (result.leveledUp && result.newLevelId) {
      showToast(
        `Level unlocked: ${LEVEL_LABELS[result.newLevelId] ?? result.newLevelId}!`,
      );
      loadLevels();
    } else {
      showToast(formatNextReview(result.nextReviewAt, result.intervalDays));
    }

    if (wasSessionMode && newSessionCount >= SESSION_GOAL_CARDS) {
      setTimeout(() => {
        setCard(null);
        setSessionComplete(true);
      }, RATE_ADVANCE_DELAY_MS);
      return;
    }

    setTimeout(
      () => loadCard(mode, selectedLevelId, pullAheadActive),
      RATE_ADVANCE_DELAY_MS,
    );
  }

  function handleSkip() {
    if (isAuthed) {
      loadCard(mode, selectedLevelId, pullAheadActive);
    } else {
      loadCard("level", selectedLevelId);
    }
  }

  // Lets 0-5 submit feedback the same as clicking a FeedbackButtons score,
  // without hijacking digits typed into an actual input/textarea.
  useEffect(() => {
    if (!revealed || !card || selectedScore !== null || !isAuthed) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
        return;
      if (!/^[0-5]$/.test(e.key)) return;
      handleRate(Number(e.key));
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealed, card, selectedScore, isAuthed]);

  async function handleResetConfirm() {
    setShowResetModal(false);
    const res = await fetch("/api/progress/reset", {
      method: "POST",
      headers: { "X-Confirm-Reset": "1" },
    });
    if (!res.ok) {
      showToast("Reset failed — try again");
      return;
    }
    showToast("Progress reset successfully");
    await loadLevels();
    await loadDailyGoal();
    setMode("auto");
    setSelectedLevelId(undefined);
    setPullAheadActive(false);
    setSessionComplete(false);
    setSessionReviewed(0);
    await loadCard("auto");
  }

  const unlockedLevels = levels.filter((l) => l.unlocked);

  return (
    <>
      <div className="w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-xl transition-all duration-500 hover:shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-6 py-3 md:px-8">
          {isAuthed ? (
            <button
              onClick={() => setShowResetModal(true)}
              className="text-xs text-gray-500 transition-colors hover:text-red-500"
              title="Reset all learning progress"
            >
              <i className="fas fa-undo" />
              <span className="ml-1 hidden sm:inline">Reset Progress</span>
            </button>
          ) : (
            <span className="text-xs text-gray-400">Browsing as guest</span>
          )}

          {isAuthed ? (
            <select
              value={mode === "level" ? (selectedLevelId ?? "auto") : mode}
              onChange={(e) => handleModeChange(e.target.value)}
              className="block cursor-pointer rounded-lg border border-gray-300 bg-gray-50 p-2 text-xs text-gray-900 shadow-sm transition-colors focus:border-red-500 focus:ring-red-500 md:text-sm"
            >
              <option value="auto">Continue Learning</option>
              <option value="weak">Review Weak Cards</option>
              <option value="review">Review All Studied Cards</option>
              {unlockedLevels.map((l) => (
                <option key={l.id} value={l.id}>
                  Practice: {l.name}
                </option>
              ))}
            </select>
          ) : (
            <select
              value={selectedLevelId ?? LEVEL_ORDER[0]}
              onChange={(e) => {
                setSelectedLevelId(e.target.value);
                loadCard("level", e.target.value);
              }}
              className="block cursor-pointer rounded-lg border border-gray-300 bg-gray-50 p-2 text-xs text-gray-900 shadow-sm transition-colors focus:border-red-500 focus:ring-red-500 md:text-sm"
            >
              {levels.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          )}
        </div>

        {isAuthed &&
          mode !== "weak" &&
          mode !== "review" &&
          !!card &&
          dailyGoal &&
          (dailyGoal.completed >= dailyGoal.total ? (
            <DailyGoalBar
              completed={sessionReviewed}
              total={SESSION_GOAL_CARDS}
              label="Session progress"
              doneLabel="Session goal reached"
            />
          ) : (
            <DailyGoalBar
              completed={dailyGoal.completed}
              total={dailyGoal.total}
            />
          ))}

        <FlashCard
          card={card}
          loading={loading}
          revealed={revealed}
          onReveal={() => setRevealed(true)}
          caughtUp={
            isAuthed &&
            !loading &&
            !card &&
            !sessionComplete &&
            mode !== "weak" &&
            mode !== "review"
          }
          sessionComplete={sessionComplete}
          nextAvailableAt={nextAvailableAt}
          emptyMessage={
            mode === "weak"
              ? "No weak cards yet — keep practicing to build some up."
              : mode === "review"
                ? "No cards reviewed yet — study some new words first."
                : undefined
          }
          onPullAhead={
            mode === "weak" || mode === "review"
              ? undefined
              : () => {
                  setPullAheadActive(true);
                  setSessionReviewed(0);
                  setSessionComplete(false);
                  loadCard(mode, selectedLevelId, true);
                }
          }
        />

        <div className="px-6 pb-6 md:px-8 md:pb-8">
          {isAuthed ? (
            revealed &&
            card && (
              <FeedbackButtons
                disabled={loading}
                selectedScore={selectedScore}
                onSelect={handleRate}
              />
            )
          ) : (
            <div className="mt-1 rounded-lg border border-dashed border-gray-200 bg-gray-50 px-4 py-3 text-center text-xs text-gray-500">
              <Link
                href="/auth/sign-in"
                className="font-medium text-red-600 hover:underline"
              >
                Sign in
              </Link>{" "}
              to track your progress and unlock leveled learning.
            </div>
          )}

          {card && (
            <div className="mt-5 flex justify-center">
              <button
                onClick={handleSkip}
                disabled={loading}
                className="flex items-center gap-1 text-sm font-medium text-gray-400 transition-colors hover:text-gray-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Skip <i className="fas fa-forward" />
              </button>
            </div>
          )}
        </div>
      </div>

      {isAuthed && (
        <ResetModal
          open={showResetModal}
          onCancel={() => setShowResetModal(false)}
          onConfirm={handleResetConfirm}
        />
      )}
      <Toast message={toastMsg} visible={toastVisible} />
    </>
  );
}
