import Link from "next/link";

/**
 * Shared footer used across all public pages of cteater.
 *
 * Always includes:
 *   - cteater brand line + tagline
 *   - Internal nav (首頁 / 定價 / 更新紀錄)
 *   - 5888 生態系 nav — REQUIRED per wallet team handoff 2026-04-12,
 *     users who arrive via wallet-5888.web.app must have a way back.
 *     Minimum required links: ecosystem home + points ledger.
 *
 * Two visual variants:
 *   - "dark"  — used on the marketing landing (/)
 *   - "light" — used on /pricing, /changelog, /preview/[id]
 *
 * Do NOT add per-page footers. If you need page-specific content,
 * pass `extra` as a React node rendered above the brand line.
 */

const ECOSYSTEM_LINKS: Array<{ label: string; href: string; required: boolean }> = [
  {
    label: "生態系首頁",
    href: "https://wallet-5888.web.app/",
    required: true,
  },
  {
    label: "我的點數 / 交易記錄",
    href: "https://wallet-5888.web.app/history.html",
    required: true,
  },
  {
    label: "排行榜",
    href: "https://wallet-5888.web.app/leaderboard.html",
    required: false,
  },
  {
    label: "購買月費",
    href: "https://wallet-5888.web.app/buy.html?site=5888_cteater",
    required: false,
  },
];

const INTERNAL_LINKS = [
  { label: "首頁", href: "/" },
  { label: "定價", href: "/pricing" },
  { label: "更新紀錄", href: "/changelog" },
];

export function EcosystemFooter({
  variant = "light",
  extra,
}: {
  variant?: "light" | "dark";
  extra?: React.ReactNode;
}) {
  const isDark = variant === "dark";

  const wrapperClass = isDark
    ? "bg-[var(--color-foreground)] text-[var(--color-background)]/70"
    : "border-t border-[var(--color-border)] bg-white text-[var(--color-muted-foreground)]";

  const headingClass = isDark
    ? "text-[var(--color-background)]"
    : "text-[var(--color-foreground)]";

  const linkClass = isDark
    ? "hover:text-[var(--color-background)] transition"
    : "hover:text-[var(--color-primary)] transition";

  const dividerClass = isDark
    ? "border-[var(--color-background)]/10"
    : "border-[var(--color-border)]";

  const muteClass = isDark
    ? "text-[var(--color-background)]/40"
    : "text-[var(--color-muted-foreground)]/70";

  return (
    <footer className={wrapperClass} aria-label="頁尾">
      <div className="mx-auto max-w-7xl px-6 py-12">
        {extra ? <div className="mb-10">{extra}</div> : null}

        <div className="grid gap-10 md:grid-cols-[1.4fr_1fr_1fr]">
          {/* Brand column */}
          <div className="flex flex-col gap-3">
            <Link
              href="/"
              className={`inline-flex items-center gap-2 text-xl font-black ${headingClass}`}
              aria-label="回到 5888 網站助手首頁"
            >
              <span className="text-gradient">5888</span>
              <span>網站助手</span>
            </Link>
            <p className="max-w-sm text-sm leading-relaxed">
              填店名 → AI 出網站,24 小時預覽免費試用。
            </p>
            <p className={`text-xs ${muteClass}`}>
              Powered by Claude 4.6 · Next.js · Vercel · GitHub Pages
            </p>
          </div>

          {/* Internal nav */}
          <nav aria-label="網站助手導覽">
            <p
              className={`mb-4 text-xs font-bold uppercase tracking-[0.2em] ${headingClass}`}
            >
              網站助手
            </p>
            <ul className="space-y-2 text-sm">
              {INTERNAL_LINKS.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className={linkClass}>
                    {l.label}
                  </Link>
                </li>
              ))}
              <li>
                <a
                  href="mailto:srbow.tw@gmail.com"
                  className={linkClass}
                >
                  聯絡我們
                </a>
              </li>
            </ul>
          </nav>

          {/* 5888 ecosystem nav — required by wallet team handoff */}
          <nav aria-label="5888 生態系導覽">
            <p
              className={`mb-4 text-xs font-bold uppercase tracking-[0.2em] ${headingClass}`}
            >
              5888 生態系
            </p>
            <ul className="space-y-2 text-sm">
              {ECOSYSTEM_LINKS.map((l) => (
                <li key={l.href}>
                  <a
                    href={l.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={linkClass}
                  >
                    {l.label}
                    <span aria-hidden className="ml-1 text-[10px]">
                      ↗
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <div
          className={`mt-10 flex flex-wrap items-center justify-between gap-3 border-t pt-6 text-xs ${dividerClass} ${muteClass}`}
        >
          <p>
            <span className={`font-bold ${headingClass}`}>5888 網站助手</span> ｜ 2026
            Design by 幸福瓢蟲手作雜貨
          </p>
          <p>© 2026 5888 生態系.</p>
        </div>
      </div>
    </footer>
  );
}
