import { NextResponse } from "next/server";
import { auth, getUserKey } from "@/lib/auth";
import { redis } from "@/lib/redis";
import { applyTextEdits, hasTextSlots } from "@/lib/textSlots";
import { SITE_EDITS_KEY, MAX_EDITS_PER_SITE } from "@/lib/ratelimit";

export const runtime = "nodejs";

/**
 * POST /api/edit-text
 * Body: { siteId: string, edits: Record<string, string> }
 *
 * Paid-only "edit text" endpoint. The edit page collects a form of
 * {key: newText} pairs where each key corresponds to a `data-5888-text`
 * attribute in the stored HTML, and calls this route to write them
 * back.
 *
 * Invariants:
 *   - caller must be logged in and own the site (meta.owner === userKey)
 *   - meta.paid must be true
 *   - site HTML must contain at least one data-5888-text attribute
 *     (we block old pre-feature sites here — they simply won't have any)
 *   - each key in the edits map is validated by applyTextEdits (unknown
 *     keys are silently dropped, not an error — lets callers send the
 *     whole form without diffing)
 *   - per-site counter enforced: MAX_EDITS_PER_SITE across the lifetime
 *     of the site. We do not gate on a daily window (user decision —
 *     text edits are cheap since they don't hit Claude).
 *
 * NOT idempotent: each successful call increments the counter, even if
 * the user didn't actually change anything. Clients should do their
 * own "is dirty?" check before POSTing to avoid wasting edit budget.
 */
export async function POST(req: Request) {
  const session = await auth();
  const userKey = getUserKey(session);
  if (!userKey) {
    return NextResponse.json({ error: "請先登入" }, { status: 401 });
  }

  let siteId: string;
  let edits: Record<string, string>;
  try {
    const body = (await req.json()) as {
      siteId?: string;
      edits?: Record<string, string>;
    };
    if (!body.siteId || !body.edits || typeof body.edits !== "object") {
      throw new Error("missing fields");
    }
    siteId = body.siteId;
    edits = body.edits;
  } catch {
    return NextResponse.json(
      { error: "請提供 siteId 與 edits 物件" },
      { status: 400 },
    );
  }

  // Cheap sanity check on keys — reject anything that could smuggle
  // HTML or break the regex in textSlots.ts. Matches the same pattern
  // used there (lowercase alnum + . _ -).
  for (const k of Object.keys(edits)) {
    if (!/^[a-z0-9._-]+$/.test(k)) {
      return NextResponse.json(
        { error: `無效的欄位 key: ${k}` },
        { status: 400 },
      );
    }
    if (typeof edits[k] !== "string") {
      return NextResponse.json(
        { error: `欄位 ${k} 的值不是字串` },
        { status: 400 },
      );
    }
    // Soft cap on field length to stop runaway payloads. 2k chars is
    // way more than any heading or paragraph we generate.
    if (edits[k].length > 2000) {
      return NextResponse.json(
        { error: `欄位 ${k} 太長,最多 2000 字` },
        { status: 400 },
      );
    }
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
      { error: "免費預覽無法修改文字,請先付款解鎖" },
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

  if (!hasTextSlots(html)) {
    return NextResponse.json(
      {
        error:
          "此網站建立於文字修改功能上線前,暫不支援,請重新生成以使用此功能",
      },
      { status: 409 },
    );
  }

  // Count check BEFORE write so a failed write doesn't consume budget.
  // Using incr after success means we might lose one edit to a race,
  // but that's fine — user just retries.
  const used = Number((await redis.get(SITE_EDITS_KEY(siteId))) ?? 0);
  if (Number.isFinite(used) && used >= MAX_EDITS_PER_SITE) {
    return NextResponse.json(
      {
        error: `此網站的文字修改次數已用完(${MAX_EDITS_PER_SITE}/${MAX_EDITS_PER_SITE})`,
      },
      { status: 429 },
    );
  }

  const rewritten = applyTextEdits(html, edits);
  // If applyTextEdits is a pure no-op (none of the keys matched), we
  // still accept it — but we don't charge against the edit counter.
  const changed = rewritten !== html;

  // Paid sites have no TTL — overwrite in place.
  await redis.set(`site:${siteId}`, rewritten);

  let newCount = used;
  if (changed) {
    newCount = await redis.incr(SITE_EDITS_KEY(siteId));
  }

  console.log("[edit-text]", {
    siteId,
    userKey,
    fieldCount: Object.keys(edits).length,
    changed,
    editsUsed: newCount,
  });

  return NextResponse.json({
    ok: true,
    changed,
    editsUsed: newCount,
    editsRemaining: Math.max(0, MAX_EDITS_PER_SITE - newCount),
  });
}
