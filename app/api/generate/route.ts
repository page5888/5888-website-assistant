import { NextResponse } from "next/server";
import { z } from "zod";
import { nanoid } from "nanoid";
import { auth, getUserKey } from "@/lib/auth";
import {
  dailyLimit,
  ipDailyLimit,
  LIFETIME_FREE_KEY,
  TTL,
} from "@/lib/ratelimit";
import { redis } from "@/lib/redis";
import { generateSiteHtml, type ClaudeModelChoice } from "@/lib/anthropic";
import { collectImages } from "@/lib/images/collect";
import { injectWatermark } from "@/lib/watermark";

const BodySchema = z.object({
  storeName: z.string().min(1).max(100),
  sourceUrl: z.string().url().optional().or(z.literal("")),
  fbUrl: z.string().url().optional().or(z.literal("")),
  industryHint: z.string().max(100).optional(),
  address: z.string().max(200).optional(),
  phone: z.string().max(30).optional(),
  model: z.enum(["sonnet", "opus"]).default("sonnet"),
  userImages: z.array(z.string()).max(10).optional(),
});

export const runtime = "nodejs";
export const maxDuration = 300; // 5 min — Claude generation can take a while

/**
 * Extract the best-guess client IP from the Vercel / proxy headers.
 */
function getClientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  return "unknown";
}

export async function POST(req: Request) {
  // 1. Auth
  const session = await auth();
  const userKey = getUserKey(session);
  if (!userKey) {
    return NextResponse.json({ error: "請先登入" }, { status: 401 });
  }

  const hasRedis =
    !!process.env.UPSTASH_REDIS_REST_URL &&
    !!process.env.UPSTASH_REDIS_REST_TOKEN;

  // 2. Pre-check (NOT consume) — lifetime free quota.
  //    We use a plain counter so we can increment only on success.
  if (hasRedis) {
    const used = (await redis.get<number>(LIFETIME_FREE_KEY(userKey))) ?? 0;
    if (used >= 1) {
      return NextResponse.json(
        {
          error:
            "您的免費生成次數已用完。升級為完整版(NT$490)即可解鎖永久保留、下載與部署。",
          code: "lifetime_quota_exceeded",
        },
        { status: 402 },
      );
    }

    // 3. IP daily limit (cheap abuse shield — 5 req/IP/day)
    const ip = getClientIp(req);
    const ipRes = await ipDailyLimit.limit(`ip:${ip}`);
    if (!ipRes.success) {
      return NextResponse.json(
        { error: "今日此 IP 已達生成次數上限,請明日再試" },
        { status: 429 },
      );
    }

    // 4. Per-account daily throttle (1/day, rolling) — also consumed up-front
    //    because it refills automatically in 24h even after a Claude failure.
    //    This prevents "rapid-fire retry on failure" abuse.
    const dailyRes = await dailyLimit.limit(userKey);
    if (!dailyRes.success) {
      const hours = Math.ceil((dailyRes.reset - Date.now()) / (60 * 60 * 1000));
      return NextResponse.json(
        { error: `今日已嘗試過生成,請 ${hours} 小時後再試` },
        { status: 429 },
      );
    }
  }

  // 5. Validate body
  let input: z.infer<typeof BodySchema>;
  try {
    const json = await req.json();
    input = BodySchema.parse(json);
  } catch (err) {
    return NextResponse.json(
      { error: "表單資料不正確", detail: String(err) },
      { status: 400 },
    );
  }

  // 6. Collect images (parallel-friendly, falls back gracefully)
  const { images, sources } = await collectImages({
    userImages: input.userImages,
    fbUrl: input.fbUrl || undefined,
    industryHint: input.industryHint || input.storeName,
    storeName: input.storeName,
    target: 8,
  });

  // 7. Call Claude
  let rawHtml: string;
  try {
    rawHtml = await generateSiteHtml({
      storeName: input.storeName,
      sourceUrl: input.sourceUrl || undefined,
      fbUrl: input.fbUrl || undefined,
      industryHint: input.industryHint,
      address: input.address,
      phone: input.phone,
      images,
      model: input.model as ClaudeModelChoice,
    });
  } catch (err) {
    console.error("[generate] claude error", err);
    const msg = err instanceof Error ? err.message : String(err);
    const isCredit = msg.toLowerCase().includes("credit balance");
    return NextResponse.json(
      {
        error: isCredit
          ? "AI 服務暫時不可用(credit 不足),請聯繫管理員"
          : "AI 生成失敗,請稍後再試",
        detail: msg,
      },
      { status: 502 },
    );
  }

  // 8. Only now do we COMMIT the lifetime free quota — Claude succeeded.
  if (hasRedis) {
    await redis.incr(LIFETIME_FREE_KEY(userKey));
  }

  // 9. Inject watermark (free-tier always gets watermarked; paid users
  //    will get the clean HTML served from the stored "clean" key).
  const watermarkedHtml = injectWatermark(rawHtml);

  // 10. Store in Redis — 24 hour TTL for free tier. On successful payment
  //     we'll re-set these keys WITHOUT TTL to make them permanent.
  const siteId = nanoid(12);
  if (hasRedis) {
    // Watermarked version for preview / free view
    await redis.set(`site:${siteId}`, watermarkedHtml, { ex: TTL.FREE_SITE });
    // Clean version (no watermark) — unlocked after payment
    await redis.set(`site:${siteId}:clean`, rawHtml, { ex: TTL.FREE_SITE });
    // Metadata
    await redis.set(
      `site:${siteId}:meta`,
      JSON.stringify({
        storeName: input.storeName,
        createdAt: Date.now(),
        expiresAt: Date.now() + TTL.FREE_SITE * 1000,
        imageSources: sources,
        model: input.model,
        owner: userKey,
        paid: false,
      }),
      { ex: TTL.FREE_SITE },
    );
  }

  return NextResponse.json({
    siteId,
    previewUrl: `/preview/${siteId}`,
    imageSources: sources,
    expiresAt: Date.now() + TTL.FREE_SITE * 1000,
  });
}
