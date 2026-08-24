import { NextResponse } from "next/server";

import { getCurrentUserId } from "@/lib/auth/session";
import { resetProgress } from "@/lib/db/queries";

export async function POST() {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  await resetProgress(userId);
  return NextResponse.json({ ok: true });
}
