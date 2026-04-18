import Link from "next/link";
import { AccountChip } from "@/components/AccountChip";
import { MobileNav } from "@/components/MobileNav";
import { auth } from "@/lib/auth";

/**
 * Shared site header used across all public pages (homepage, pricing,
 * guide, changelog, my-sites). The preview page has its own specialised
 * header and does NOT use this component.
 *
 * `activePath` highlights the current page link.
 * `maxWidth` lets the homepage use a wider container (max-w-7xl) while
 * other pages stay at max-w-4xl or max-w-5xl.
 */
export async function SiteHeader({
  activePath,
  maxWidth = "max-w-5xl",
}: {
  activePath?: string;
  maxWidth?: string;
}) {
  const session = await auth();
  const isLoggedIn = !!session?.user;

  const NAV_LINKS = [
    ...(isLoggedIn
      ? [{ href: "/my-sites", label: "我的網站" }]
      : []),
    { href: "/pricing", label: "定價" },
    { href: "/guide", label: "使用說明" },
    { href: "/changelog", label: "更新紀錄" },
  ];

  return (
    <header className="sticky top-0 z-50 border-b border-[var(--color-border)]/60 bg-[var(--color-background)]/80 backdrop-blur-xl">
      <div
        className={`mx-auto flex items-center justify-between px-6 py-4 ${maxWidth}`}
      >
        {/* Logo */}
        <Link
          href="/"
          className="flex items-center gap-1 text-xl font-black tracking-tight sm:text-2xl"
          aria-label="回到 5888 網站助手首頁"
        >
          <span className="text-gradient">5888</span>
          <span>網站助手</span>
        </Link>

        {/* Desktop nav — hidden below sm */}
        <nav
          aria-label="主選單"
          className="hidden items-center gap-5 text-sm sm:flex"
        >
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={
                activePath === link.href
                  ? "font-semibold text-[var(--color-primary)]"
                  : "hover:text-[var(--color-primary)]"
              }
            >
              {link.label}
            </Link>
          ))}
          <AccountChip />
        </nav>

        {/* Mobile: account chip + hamburger — visible below sm */}
        <div className="flex items-center gap-3 sm:hidden">
          <AccountChip variant="compact" />
          <MobileNav links={NAV_LINKS} activePath={activePath} />
        </div>
      </div>
    </header>
  );
}
