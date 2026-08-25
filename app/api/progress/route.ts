import { NextRequest, NextResponse } from "next/server";

import { requireUserId } from "@/lib/auth/requireUserId";
import { submitProgress } from "@/lib/db/queries";
import { VALID_MODES, type PracticeMode } from "@/types";

export async function POST(request: NextRequest) {
  const userId = await requireUserId();
  if (userId instanceof NextResponse) return userId;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { cardId, score, mode } = (body ?? {}) as {
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

  try {
    const result = await submitProgress(userId, cardId, score, practiceMode);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof Error && err.message === "Card not found") {
      return NextResponse.json({ error: "Card not found" }, { status: 404 });
    }
    throw err;
  }
}
