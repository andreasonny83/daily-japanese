import { NextRequest, NextResponse } from "next/server";

const GOOGLE_TTS_URL = "https://translate.google.com/translate_tts";
// Google's unofficial TTS endpoint rejects requests without a browser-like UA.
const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// Longest realistic card field (kana/kanji) is well under this; anything
// longer is someone abusing this route as a free proxy to Google TTS.
const MAX_TEXT_LENGTH = 200;

const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 30;
// Best-effort per-instance throttle only: this in-memory map doesn't
// coordinate across serverless instances (e.g. Vercel runs many isolated
// Lambda instances, each with its own memory), so it won't enforce a true
// global per-IP quota. A real global limit needs external state (e.g.
// Redis/Upstash) — out of scope unless abuse is actually observed.
const requestLog = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = requestLog.get(ip);
  if (!entry || now >= entry.resetAt) {
    requestLog.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_LIMIT_MAX_REQUESTS;
}

export async function GET(request: NextRequest) {
  const text = request.nextUrl.searchParams.get("text");
  if (!text) {
    return NextResponse.json(
      { error: "Missing text parameter" },
      { status: 400 },
    );
  }
  if (text.length > MAX_TEXT_LENGTH) {
    return NextResponse.json({ error: "Text too long" }, { status: 400 });
  }

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (isRateLimited(ip)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const url = `${GOOGLE_TTS_URL}?ie=UTF-8&tl=ja&client=tw-ob&q=${encodeURIComponent(text)}`;

  let upstream: Response;
  try {
    upstream = await fetch(url, {
      headers: { "User-Agent": BROWSER_USER_AGENT },
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch audio" },
      { status: 502 },
    );
  }

  if (!upstream.ok || !upstream.body) {
    return NextResponse.json(
      { error: "Failed to fetch audio" },
      { status: 502 },
    );
  }

  return new NextResponse(upstream.body, {
    headers: {
      "Content-Type": upstream.headers.get("Content-Type") ?? "audio/mpeg",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
