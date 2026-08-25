import { NextResponse } from "next/server";

import { getCurrentUserId } from "@/lib/auth/session";
import {
  getLevels,
  getLevelsPublic,
  getWeakCards,
  WEAK_CARDS_LIST_LIMIT,
} from "@/lib/db/queries";

export async function GET() {
  const userId = await getCurrentUserId();

  if (!userId) {
    const levels = await getLevelsPublic();
    return NextResponse.json({ levels, weakCards: [] });
  }

  const [levels, weakCards] = await Promise.all([
    getLevels(userId),
    getWeakCards(userId, WEAK_CARDS_LIST_LIMIT),
  ]);
  return NextResponse.json({ levels, weakCards });
}
