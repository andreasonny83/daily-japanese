"use client";

import { useEffect, useRef, useState } from "react";

import { formatNextAvailable } from "@/lib/format";
import type { CardWithProgress } from "@/types";

export function FlashCard({
  card,
  loading,
  revealed,
  onReveal,
  caughtUp = false,
  sessionComplete = false,
  onPullAhead,
  emptyMessage,
  nextAvailableAt,
}: {
  card: CardWithProgress | null;
  loading: boolean;
  revealed: boolean;
  onReveal: () => void;
  caughtUp?: boolean;
  sessionComplete?: boolean;
  onPullAhead?: () => void;
  emptyMessage?: string;
  nextAvailableAt?: string | null;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playState, setPlayState] = useState<"idle" | "playing" | "error">(
    "idle",
  );

  // Synchronizes the imperative Audio element (an external system, not a
  // rendered value) with the current card prop — this is exactly the case
  // effects are for, per https://react.dev/learn/synchronizing-with-effects.
  useEffect(() => {
    audioRef.current?.pause();
    audioRef.current = null;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPlayState("idle");
  }, [card?.id]);

  function playAudio() {
    if (!card) return;
    if (audioRef.current && !audioRef.current.paused) return;

    if (!audioRef.current) {
      const audio = new Audio(`/api/tts?text=${encodeURIComponent(card.kana)}`);
      audio.onplaying = () => setPlayState("playing");
      audio.onended = () => setPlayState("idle");
      audio.onerror = () => setPlayState("error");
      audioRef.current = audio;
    }

    audioRef.current.play().catch(() => setPlayState("error"));
  }

  function handlePlayClick() {
    if (!card) return;
    if (audioRef.current && !audioRef.current.paused) {
      audioRef.current.pause();
      setPlayState("idle");
      return;
    }
    playAudio();
  }

  function handleReveal() {
    onReveal();
    // Called synchronously from the click/keydown handler so it stays
    // inside the browser's user-activation window, letting autoplay succeed.
    playAudio();
  }

  // Spacebar reveals the card, same as clicking "Reveal Japanese" — but not
  // while typing into an actual input/textarea, and not while re-pressed
  // (browsers auto-repeat keydown, which would replay the reveal/audio).
  useEffect(() => {
    if (loading || !card || revealed) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== " " || e.repeat) return;
      const target = e.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
        return;
      e.preventDefault();
      handleReveal();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, card, revealed]);

  const playLabel =
    playState === "playing"
      ? "Playing..."
      : playState === "error"
        ? "Error"
        : "Listen";

  if (!loading && !card && sessionComplete) {
    return (
      <div className="w-full p-6 text-center md:p-8">
        <p className="mb-1 text-sm font-semibold text-gray-700">
          <i className="fas fa-trophy mr-1 text-amber-500" />
          Session complete!
        </p>
        <p className="text-sm text-gray-500">
          Great work — come back later for another round.
        </p>
      </div>
    );
  }

  if (!loading && !card && caughtUp) {
    return (
      <div className="w-full p-6 text-center md:p-8">
        <p className="mb-3 text-sm text-gray-500">
          <i className="fas fa-check-circle mr-1 text-green-500" />
          All caught up! Nothing due right now.
        </p>
        {nextAvailableAt && (
          <p className="mb-3 text-xs text-gray-400">
            {formatNextAvailable(nextAvailableAt)}
          </p>
        )}
        {onPullAhead && (
          <button
            onClick={onPullAhead}
            className="rounded-full border border-gray-200 bg-gray-50 px-4 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-100"
          >
            Review early anyway
          </button>
        )}
      </div>
    );
  }

  if (!loading && !card) {
    return (
      <div className="w-full p-6 text-center md:p-8">
        <p className="text-sm text-gray-500">
          {emptyMessage ??
            "Nothing to show here yet. Try a different level or mode."}
        </p>
      </div>
    );
  }

  return (
    <div className="relative w-full flex-col justify-center p-6 md:p-8">
      {revealed && (
        <div className="absolute right-4 top-4 flex items-center gap-2 md:right-6 md:top-6">
          {card && (
            <span className="rounded border border-gray-200 bg-gray-50 px-2 py-0.5 text-[10px] font-semibold text-gray-600 md:text-xs">
              <i className="fas fa-brain mr-1 text-purple-400" />
              {card.intervalDays > 0
                ? `${card.intervalDays}d`
                : card.isReview
                  ? "Learning"
                  : "New"}
            </span>
          )}
          {card?.accuracy !== null && card?.accuracy !== undefined && (
            <span className="rounded border border-gray-200 bg-gray-50 px-2 py-0.5 text-[10px] font-semibold text-gray-600 md:text-xs">
              <i className="fas fa-bullseye mr-1 text-emerald-500" />
              {card.accuracy}% accuracy
            </span>
          )}
          {card?.isReview && (
            <span className="rounded-full border border-indigo-200 bg-indigo-100 px-2 py-0.5 text-[10px] font-semibold text-indigo-800 md:text-xs">
              Review
            </span>
          )}
          {card?.grammarPoint && (
            <span className="rounded-full border border-red-200 bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-800 md:text-xs">
              {card.grammarPoint}
            </span>
          )}
        </div>
      )}

      <h2 className="mb-2 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-500 md:mb-3 md:text-xs">
        {card?.type === "vocab" ? "Word to translate" : "Sentence to translate"}
      </h2>

      <div className="mb-5">
        <p className="min-h-[40px] text-2xl font-bold leading-tight text-gray-900 md:text-3xl">
          {loading || !card ? (
            <span className="skeleton inline-block h-8 w-3/4 rounded bg-gray-200" />
          ) : (
            card.english
          )}
        </p>
      </div>

      {!loading && card && !revealed && (
        <button
          onClick={handleReveal}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 py-3 text-sm font-semibold text-red-600 shadow-sm transition-colors hover:bg-red-100"
        >
          <i className="fas fa-eye" />
          Reveal Japanese
          <kbd className="ml-1 rounded border border-red-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-red-400">
            Space
          </kbd>
        </button>
      )}

      {revealed && card && (
        <>
          <div className="mb-4">
            <p className="japanese-text mb-2 min-h-[40px] text-2xl font-bold leading-tight text-gray-900 md:text-3xl">
              {card.kanji}
            </p>
            <button
              onClick={handlePlayClick}
              aria-label={`${playLabel} pronunciation`}
              className="mt-1 inline-flex items-center gap-2 rounded-full bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600 shadow-sm transition-colors hover:bg-red-100"
            >
              <i
                className={`fas ${playState === "playing" ? "fa-pause" : "fa-volume-up"}`}
              />
              <span aria-live="polite">{playLabel}</span>
            </button>
          </div>

          <div className="mb-4 rounded-xl border border-gray-100 bg-gray-50 p-4">
            <div className="mb-3">
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-gray-400 md:text-xs">
                Kana (Hiragana/Katakana)
              </span>
              <p className="japanese-text min-h-[24px] text-base text-gray-700 md:text-lg">
                {card.kana}
              </p>
            </div>
            <div>
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-gray-400 md:text-xs">
                Romaji
              </span>
              <p className="min-h-[24px] text-base italic text-gray-700 md:text-lg">
                {card.romaji}
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
