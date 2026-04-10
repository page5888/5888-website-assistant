import { NextResponse } from "next/server";
import { z } from "zod";
import { nanoid } from "nanoid";
import { auth, getUserKey } from "@/lib/auth";
import { dailyLimit } from "@/lib/ratelimit";
import { redis } from "@/lib/redis";
import { generateSiteHtml, type ClaudeModelChoice } from "@/lib/anthropic";
import { collectImages } from "@/lib/images/collect";

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

export async function POST(req: Request) {
  // 1. Auth
  const session = await auth();
  const userKey = getUserKey(session);
  if (!userKey) {
    return NextResponse.json({ error: "請先登入" }, { status: 401 });
  }

  // 2. Rate limit (1/day/account)
  //    In dev without Upstash env vars, skip to allow local testing.
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    const { success, reset } = await dailyLimit.limit(userKey);
    if (!success) {
      const hours = Math.ceil((reset - Date.now()) / (60 * 60 * 1000));
      return NextResponse.json(
        { error: `今日已使用過生成額度,請 ${hours} 小時後再試` },
        { status: 429 },
      );
    }
  }

  // 3. Validate body
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

  // 4. Collect images (parallel-friendly, falls back gracefully)
  const { images, sources } = await collectImages({
    userImages: input.userImages,
    fbUrl: input.fbUrl || undefined,
    industryHint: input.industryHint || input.storeName,
    storeName: input.storeName,
    target: 8,
  });

  // 5. Call Claude
  let html: string;
  try {
    html = await generateSiteHtml({
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
    return NextResponse.json(
      { error: "AI 生成失敗,請稍後再試", detail: String(err) },
      { status: 502 },
    );
  }

  // 6. Store HTML in Redis for 1 hour
  const siteId = nanoid(12);
  if (process.env.UPSTASH_REDIS_REST_URL) {
    await redis.set(`site:${siteId}`, html, { ex: 3600 });
    await redis.set(
      `site:${siteId}:meta`,
      JSON.stringify({
        storeName: input.storeName,
        createdAt: Date.now(),
        imageSources: sources,
        model: input.model,
        paid: false,
      }),
      { ex: 3600 },
    );
  }

  return NextResponse.json({
    siteId,
    previewUrl: `/preview/${siteId}`,
    imageSources: sources,
  });
}
