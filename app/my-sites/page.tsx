import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, getUserKey } from "@/lib/auth";
import { SiteHeader } from "@/components/SiteHeader";
import { EcosystemFooter } from "@/components/EcosystemFooter";
import { getActiveUserSites, type ResolvedUserSite } from "@/lib/userSites";

export const metadata = {
  title: "我的網站 | 5888 網站助手",
  description: "查看你用 5888 網站助手生成過的所有店家網站,包含已付款的永久版本與已部署到 GitHub Pages 的公開網址。",
  openGraph: {
    title: "我的網站 | 5888 網站助手",
    description: "管理你所有的店家網站,一頁看完所有生成過的作品。",
    images: ["/logo-512.png"],
  },
};

// Do not cache — this page must reflect fresh Redis state every visit.
export const dynamic = "force-dynamic";

function formatDateTime(ms: number): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${y}/${m}/${day} ${hh}:${mm}`;
}

function hoursUntil(ts: number): number {
  return Math.max(0, Math.ceil((ts - Date.now()) / (60 * 60 * 1000)));
}

function SiteCard({ site }: { site: ResolvedUserSite }) {
  const hasPages = Boolean(site.deploy?.pagesUrl);
  const hasRepo = Boolean(site.deploy?.repoUrl);
  const statusLabel = site.paid
    ? hasPages
      ? { text: "🚀 已上架", cls: "bg-emerald-100 text-emerald-800 border-emerald-200" }
      : { text: "✨ 已付款", cls: "bg-sky-100 text-sky-800 border-sky-200" }
    : site.expiresAt
      ? {
          text: `⏰ ${hoursUntil(site.expiresAt)} 小時後消失`,
          cls: "bg-amber-100 text-amber-800 border-amber-200",
        }
      : { text: "📝 草稿", cls: "bg-slate-100 text-slate-700 border-slate-200" };

  return (
    <article className="flex flex-col gap-4 rounded-2xl border border-[var(--color-border)] bg-white p-6 shadow-sm transition hover:shadow-md">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h2 className="truncate text-xl font-bold tracking-tight">
            {site.storeName}
          </h2>
          <p className="mt-1 text-xs text-[var(--color-foreground)]/50">
            生成於 {formatDateTime(site.createdAt)}
            {site.paid && site.paidAt ? (
              <>
                {"  ·  "}
                付款於 {formatDateTime(site.paidAt)}
              </>
            ) : null}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full border px-3 py-1 text-[11px] font-bold tracking-wide ${statusLabel.cls}`}
        >
          {statusLabel.text}
        </span>
      </div>

      {/* Action links */}
      <div className="flex flex-wrap gap-2 pt-1">
        <Link
          href={`/preview/${site.siteId}`}
          className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-primary)] px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:scale-[1.02]"
        >
          👁️ 預覽 / 編輯
        </Link>
        {hasPages && (
          <a
            href={site.deploy!.pagesUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300 bg-emerald-50 px-4 py-2 text-xs font-bold text-emerald-800 transition hover:bg-emerald-100"
          >
            🌐 公開網址
            <span aria-hidden>↗</span>
          </a>
        )}
        {hasRepo && (
          <a
            href={site.deploy!.repoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-white px-4 py-2 text-xs font-semibold text-[var(--color-foreground)]/70 transition hover:bg-[var(--color-muted)]"
          >
            💻 GitHub Repo
            <span aria-hidden>↗</span>
          </a>
        )}
      </div>

      {/* Full pages URL (so user can copy/share) */}
      {hasPages && (
        <div className="rounded-lg border border-dashed border-[var(--color-border)] bg-[var(--color-muted)]/30 px-3 py-2">
          <p className="mb-0.5 text-[10px] font-bold uppercase tracking-widest text-[var(--color-foreground)]/50">
            公開網址
          </p>
          <p className="break-all font-mono text-xs text-[var(--color-foreground)]/80">
            {site.deploy!.pagesUrl}
          </p>
        </div>
      )}
    </article>
  );
}

export default async function MySitesPage() {
  const session = await auth();
  if (!session?.user) {
    // Not logged in → kick them to the landing page's Google sign-in CTA.
    redirect("/");
  }

  const userKey = getUserKey(session);
  const allSites = userKey ? await getActiveUserSites(userKey) : [];

  // Group for display: paid+deployed first, then paid (not yet deployed),
  // then free-tier previews. Within each group, newest first.
  const deployed: ResolvedUserSite[] = [];
  const paidNotDeployed: ResolvedUserSite[] = [];
  const freePreviews: ResolvedUserSite[] = [];
  for (const s of allSites) {
    if (s.paid && s.deploy?.pagesUrl) deployed.push(s);
    else if (s.paid) paidNotDeployed.push(s);
    else freePreviews.push(s);
  }
  const sortDesc = (a: ResolvedUserSite, b: ResolvedUserSite) =>
    (b.paidAt ?? b.createdAt) - (a.paidAt ?? a.createdAt);
  deployed.sort(sortDesc);
  paidNotDeployed.sort(sortDesc);
  freePreviews.sort((a, b) => b.createdAt - a.createdAt);

  const totalPaid = deployed.length + paidNotDeployed.length;

  return (
    <main className="min-h-screen bg-[var(--color-background)] text-[var(--color-foreground)]">
      {/* ============ HEADER ============ */}
      <SiteHeader activePath="/my-sites" />

      {/* ============ HERO ============ */}
      <section className="border-b border-[var(--color-border)] bg-gradient-to-br from-[var(--color-primary)]/5 via-white to-[var(--color-accent)]/5">
        <div className="mx-auto max-w-5xl px-6 py-12">
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.25em] text-[var(--color-primary)]">
            My Sites
          </p>
          <h1 className="mb-3 text-3xl font-black tracking-tight md:text-4xl">
            我的網站
          </h1>
          <p className="max-w-2xl text-sm leading-relaxed text-[var(--color-foreground)]/70">
            這裡列出你登入帳號名下所有還有效的網站。已付款的網站會永久保留,
            已部署到 GitHub Pages 的網站會附上公開網址,隨時可以點開分享給客人。
          </p>
          {/* Stat strip */}
          <div className="mt-6 flex flex-wrap gap-4 text-xs">
            <div className="rounded-full border border-[var(--color-border)] bg-white px-4 py-2 font-semibold">
              🚀 已上架 <strong className="text-emerald-700">{deployed.length}</strong> 個
            </div>
            <div className="rounded-full border border-[var(--color-border)] bg-white px-4 py-2 font-semibold">
              ✨ 已付款 <strong className="text-sky-700">{totalPaid}</strong> 個
            </div>
            <div className="rounded-full border border-[var(--color-border)] bg-white px-4 py-2 font-semibold">
              ⏰ 免費預覽 <strong className="text-amber-700">{freePreviews.length}</strong> 個
            </div>
          </div>
        </div>
      </section>

      {/* ============ LIST ============ */}
      <section className="mx-auto max-w-5xl px-6 py-12">
        {allSites.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="space-y-12">
            {deployed.length > 0 && (
              <Group title="🚀 已部署到 GitHub Pages" sites={deployed} />
            )}
            {paidNotDeployed.length > 0 && (
              <Group
                title="✨ 已付款(尚未部署)"
                sites={paidNotDeployed}
                note="這些網站已經付款永久保留,點「預覽 / 編輯」頁底可以一鍵部署到 GitHub Pages。"
              />
            )}
            {freePreviews.length > 0 && (
              <Group
                title="⏰ 免費預覽"
                sites={freePreviews}
                note="免費預覽 24 小時後會自動消失。付款後會移到上方永久保留區。"
              />
            )}
          </div>
        )}

        {/* Help note */}
        <div className="mt-16 rounded-2xl border border-dashed border-[var(--color-border)] bg-white/50 p-6 text-center text-sm text-[var(--color-foreground)]/60">
          找不到某個你記得有做過的網站?可能是:
          <br />
          1. 超過 24 小時的免費預覽會自動消失
          <br />
          2. 你用了不同的 Google 帳號登入(每個帳號的網站是分開的)
          <br />
          3. 若你確認付款過但網站不見,請{" "}
          <a
            href="mailto:srbow.tw@gmail.com"
            className="font-semibold text-[var(--color-primary)] hover:underline"
          >
            寫信告訴我們
          </a>
          ,附上付款單號或 GitHub repo 名稱,我們會幫你找回來。
        </div>
      </section>

      {/* ============ FOOTER ============ */}
      <EcosystemFooter variant="light" />
    </main>
  );
}

function Group({
  title,
  sites,
  note,
}: {
  title: string;
  sites: ResolvedUserSite[];
  note?: string;
}) {
  return (
    <div>
      <div className="mb-5 flex items-baseline justify-between gap-4 border-b border-[var(--color-border)] pb-3">
        <h2 className="text-lg font-bold tracking-tight">{title}</h2>
        <span className="text-xs text-[var(--color-foreground)]/50">
          {sites.length} 個
        </span>
      </div>
      {note && (
        <p className="mb-5 text-xs leading-relaxed text-[var(--color-foreground)]/60">
          {note}
        </p>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        {sites.map((s) => (
          <SiteCard key={s.siteId} site={s} />
        ))}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-3xl border-2 border-dashed border-[var(--color-primary)]/30 bg-white/60 p-16 text-center">
      <p className="text-2xl font-black">還沒有任何網站 🎨</p>
      <p className="mt-4 text-sm text-[var(--color-muted-foreground)]">
        先到首頁填表單,30 秒後你就會有一份店家網站
      </p>
      <Link
        href="/"
        className="mt-6 inline-flex items-center gap-2 rounded-full bg-[var(--color-primary)] px-6 py-3 text-sm font-bold text-white shadow-lg transition hover:scale-105"
      >
        🚀 回首頁開始生成
        <span aria-hidden>→</span>
      </Link>
    </div>
  );
}
