"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { FeedbackButtons } from "@/components/FeedbackButtons";
import { FlashCard } from "@/components/FlashCard";
import { ResetModal } from "@/components/ResetModal";
import { Toast } from "@/components/Toast";
import { authClient } from "@/lib/auth/client";
import {
  LEVEL_ORDER,
  type CardWithProgress,
  type LevelSummary,
  type PracticeMode,
} from "@/types";

const LEVEL_LABELS: Record<string, string> = {
  "vocab-basics": "Vocabulary Basics",
  n5: "JLPT N5",
  n4: "JLPT N4",
  n3: "JLPT N3",
  n2: "JLPT N2",
  n1: "JLPT N1",
};

export default function PracticePage() {
  const { data: session, isPending: sessionLoading } = authClient.useSession();
  const isAuthed = !!session?.user;

  const [mode, setMode] = useState<PracticeMode>(() => {
    if (typeof window === "undefined") return "auto";
    const initialMode = new URLSearchParams(window.location.search).get("mode");
    return initialMode === "weak" ? "weak" : "auto";
  });
  const [selectedLevelId, setSelectedLevelId] = useState<string | undefined>(
    undefined,
  );
  const [levels, setLevels] = useState<LevelSummary[]>([]);

  const [card, setCard] = useState<CardWithProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [revealed, setRevealed] = useState(false);
  const [selectedScore, setSelectedScore] = useState<number | null>(null);

  const [toastMsg, setToastMsg] = useState("");
  const [toastVisible, setToastVisible] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);

  const showToast = useCallback((message: string) => {
    setToastMsg(message);
    setToastVisible(true);
    setTimeout(() => setToastVisible(false), 3000);
  }, []);

  const loadCard = useCallback(
    async (nextMode: PracticeMode, levelId?: string) => {
      setLoading(true);
      setSelectedScore(null);
      setRevealed(false);
      const params = new URLSearchParams({ mode: nextMode });
      if (levelId) params.set("levelId", levelId);
      const res = await fetch(`/api/cards/next?${params.toString()}`);
      const data = await res.json();
      setCard(data.card ?? null);
      setLoading(false);
    },
    [],
  );

  const loadLevels = useCallback(async () => {
    const res = await fetch("/api/levels");
    const data = await res.json();
    setLevels(data.levels ?? []);
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
      // eslint-disable-next-line react-hooks/set-state-in-effect
      loadCard(mode);
    } else {
      setMode("level");
      setSelectedLevelId(LEVEL_ORDER[0]);
      loadCard("level", LEVEL_ORDER[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionLoading]);

  async function handleModeChange(value: string) {
    if (value === "auto" || value === "weak") {
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

    const res = await fetch("/api/progress", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cardId: card.id, score }),
    });
    const result = await res.json();

    setCard((prev) =>
      prev ? { ...prev, confidence: result.confidence } : prev,
    );

    if (result.leveledUp && result.newLevelId) {
      showToast(
        `Level unlocked: ${LEVEL_LABELS[result.newLevelId] ?? result.newLevelId}!`,
      );
      loadLevels();
    } else {
      showToast(`Mastery Level: ${Math.round(result.confidence)}/5`);
    }

    // Brief pause so the selected score is visible before advancing.
    setTimeout(() => loadCard(mode, selectedLevelId), 600);
  }

  function handleSkip() {
    if (isAuthed) {
      loadCard(mode, selectedLevelId);
    } else {
      loadCard("level", selectedLevelId);
    }
  }

  async function handleResetConfirm() {
    setShowResetModal(false);
    await fetch("/api/progress/reset", { method: "POST" });
    showToast("Progress reset successfully");
    await loadLevels();
    setMode("auto");
    setSelectedLevelId(undefined);
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

        <FlashCard
          card={card}
          loading={loading}
          revealed={revealed}
          onReveal={() => setRevealed(true)}
        />

        <div className="px-6 pb-6 md:px-8 md:pb-8">
          {isAuthed ? (
            revealed && (
              <FeedbackButtons
                disabled={loading || !card}
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

          <div className="mt-5 flex justify-center">
            <button
              onClick={handleSkip}
              disabled={loading || !card}
              className="flex items-center gap-1 text-sm font-medium text-gray-400 transition-colors hover:text-gray-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Skip <i className="fas fa-forward" />
            </button>
          </div>
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
