import { NextRequest, NextResponse } from "next/server";

import { getCurrentUserId } from "@/lib/auth/session";
import { getNextCard, getRandomCardForLevel } from "@/lib/db/queries";
import { LEVEL_ORDER, type LevelId, type PracticeMode } from "@/types";

const VALID_MODES: PracticeMode[] = ["auto", "level", "weak"];

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;

  const levelIdParam = searchParams.get("levelId");
  const levelId = LEVEL_ORDER.includes(levelIdParam as LevelId)
    ? (levelIdParam as LevelId)
    : undefined;

  const userId = await getCurrentUserId();

  if (!userId) {
    // Guests can browse any level, but nothing is tracked or gated.
    const card = await getRandomCardForLevel(levelId ?? LEVEL_ORDER[0]);
    return NextResponse.json({ card });
  }

  const modeParam = searchParams.get("mode") ?? "auto";
  const mode = VALID_MODES.includes(modeParam as PracticeMode)
    ? (modeParam as PracticeMode)
    : "auto";

  const card = await getNextCard(userId, mode, levelId);
  return NextResponse.json({ card });
}
