import { notFound } from "next/navigation";
import Link from "next/link";
import { redis } from "@/lib/redis";
import { auth } from "@/lib/auth";
import { getBalance } from "@/lib/wallet";
import { PRICING } from "@/lib/ecpay";
import { PreviewActions } from "@/components/PreviewActions";
import { AccountChip } from "@/components/AccountChip";
import { extractImageSlots } from "@/lib/siteImages";

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

  // Fetch the user's 5888 central wallet balance so the checkout UI can
  // offer points-as-discount. In stub mode (no WALLET_API_KEY) this returns
  // 0 and the slider is hidden — see lib/wallet.ts.
  let walletBalance = 0;
  const walletUid = (session.user as { walletUid?: string }).walletUid;
  if (!isPaid && walletUid) {
    try {
      const res = await getBalance(walletUid);
      walletBalance = res.balance;
    } catch (err) {
      // Balance display is best-effort — don't block the preview page on it.
      console.error("[preview] getBalance failed", err);
    }
  }

  // For paid sites, parse out the image slots so the post-payment UI can
  // offer per-slot image replacement. We only do this after payment to
  // keep the free-preview render path cheap.
  const imageSlots = isPaid ? extractImageSlots(html) : [];

  return (
    <main className="flex min-h-screen flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b bg-white/90 px-6 py-4 backdrop-blur">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href="/"
            className="text-xl font-black"
            aria-label="回到 5888 網站助手首頁"
          >
            <span className="text-[var(--color-primary)]">5888</span>
            <span className="ml-1">網站助手</span>
          </Link>
          <span className="truncate text-sm text-[var(--color-muted-foreground)]">
            預覽:{meta.storeName}
          </span>
          {!isPaid && hoursLeft !== null && (
            <span className="inline-block rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
              ⏰ {hoursLeft} 小時後消失
            </span>
          )}
          {isPaid && (
            <span className="inline-block rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-800">
              ✨ 已永久保留
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-3">
          <PreviewActions
            siteId={id}
            initialPaid={isPaid}
            price={PRICING.FULL_UNLOCK_TWD}
            balance={walletBalance}
            images={imageSlots}
          />
          <div className="border-l border-[var(--color-border)] pl-3">
            <AccountChip variant="compact" />
          </div>
        </div>
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

      <footer className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 border-t bg-white px-6 py-3 text-center text-xs text-[var(--color-muted-foreground)]">
        <span>5888 網站助手 ｜ 2026 Design by 幸福瓢蟲手作雜貨</span>
        <span aria-hidden>·</span>
        <Link href="/pricing" className="hover:text-[var(--color-primary)]">
          定價
        </Link>
        <Link href="/changelog" className="hover:text-[var(--color-primary)]">
          更新紀錄
        </Link>
        <span aria-hidden>·</span>
        <a
          href="https://wallet-5888.web.app/"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-[var(--color-primary)]"
        >
          5888 生態系首頁 ↗
        </a>
        <a
          href="https://wallet-5888.web.app/history.html"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-[var(--color-primary)]"
        >
          我的點數 ↗
        </a>
      </footer>
    </main>
  );
}
