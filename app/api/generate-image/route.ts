import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import sharp from "sharp";
import { nanoid } from "nanoid";
import { auth, getUserKey } from "@/lib/auth";
import { redis } from "@/lib/redis";
import { getSlot, SLOTS, type SlotId } from "@/lib/imageSlots";
import { replaceSlotSrc, isAllowedImageUrl } from "@/lib/siteImages";
import { generateImage } from "@/lib/imageGen";
import { spend, isWalletLive, WALLET_SITE_ID } from "@/lib/wallet";

export const runtime = "nodejs";
export const maxDuration = 60; // AI image gen can take 10-30s

const VALID_SLOT_IDS = new Set<string>(SLOTS.map((s) => s.id));
const COST_POINTS = 10;

/**
 * POST /api/generate-image
 * Body: { siteId: string, slotId: SlotId, prompt: string }
 *
 * Paid-only "AI image generation" endpoint. The user provides a text
 * prompt describing what they want, and we:
 *   1. Verify auth, ownership, paid status
 *   2. Charge 10 wallet points via s2s/spend
 *   3. Call Gemini to generate the image
 *   4. Process with sharp (crop to slot aspect ratio)
 *   5. Upload to Vercel Blob
 *   6. Rewrite stored HTML (same as /api/replace-image)
 *   7. Return the new URL
 *
 * If image generation fails AFTER the spend, we do NOT refund
 * automatically — the user can retry (the spend idempotency key
 * includes a timestamp so each attempt is a fresh charge). This is
 * simpler than managing refund flows and at 10 pts the user impact is
 * minimal. If it becomes a pattern we can add auto-refund later.
 */
export async function POST(req: Request) {
  const session = await auth();
  const userKey = getUserKey(session);
  if (!userKey) {
    return NextResponse.json({ error: "請先登入" }, { status: 401 });
  }

  let siteId: string;
  let slotId: string;
  let prompt: string;
  try {
    const body = (await req.json()) as {
      siteId?: string;
      slotId?: string;
      prompt?: string;
    };
    if (!body.siteId || !body.slotId || !body.prompt?.trim()) {
      throw new Error("missing fields");
    }
    siteId = body.siteId;
    slotId = body.slotId;
    prompt = body.prompt.trim();
  } catch {
    return NextResponse.json(
      { error: "請提供 siteId、slotId 與 prompt" },
      { status: 400 },
    );
  }

  if (!VALID_SLOT_IDS.has(slotId)) {
    return NextResponse.json({ error: "無效的圖片位置" }, { status: 400 });
  }
  if (prompt.length > 500) {
    return NextResponse.json(
      { error: "圖片描述太長,最多 500 字" },
      { status: 400 },
    );
  }

  // Load meta + verify ownership + paid
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
      { error: "免費預覽無法使用 AI 圖片生成,請先付款解鎖" },
      { status: 403 },
    );
  }

  // Get wallet UID from session
  const uid = getWalletUid(session);

  if (!uid && isWalletLive()) {
    return NextResponse.json(
      { error: "找不到你的錢包帳號,請重新登入" },
      { status: 400 },
    );
  }

  // 1. Charge wallet points
  const idempotencyKey = `cteater_${WALLET_SITE_ID}_img_${siteId}_${slotId}_${Date.now()}`;
  if (uid && isWalletLive()) {
    try {
      await spend({
        uid,
        amount: COST_POINTS,
        reason: `AI 圖片生成 (${slotId})`,
        idempotencyKey,
        refOrderId: siteId,
        metadata: { siteId, slotId, prompt: prompt.slice(0, 100) },
      });
    } catch (err) {
      const code = (err as { code?: string })?.code;
      if (code === "INSUFFICIENT_BALANCE") {
        return NextResponse.json(
          { error: `點數不足,AI 圖片生成需要 ${COST_POINTS} 點` },
          { status: 402 },
        );
      }
      if (code === "ACCOUNT_NOT_ACTIVE") {
        return NextResponse.json(
          { error: "你的帳號已被凍結,請聯繫客服" },
          { status: 403 },
        );
      }
      console.error("[generate-image] wallet spend failed:", err);
      return NextResponse.json(
        { error: "扣點失敗,請稍後再試" },
        { status: 502 },
      );
    }
  } else {
    // Stub mode — wallet not configured, skip payment
    console.warn("[generate-image] wallet stub mode — skipping spend");
  }

  // 2. Generate image
  const slot = getSlot(slotId as SlotId);
  const aspectRatio = slot.aspectRatio >= 1.7
    ? "16:9"
    : slot.aspectRatio >= 1.2
      ? "4:3"
      : slot.aspectRatio <= 0.8
        ? "3:4"
        : "1:1";

  let imageBuffer: Buffer;
  try {
    const result = await generateImage({
      prompt,
      aspectRatio: aspectRatio as "16:9" | "4:3" | "1:1" | "3:4",
    });
    imageBuffer = result.buffer;
  } catch (err) {
    console.error("[generate-image] AI generation failed:", err);
    return NextResponse.json(
      {
        error: "AI 圖片生成失敗,請換個描述再試。點數已扣除,無法退回。",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 502 },
    );
  }

  // 3. Process with sharp (crop to exact slot dimensions)
  let processedBuffer: Buffer;
  try {
    processedBuffer = await sharp(imageBuffer)
      .resize({
        width: slot.targetWidth,
        height: slot.targetHeight,
        fit: "cover",
        position: "centre",
      })
      .jpeg({ quality: 82, progressive: true, mozjpeg: true })
      .toBuffer();
  } catch (err) {
    console.error("[generate-image] sharp failed:", err);
    return NextResponse.json(
      { error: "圖片處理失敗" },
      { status: 500 },
    );
  }

  // 4. Upload to Vercel Blob
  const safeUser = (session?.user?.email ?? "anon")
    .replace(/[^a-z0-9]/gi, "_")
    .slice(0, 40);
  const pathname = `ai-gen/${safeUser}/${slotId}-${nanoid(8)}.jpg`;

  let blobUrl: string;
  try {
    const blob = await put(pathname, processedBuffer, {
      access: "public",
      contentType: "image/jpeg",
      cacheControlMaxAge: 60 * 60 * 24 * 365,
    });
    blobUrl = blob.url;
  } catch (err) {
    console.error("[generate-image] blob upload failed:", err);
    return NextResponse.json(
      { error: "圖片上傳失敗,請稍後再試" },
      { status: 502 },
    );
  }

  // 5. Rewrite stored HTML
  const html = await redis.get<string>(`site:${siteId}`);
  if (!html) {
    return NextResponse.json(
      { error: "網站內容已遺失" },
      { status: 404 },
    );
  }

  if (!isAllowedImageUrl(blobUrl)) {
    // Should never happen — Vercel Blob URLs should always pass. Log + skip.
    console.error("[generate-image] blob URL failed allowlist check:", blobUrl);
  }

  const { html: rewritten, replaced } = replaceSlotSrc(html, slotId, blobUrl);
  if (replaced > 0) {
    await redis.set(`site:${siteId}`, rewritten);
  }

  console.log("[generate-image]", {
    siteId,
    slotId,
    userKey,
    cost: COST_POINTS,
    replaced,
    promptLen: prompt.length,
  });

  return NextResponse.json({
    ok: true,
    url: blobUrl,
    slotId,
    cost: COST_POINTS,
    replaced,
  });
}

/**
 * Extract walletUid from the Auth.js session. The jwt callback stores
 * it on the token; it surfaces as session.walletUid or session.user.walletUid
 * depending on how the session callback maps it.
 */
function getWalletUid(session: unknown): string | undefined {
  if (!session || typeof session !== "object") return undefined;
  const s = session as Record<string, unknown>;
  if (typeof s.walletUid === "string") return s.walletUid;
  const user = s.user as Record<string, unknown> | undefined;
  if (typeof user?.walletUid === "string") return user.walletUid;
  return undefined;
}
