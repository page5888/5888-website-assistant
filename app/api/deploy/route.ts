import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { redis } from "@/lib/redis";
import { deployHtmlToPages } from "@/lib/github";

export const maxDuration = 120;

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "請先登入" }, { status: 401 });
  }

  const { siteId } = (await req.json()) as { siteId?: string };
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

  try {
    const result = await deployHtmlToPages(html, meta.storeName ?? "site");
    // Cache the deploy result on meta for potential re-queries
    meta.deploy = result;
    await redis.set(`site:${siteId}:meta`, JSON.stringify(meta), { ex: 3600 });
    return NextResponse.json(result);
  } catch (err) {
    console.error("[deploy] error", err);
    return NextResponse.json(
      { error: "部署失敗", detail: String(err) },
      { status: 500 },
    );
  }
}
