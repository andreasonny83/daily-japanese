import { NextRequest, NextResponse } from "next/server";

import { getCurrentUserId } from "@/lib/auth/session";
import { submitProgress } from "@/lib/db/queries";

export async function POST(request: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const body = await request.json();
  const { cardId, score } = body as { cardId?: string; score?: number };

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

  const result = await submitProgress(userId, cardId, score);
  return NextResponse.json(result);
}
