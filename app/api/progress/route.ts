import { NextRequest, NextResponse } from "next/server";

import { getCurrentUserId } from "@/lib/auth/session";
import { submitProgress } from "@/lib/db/queries";
import type { PracticeMode } from "@/types";

const VALID_MODES: PracticeMode[] = ["auto", "level", "weak", "review"];

export async function POST(request: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const body = await request.json();
  const { cardId, score, mode } = body as {
    cardId?: string;
    score?: number;
    mode?: string;
  };

  if (
    typeof cardId !== "string" ||
    typeof score !== "number" ||
    score < 0 ||
    score > 5
  ) {
    return NextResponse.json(
      { error: "Invalid cardId or score" },
      { status: 400 },
    );
  }

  const practiceMode = VALID_MODES.includes(mode as PracticeMode)
    ? (mode as PracticeMode)
    : "auto";

  const result = await submitProgress(userId, cardId, score, practiceMode);
  return NextResponse.json(result);
}
