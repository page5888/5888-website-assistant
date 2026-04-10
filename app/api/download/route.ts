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

  return new NextResponse(finalHtml, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": `attachment; filename="${sanitizeFilename(
        (meta.storeName as string) ?? "site",
      )}.html"`,
    },
  });
}

function sanitizeFilename(name: string): string {
  return name
    .replace(/[^\p{L}\p{N}_-]+/gu, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 50) || "site";
}
