import { NextResponse } from "next/server";
import { auth, getUserKey } from "@/lib/auth";
import { redis } from "@/lib/redis";
import { isAdminEmail } from "@/lib/admin";
import { LIFETIME_FREE_KEY } from "@/lib/ratelimit";

export const runtime = "nodejs";

/**
 * Extract client IP from proxy headers so we can also clear the IP-based
 * daily limit for whoever is calling this endpoint.
 */
function getClientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  return "unknown";
}

/**
 * Scan Redis for keys matching `pattern` and delete them all.
 *
 * We can't just `DEL web-cteater:daily:${userKey}` because
 * @upstash/ratelimit's fixedWindow stores keys as
 * `${prefix}:${identifier}:${bucket}` where bucket is the window index.
 * So we have to SCAN with a wildcard to find the real keys.
 */
async function deleteByPattern(pattern: string): Promise<string[]> {
  const deleted: string[] = [];
  // Upstash's REST client returns cursor as a string ("0" when done).
  let cursor = "0";
  let first = true;
  // Safety cap to avoid runaway loops if something is very wrong.
  for (let i = 0; i < 50; i++) {
    if (!first && cursor === "0") break;
    first = false;

    const [next, keys] = (await redis.scan(cursor, {
      match: pattern,
      count: 200,
    })) as [string, string[]];

    if (keys.length > 0) {
      // `del(...keys)` takes variadic args; empty array would throw.
      await redis.del(...keys);
      deleted.push(...keys);
    }
    cursor = String(next);
  }
  return deleted;
}

/**
 * POST /api/admin/reset
 * Body (optional): { targetUserKey?: string }
 *
 * - Requires logged-in user
 * - Only works if current user's email is in ADMIN_EMAILS
 * - Clears every rate-limit key that belongs to this user, plus the
 *   IP-based daily counter for the caller's IP.
 *
 * Returns the full list of deleted keys so you can verify it worked.
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "請先登入" }, { status: 401 });
  }

  const email = session.user.email ?? null;
  if (!isAdminEmail(email)) {
    return NextResponse.json(
      {
        error: "此功能僅限管理員。請將你的 email 加入 Vercel 環境變數 ADMIN_EMAILS。",
      },
      { status: 403 },
    );
  }

  // Determine target user
  let targetUserKey: string;
  try {
    const body = (await req.json().catch(() => ({}))) as {
      targetUserKey?: string;
    };
    targetUserKey = body.targetUserKey || getUserKey(session) || "";
  } catch {
    targetUserKey = getUserKey(session) || "";
  }

  if (!targetUserKey) {
    return NextResponse.json(
      { error: "無法判斷要重置的使用者" },
      { status: 400 },
    );
  }

  const ip = getClientIp(req);

  // Every pattern to sweep. Leading `*:` covers cases where we might not
  // know the exact prefix form. Trailing `*` covers the bucket suffix
  // appended by @upstash/ratelimit's fixedWindow algorithm.
  const patterns: string[] = [
    // Per-account daily throttle (1/day)
    `web-cteater:daily:${targetUserKey}*`,
    // Per-account edit throttle (1/day)
    `web-cteater:edit-daily:${targetUserKey}*`,
    // Lifetime-free counter (exact key, but * is harmless)
    `${LIFETIME_FREE_KEY(targetUserKey)}*`,
    // IP daily throttle for the caller's IP. Upstash identifier was
    // built as `ip:${ip}` so the key looks like
    // `web-cteater:ip:ip:${ip}:<bucket>`.
    `web-cteater:ip:ip:${ip}*`,
  ];

  const deleted: Record<string, string[]> = {};
  for (const pattern of patterns) {
    try {
      deleted[pattern] = await deleteByPattern(pattern);
    } catch (err) {
      console.error("[admin-reset] scan/delete failed", pattern, err);
      deleted[pattern] = [`ERROR: ${String(err)}`];
    }
  }

  const totalDeleted = Object.values(deleted).reduce(
    (n, list) => n + list.filter((k) => !k.startsWith("ERROR:")).length,
    0,
  );

  return NextResponse.json({
    ok: true,
    message:
      totalDeleted > 0
        ? `已重置 ${targetUserKey} 的生成額度(清除 ${totalDeleted} 個 key)`
        : `沒有找到 ${targetUserKey} 的任何限額 key — 可能本來就沒有被限制`,
    adminEmail: email,
    targetUserKey,
    ip,
    totalDeleted,
    deleted,
  });
}
