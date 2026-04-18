"use client";

import { useState } from "react";
import Link from "next/link";

/**
 * Mobile hamburger menu — rendered only below sm breakpoint.
 * Opens a slide-down panel with all nav links.
 */
export function MobileNav({
  links,
  activePath,
}: {
  links: { href: string; label: string }[];
  activePath?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Hamburger button */}
      <button
        type="button"
        aria-label={open ? "關閉選單" : "開啟選單"}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--color-border)] text-[var(--color-foreground)] transition hover:bg-[var(--color-muted)]"
      >
        {open ? (
          // X icon
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="4" y1="4" x2="14" y2="14" />
            <line x1="14" y1="4" x2="4" y2="14" />
          </svg>
        ) : (
          // Hamburger icon
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="3" y1="5" x2="15" y2="5" />
            <line x1="3" y1="9" x2="15" y2="9" />
            <line x1="3" y1="13" x2="15" y2="13" />
          </svg>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <nav
          aria-label="行動版選單"
          className="absolute left-0 right-0 top-full z-50 border-b border-[var(--color-border)] bg-white/95 backdrop-blur-xl"
        >
          <ul className="mx-auto flex max-w-lg flex-col divide-y divide-[var(--color-border)]/40 px-6 py-2">
            {/* Home link always first */}
            <li>
              <Link
                href="/"
                onClick={() => setOpen(false)}
                className={`block py-3 text-sm font-medium ${
                  activePath === "/" ? "text-[var(--color-primary)]" : ""
                }`}
              >
                首頁
              </Link>
            </li>
            {links.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className={`block py-3 text-sm font-medium ${
                    activePath === link.href
                      ? "text-[var(--color-primary)]"
                      : ""
                  }`}
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </>
  );
}
