import { NextResponse } from "next/server";

import { requireUserId } from "@/lib/auth/requireUserId";
import { getDailyNewCardProgress } from "@/lib/db/queries";

export async function GET() {
  const userId = await requireUserId();
  if (userId instanceof NextResponse) return userId;

  const progress = await getDailyNewCardProgress(userId);
  return NextResponse.json(progress);
}
