import { NextRequest, NextResponse } from "next/server";

const GOOGLE_TTS_URL = "https://translate.google.com/translate_tts";
// Google's unofficial TTS endpoint rejects requests without a browser-like UA.
const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export async function GET(request: NextRequest) {
  const text = request.nextUrl.searchParams.get("text");
  if (!text) {
    return NextResponse.json(
      { error: "Missing text parameter" },
      { status: 400 },
    );
  }

  const url = `${GOOGLE_TTS_URL}?ie=UTF-8&tl=ja&client=tw-ob&q=${encodeURIComponent(text)}`;

  const upstream = await fetch(url, {
    headers: { "User-Agent": BROWSER_USER_AGENT },
  });

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
