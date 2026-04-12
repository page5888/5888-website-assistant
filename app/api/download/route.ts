import { NextResponse } from "next/server";
import { auth, getUserKey } from "@/lib/auth";
import { redis } from "@/lib/redis";
import { stripWatermark } from "@/lib/watermark";

export async function GET(req: Request) {
  const session = await auth();
  const userKey = getUserKey(session);
  if (!userKey) {
    return NextResponse.json({ error: "請先登入" }, { status: 401 });
  }

  const url = new URL(req.url);
  const siteId = url.searchParams.get("siteId");
  if (!siteId) {
    return NextResponse.json({ error: "缺少 siteId" }, { status: 400 });
  }

  const metaRaw = await redis.get<string>(`site:${siteId}:meta`);
  if (!metaRaw) {
    return NextResponse.json({ error: "預覽已過期" }, { status: 404 });
  }
  const meta =
    typeof metaRaw === "string" ? JSON.parse(metaRaw) : (metaRaw as Record<string, unknown>);

  // Ownership check
  if (meta.owner && meta.owner !== userKey) {
    return NextResponse.json({ error: "無權限下載此網站" }, { status: 403 });
  }

  if (!meta.paid) {
    return NextResponse.json(
      { error: "尚未付款,請先完成付款才能下載" },
      { status: 402 },
    );
  }

  const html = await redis.get<string>(`site:${siteId}`);
  if (!html) {
    return NextResponse.json({ error: "HTML 已過期" }, { status: 404 });
  }

  // Always strip watermark on download (even if the notify callback
  // already removed it, this is a safety net for paid users).
  const finalHtml = stripWatermark(html);

  const storeName = (meta.storeName as string) ?? "site";

  return new NextResponse(finalHtml, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": buildContentDisposition(`${storeName}.html`),
    },
  });
}

/**
 * Build a Content-Disposition header that handles non-ASCII filenames
 * safely. HTTP headers are ByteStrings — raw Chinese (or any >U+00FF)
 * characters throw `TypeError: Cannot convert argument to a ByteString`
 * when passed to `new Response(..., { headers })`.
 *
 * RFC 6266 / RFC 5987 says: provide an ASCII-only `filename=` as a
 * fallback, plus `filename*=UTF-8''<percent-encoded>` as the preferred
 * value. All modern browsers honor the `filename*=` form and render the
 * original name (e.g. "幸福瓢蟲手作雜貨.html") on the save dialog.
 */
function buildContentDisposition(filename: string): string {
  const asciiFallback =
    filename
      // Replace anything outside basic safe ASCII with `_`, keep the dot
      // so the extension survives.
      .replace(/[^\x20-\x7E]+/g, "_")
      .replace(/["\\]/g, "_")
      .slice(0, 80) || "site.html";
  const utf8Encoded = encodeURIComponent(filename);
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${utf8Encoded}`;
}
