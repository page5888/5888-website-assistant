import { NextResponse } from "next/server";
import { z } from "zod";
import { nanoid } from "nanoid";
import { auth, getUserKey } from "@/lib/auth";
import {
  dailyLimit,
  ipDailyLimit,
  LIFETIME_FREE_KEY,
  LIFETIME_FREE_LIMIT,
  TTL,
} from "@/lib/ratelimit";
import { redis } from "@/lib/redis";
import { generateSiteHtml, type ClaudeModelChoice } from "@/lib/anthropic";
import { injectWatermark } from "@/lib/watermark";
import { SLOTS, MIN_REQUIRED_SLOTS, getSlot, type SlotId } from "@/lib/imageSlots";
import { recordUserSite } from "@/lib/userSites";

const VALID_SLOT_IDS = SLOTS.map((s) => s.id) as [SlotId, ...SlotId[]];

const ImageSlotSchema = z.object({
  slotId: z.enum(VALID_SLOT_IDS),
  url: z.string().url(),
  // promptRole / label are optional from the client — we look them up
  // from SLOTS anyway to prevent the client from smuggling arbitrary
  // text into the system prompt.
  promptRole: z.string().optional(),
  label: z.string().optional(),
});

const BodySchema = z.object({
  storeName: z.string().min(1).max(100),
  sourceUrl: z.string().url().optional().or(z.literal("")),
  fbUrl: z.string().url().optional().or(z.literal("")),
  industryHint: z.string().max(100).optional(),
  address: z.string().max(200).optional(),
  phone: z.string().max(30).optional(),
  model: z.enum(["sonnet", "opus"]).default("sonnet"),
  template: z.enum(["auto", "editorial", "bold"]).default("auto"),
  imageSlots: z
    .array(ImageSlotSchema)
    .min(MIN_REQUIRED_SLOTS, `至少需要 ${MIN_REQUIRED_SLOTS} 張必填照片`)
    .max(10),
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
    if (used >= LIFETIME_FREE_LIMIT) {
      return NextResponse.json(
        {
          error: `您的免費生成次數(${LIFETIME_FREE_LIMIT} 次)已用完。升級為完整版(NT$490)即可解鎖永久保留、下載與部署。`,
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

  // 6. Resolve slot metadata server-side from the canonical SLOTS config.
  //    The client sends { slotId, url }; we look up label/promptRole
  //    ourselves so the prompt can't be polluted by client-supplied text.
  const imageSlots = input.imageSlots.map((s) => {
    const def = getSlot(s.slotId);
    return {
      slotId: s.slotId,
      url: s.url,
      label: def.label,
      promptRole: def.promptRole,
    };
  });
  const sources = [`slots:${imageSlots.length}`];

  // 7. Call Claude — template mode or freeform mode
  let rawHtml: string;
  try {
    const templateId = input.template ?? "auto";
    // Always use template mode — more consistent design, better SEO
    const { generateWithTemplate } = await import("@/lib/anthropic");
    rawHtml = await generateWithTemplate({
      storeName: input.storeName,
      sourceUrl: input.sourceUrl || undefined,
      fbUrl: input.fbUrl || undefined,
      industryHint: input.industryHint,
      address: input.address,
      phone: input.phone,
      imageSlots,
      model: input.model as ClaudeModelChoice,
      templateId,
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

  // 10. Run SEO quality check on the generated HTML
  let seoReport: import("@/lib/seoChecker").SeoReport | null = null;
  try {
    const { runSeoCheck } = await import("@/lib/seoChecker");
    seoReport = runSeoCheck(rawHtml);
    if (seoReport.summary.fail > 0) {
      console.warn(
        `[generate] SEO check: ${seoReport.summary.fail} fails, ${seoReport.summary.warn} warns`,
        seoReport.results.filter((r) => r.level === "fail").map((r) => r.title),
      );
    }
  } catch (err) {
    console.error("[generate] SEO check failed to run:", err);
  }

  // 11. Store in Redis — 24 hour TTL for free tier. On successful payment
  //     we'll re-set these keys WITHOUT TTL to make them permanent.
  const siteId = nanoid(12);
  if (hasRedis) {
    // Watermarked version for preview / free view
    await redis.set(`site:${siteId}`, watermarkedHtml, { ex: TTL.FREE_SITE });
    // Clean version (no watermark) — unlocked after payment
    await redis.set(`site:${siteId}:clean`, rawHtml, { ex: TTL.FREE_SITE });
    // Metadata (includes SEO report summary for dashboard visibility)
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
        seo: seoReport?.summary ?? null,
      }),
      { ex: TTL.FREE_SITE },
    );
    // Index this site under the user so the landing page can surface
    // "你有一個免費預覽還在 X 小時內" without the user needing to
    // remember the random URL.
    await recordUserSite(userKey, siteId);
  }

  return NextResponse.json({
    siteId,
    previewUrl: `/preview/${siteId}`,
    imageSources: sources,
    expiresAt: Date.now() + TTL.FREE_SITE * 1000,
    seo: seoReport?.summary ?? null,
  });
}
