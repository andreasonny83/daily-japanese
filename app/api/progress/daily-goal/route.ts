import { NextResponse } from "next/server";

import { getCurrentUserId } from "@/lib/auth/session";
import { getDailyNewCardProgress } from "@/lib/db/queries";

export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const progress = await getDailyNewCardProgress(userId);
  return NextResponse.json(progress);
}
