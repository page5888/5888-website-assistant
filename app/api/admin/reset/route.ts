import { NextResponse } from "next/server";
import { auth, getUserKey } from "@/lib/auth";
import { redis } from "@/lib/redis";
import { isAdminEmail } from "@/lib/admin";
import { LIFETIME_FREE_KEY } from "@/lib/ratelimit";

export const runtime = "nodejs";

/**
 * POST /api/admin/reset
 * Body (optional): { targetUserKey?: string }
 *
 * - Requires logged-in user
 * - Only works if current user's email is in ADMIN_EMAILS
 * - If targetUserKey is not provided, resets the current user
 * - Deletes:
 *     web-cteater:daily:<key>           (fixed-window 1/day)
 *     web-cteater:lifetime-free:<key>   (lifetime counter)
 *
 * Returns the list of keys deleted so you can see it worked.
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

  // Determine target
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

  // Delete the rate-limit keys. Upstash's Ratelimit library stores its
  // internal key under `${prefix}:${identifier}`; we also store the
  // lifetime counter directly.
  const keysToDelete = [
    `web-cteater:daily:${targetUserKey}`,
    LIFETIME_FREE_KEY(targetUserKey),
  ];

  const results: Record<string, number> = {};
  for (const k of keysToDelete) {
    try {
      const r = await redis.del(k);
      results[k] = r;
    } catch (err) {
      console.error("[admin-reset] failed to delete", k, err);
      results[k] = -1;
    }
  }

  return NextResponse.json({
    ok: true,
    message: `已重置 ${targetUserKey} 的生成額度`,
    adminEmail: email,
    targetUserKey,
    deleted: results,
  });
}
