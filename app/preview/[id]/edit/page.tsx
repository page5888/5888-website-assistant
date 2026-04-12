import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { redis } from "@/lib/redis";
import { auth, getUserKey } from "@/lib/auth";
import { extractTextSlots, hasTextSlots } from "@/lib/textSlots";
import { SITE_EDITS_KEY, MAX_EDITS_PER_SITE } from "@/lib/ratelimit";
import { EditTextForm } from "@/components/EditTextForm";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

/**
 * /preview/[id]/edit — server component that loads the current HTML,
 * extracts every `data-5888-text` slot, and hands the list to a client
 * form component for editing.
 *
 * Auth rules mirror /api/edit-text:
 *   - must be logged in
 *   - must own the site
 *   - must be paid
 *   - site must have `data-5888-text` attributes (old sites get blocked
 *     with a "please regenerate" message per Q1=A)
 */
export default async function EditTextPage({ params }: PageProps) {
  const { id } = await params;
  const session = await auth();
  const userKey = getUserKey(session);

  if (!session?.user || !userKey) {
    redirect(`/preview/${encodeURIComponent(id)}`);
  }

  const html = await redis.get<string>(`site:${id}`);
  const metaRaw = await redis.get<string>(`site:${id}:meta`);

  if (!html || !metaRaw) {
    notFound();
  }

  const meta: {
    storeName?: string;
    owner?: string;
    paid?: boolean;
  } = typeof metaRaw === "string" ? JSON.parse(metaRaw) : metaRaw;

  // Ownership + paid gates — same as the POST route
  if (meta.owner && meta.owner !== userKey) {
    return (
      <EditGateMessage
        id={id}
        title="無權限"
        body="這個網站不屬於你的帳號,無法編輯。"
      />
    );
  }
  if (!meta.paid) {
    return (
      <EditGateMessage
        id={id}
        title="尚未付款"
        body="文字修改功能只提供給已付款的完整版網站。請先回預覽頁付款解鎖。"
      />
    );
  }

  // Old-site block per Q1=A. The message text is the user's exact wording.
  if (!hasTextSlots(html)) {
    return (
      <EditGateMessage
        id={id}
        title="此網站暫不支援文字修改"
        body="此網站建立於文字修改功能上線前,暫不支援,請重新生成以使用此功能。"
      />
    );
  }

  const slots = extractTextSlots(html);

  // Read the current edit counter so the form can show remaining budget.
  const used = Number((await redis.get(SITE_EDITS_KEY(id))) ?? 0);
  const remaining = Math.max(0, MAX_EDITS_PER_SITE - used);

  return (
    <main className="min-h-screen bg-[var(--color-background)] text-[var(--color-foreground)]">
      <header className="sticky top-0 z-20 border-b border-[var(--color-border)] bg-white/80 backdrop-blur-lg">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link href={`/preview/${encodeURIComponent(id)}`} className="text-sm">
            ← 返回預覽
          </Link>
          <div className="text-xs text-[var(--color-muted-foreground)]">
            ✏️ 修改文字 · {meta.storeName ?? ""}
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-5xl px-6 py-10">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black tracking-tight">修改網站文字</h1>
            <p className="mt-2 text-sm text-[var(--color-muted-foreground)]">
              每個欄位對應網站上的一段文字,直接改就好。留空代表刪除該段。
            </p>
          </div>
          <div className="rounded-2xl border border-[var(--color-border)] bg-white px-4 py-3 text-xs text-[var(--color-muted-foreground)]">
            本網站剩餘修改次數:
            <strong className="ml-1 text-[var(--color-foreground)]">
              {remaining} / {MAX_EDITS_PER_SITE}
            </strong>
          </div>
        </div>

        {slots.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-amber-300 bg-amber-50 p-6 text-sm text-amber-900">
            找不到可編輯的文字欄位。這可能是生成時 AI 沒有標記好,
            請聯繫客服處理。
          </div>
        ) : (
          <EditTextForm siteId={id} slots={slots} initialRemaining={remaining} />
        )}
      </section>
    </main>
  );
}

function EditGateMessage({
  id,
  title,
  body,
}: {
  id: string;
  title: string;
  body: string;
}) {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center px-6 text-center">
      <h1 className="text-2xl font-black">{title}</h1>
      <p className="mt-4 text-sm text-[var(--color-muted-foreground)]">{body}</p>
      <Link
        href={`/preview/${encodeURIComponent(id)}`}
        className="mt-8 rounded-full bg-[var(--color-primary)] px-5 py-2 text-sm font-semibold text-[var(--color-primary-foreground)]"
      >
        回預覽頁
      </Link>
    </main>
  );
}
