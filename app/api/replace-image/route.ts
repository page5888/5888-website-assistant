import { NextResponse } from "next/server";
import { auth, getUserKey } from "@/lib/auth";
import { redis } from "@/lib/redis";
import { replaceSlotSrc, isAllowedImageUrl } from "@/lib/siteImages";
import { SLOTS, type SlotId } from "@/lib/imageSlots";

export const runtime = "nodejs";

const VALID_SLOT_IDS = new Set<string>(SLOTS.map((s) => s.id));

/**
 * POST /api/replace-image
 * Body: { siteId: string, slotId: SlotId, url: string }
 *
 * Paid-only "swap an image" endpoint. The user picks an image slot in
 * the post-payment UI, uploads a new file via the existing
 * /api/upload-image endpoint (which returns a Vercel Blob URL), then
 * calls this route to actually rewrite the stored HTML.
 *
 * Invariants:
 *   - caller must be logged in and own the site (meta.owner === userKey)
 *   - meta.paid must be true (free-tier sites should regenerate instead)
 *   - slotId must be a known slot
 *   - url must live on a Vercel Blob host (no arbitrary URLs — see
 *     isAllowedImageUrl for the rationale)
 *
 * Idempotent: calling with the same url twice is a no-op.
 */
export async function POST(req: Request) {
  const session = await auth();
  const userKey = getUserKey(session);
  if (!userKey) {
    return NextResponse.json({ error: "請先登入" }, { status: 401 });
  }

  let siteId: string;
  let slotId: string;
  let url: string;
  try {
    const body = (await req.json()) as {
      siteId?: string;
      slotId?: string;
      url?: string;
    };
    if (!body.siteId || !body.slotId || !body.url) {
      throw new Error("missing fields");
    }
    siteId = body.siteId;
    slotId = body.slotId;
    url = body.url;
  } catch {
    return NextResponse.json(
      { error: "請提供 siteId、slotId 與 url" },
      { status: 400 },
    );
  }

  if (!VALID_SLOT_IDS.has(slotId)) {
    return NextResponse.json({ error: "無效的圖片位置" }, { status: 400 });
  }
  if (!isAllowedImageUrl(url)) {
    return NextResponse.json(
      { error: "只接受本站上傳服務產生的圖片網址" },
      { status: 400 },
    );
  }

  // Load meta + HTML
  const metaRaw = await redis.get<string>(`site:${siteId}:meta`);
  if (!metaRaw) {
    return NextResponse.json({ error: "找不到此預覽" }, { status: 404 });
  }
  const meta =
    typeof metaRaw === "string"
      ? (JSON.parse(metaRaw) as Record<string, unknown>)
      : (metaRaw as Record<string, unknown>);

  if (meta.owner && meta.owner !== userKey) {
    return NextResponse.json({ error: "無權限操作此網站" }, { status: 403 });
  }
  if (meta.paid !== true) {
    return NextResponse.json(
      { error: "免費預覽無法使用圖片抽換,請先付款解鎖" },
      { status: 403 },
    );
  }

  const html = await redis.get<string>(`site:${siteId}`);
  if (!html) {
    return NextResponse.json(
      { error: "網站內容已遺失,請聯繫客服" },
      { status: 404 },
    );
  }

  const { html: rewritten, replaced } = replaceSlotSrc(html, slotId, url);
  if (replaced === 0) {
    return NextResponse.json(
      { error: `找不到位置 ${slotId} 的圖片標籤` },
      { status: 404 },
    );
  }

  // Paid sites have no TTL — overwrite in place.
  await redis.set(`site:${siteId}`, rewritten);

  console.log("[replace-image]", {
    siteId,
    slotId,
    replaced,
    userKey,
  });

  return NextResponse.json({
    ok: true,
    slotId: slotId as SlotId,
    url,
    replaced,
  });
}
