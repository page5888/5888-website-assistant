import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { redis } from "@/lib/redis";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) {
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
  const meta = typeof metaRaw === "string" ? JSON.parse(metaRaw) : metaRaw;

  if (!meta.paid) {
    return NextResponse.json({ error: "尚未付款" }, { status: 402 });
  }

  const html = await redis.get<string>(`site:${siteId}`);
  if (!html) {
    return NextResponse.json({ error: "HTML 已過期" }, { status: 404 });
  }

  return new NextResponse(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": `attachment; filename="${sanitizeFilename(
        meta.storeName ?? "site",
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
