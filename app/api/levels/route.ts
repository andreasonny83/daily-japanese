import { NextResponse } from "next/server";

import { getCurrentUserId } from "@/lib/auth/session";
import { getLevels, getLevelsPublic, getWeakCards } from "@/lib/db/queries";

export async function GET() {
  const userId = await getCurrentUserId();

  if (!userId) {
    const levels = await getLevelsPublic();
    return NextResponse.json({ levels, weakCards: [] });
  }

  const [levels, weakCards] = await Promise.all([
    getLevels(userId),
    getWeakCards(userId, 10),
  ]);
  return NextResponse.json({ levels, weakCards });
}
