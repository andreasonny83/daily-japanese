import { NextResponse } from "next/server";

import { requireUserId } from "@/lib/auth/requireUserId";
import { getStreak } from "@/lib/db/queries";

export async function GET() {
  const userId = await requireUserId();
  if (userId instanceof NextResponse) return userId;

  const streak = await getStreak(userId);
  return NextResponse.json(streak);
}
