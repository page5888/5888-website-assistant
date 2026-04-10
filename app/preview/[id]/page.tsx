import { notFound } from "next/navigation";
import Link from "next/link";
import { redis } from "@/lib/redis";
import { auth } from "@/lib/auth";
import { PreviewActions } from "@/components/PreviewActions";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ paid?: string }>;
}

export default async function PreviewPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const { paid: paidQuery } = await searchParams;
  const session = await auth();

  if (!session?.user) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-20 text-center">
        <p className="text-lg">請先登入才能檢視預覽。</p>
        <Link
          href="/"
          className="mt-4 inline-block rounded-full bg-[var(--color-primary)] px-5 py-2 text-sm text-[var(--color-primary-foreground)]"
        >
          回首頁登入
        </Link>
      </main>
    );
  }

  const html = await redis.get<string>(`site:${id}`);
  const metaRaw = await redis.get<string>(`site:${id}:meta`);

  if (!html || !metaRaw) {
    notFound();
  }

  const meta: {
    storeName: string;
    paid?: boolean;
    expiresAt?: number;
    deploy?: { pagesUrl: string; repoUrl: string };
  } = typeof metaRaw === "string" ? JSON.parse(metaRaw) : metaRaw;

  const isPaid = meta.paid === true || paidQuery === "1";

  // Compute remaining hours for the free-tier expiry countdown
  let hoursLeft: number | null = null;
  if (!isPaid && meta.expiresAt) {
    const ms = meta.expiresAt - Date.now();
    hoursLeft = Math.max(0, Math.ceil(ms / (60 * 60 * 1000)));
  }

  return (
    <main className="flex min-h-screen flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b bg-white/90 px-6 py-4 backdrop-blur">
        <div>
          <Link
            href="/"
            className="text-xl font-black"
            aria-label="回到 5888 網站助手首頁"
          >
            <span className="text-[var(--color-primary)]">5888</span>
            <span className="ml-1">網站助手</span>
          </Link>
          <span className="ml-3 text-sm text-[var(--color-muted-foreground)]">
            預覽:{meta.storeName}
          </span>
          {!isPaid && hoursLeft !== null && (
            <span className="ml-3 inline-block rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
              ⏰ {hoursLeft} 小時後消失
            </span>
          )}
          {isPaid && (
            <span className="ml-3 inline-block rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-800">
              ✨ 已永久保留
            </span>
          )}
        </div>
        <PreviewActions siteId={id} initialPaid={isPaid} />
      </header>

      <div className="flex-1 bg-[var(--color-muted)] p-4">
        <div className="mx-auto max-w-[1400px] overflow-hidden rounded-2xl border bg-white shadow-xl">
          <iframe
            title={`預覽 ${meta.storeName}`}
            srcDoc={html}
            sandbox="allow-scripts allow-same-origin allow-popups"
            className="h-[calc(100vh-12rem)] w-full border-0"
          />
        </div>
      </div>

      <footer className="border-t bg-white px-6 py-3 text-center text-xs text-[var(--color-muted-foreground)]">
        5888 網站助手 ｜ 2026 Design by 花蓮瓊瑤打字行
      </footer>
    </main>
  );
}
