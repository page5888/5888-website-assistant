import { NextResponse } from "next/server";

/**
 * Lightweight server-side proxy to check if a GitHub Pages URL is live.
 * The client can't HEAD github.io directly due to CORS, so we do it
 * server-side and return { live: boolean }.
 *
 * Only allows checking page5888.github.io URLs to prevent abuse.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const url = searchParams.get("url");

  if (!url || !url.startsWith("https://page5888.github.io/")) {
    return NextResponse.json({ live: false, error: "invalid url" }, { status: 400 });
  }

  try {
    const res = await fetch(url, {
      method: "HEAD",
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    // GitHub Pages returns 200 when live, 404 during build
    return NextResponse.json({ live: res.ok });
  } catch {
    return NextResponse.json({ live: false });
  }
}
