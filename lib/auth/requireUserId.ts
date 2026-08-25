import { NextResponse } from "next/server";

import { getCurrentUserId } from "./session";

/**
 * For routes where a guest request is an error, not a valid guest path
 * (contrast /api/cards/next and /api/levels, which treat a null userId as
 * "browse as guest" and handle it themselves).
 */
export async function requireUserId(): Promise<string | NextResponse> {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  return userId;
}
