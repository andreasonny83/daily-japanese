import { NextRequest, NextResponse } from "next/server";

import { requireUserId } from "@/lib/auth/requireUserId";
import { resetProgress } from "@/lib/db/queries";

export async function POST(request: NextRequest) {
  const userId = await requireUserId();
  if (userId instanceof NextResponse) return userId;

  // Wipes all progress irreversibly. The session cookie is already
  // SameSite=Lax (blocks the classic cross-site form-POST CSRF vector), but
  // this custom header is cheap defense-in-depth: only same-origin
  // script-driven fetch/XHR can set it, a plain cross-site form POST can't.
  if (request.headers.get("X-Confirm-Reset") !== "1") {
    return NextResponse.json(
      { error: "Missing confirmation header" },
      { status: 400 },
    );
  }

  await resetProgress(userId);
  return NextResponse.json({ ok: true });
}
