"use client";

import { useState } from "react";

export function PreviewActions({
  siteId,
  initialPaid,
}: {
  siteId: string;
  initialPaid: boolean;
}) {
  const [paid] = useState(initialPaid);
  const [busy, setBusy] = useState<"pay" | "deploy" | "download" | null>(null);
  const [deployResult, setDeployResult] = useState<{
    pagesUrl: string;
    repoUrl: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  /**
   * Start ECPay checkout. We POST to /api/checkout which returns an
   * auto-submitting HTML form. We open a new window, write the HTML
   * into it, and the form auto-POSTs the user over to ECPay.
   */
  async function pay() {
    setBusy("pay");
    setError(null);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `建立訂單失敗 (${res.status})`);
      }
      const html = await res.text();
      // Replace current document with the returned auto-submit form
      document.open();
      document.write(html);
      document.close();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(null);
    }
  }

  async function download() {
    setBusy("download");
    setError(null);
    try {
      window.location.href = `/api/download?siteId=${encodeURIComponent(siteId)}`;
    } finally {
      setTimeout(() => setBusy(null), 1500);
    }
  }

  async function deploy() {
    setBusy("deploy");
    setError(null);
    try {
      const res = await fetch("/api/deploy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "部署失敗");
      setDeployResult({ pagesUrl: data.pagesUrl, repoUrl: data.repoUrl });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  if (deployResult) {
    return (
      <div className="text-right">
        <p className="text-sm font-medium text-green-700">✅ 部署完成!</p>
        <a
          href={deployResult.pagesUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-[var(--color-primary)] underline"
          aria-label="開啟已部署的網站"
        >
          {deployResult.pagesUrl}
        </a>
        <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
          首次 build 約需 30-60 秒,若 404 請稍候重整
        </p>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      {error && (
        <span className="text-xs text-red-600" role="alert">
          {error}
        </span>
      )}

      {!paid ? (
        <>
          <span className="hidden text-xs text-[var(--color-muted-foreground)] sm:inline">
            免費預覽 24 小時後消失 · 付款即永久保留
          </span>
          <button
            type="button"
            onClick={pay}
            disabled={busy === "pay"}
            className="rounded-full bg-gradient-to-r from-[var(--color-primary)] to-[var(--color-accent)] px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-purple-500/30 hover:opacity-90 disabled:opacity-50"
            aria-label="付款 NT$490 解鎖完整版"
          >
            {busy === "pay" ? "跳轉中..." : "💎 解鎖完整版 NT$490"}
          </button>
        </>
      ) : (
        <>
          <span className="hidden text-xs font-semibold text-green-700 sm:inline">
            ✨ 已解鎖完整版
          </span>
          <button
            type="button"
            onClick={download}
            disabled={busy !== null}
            className="rounded-full border-2 border-[var(--color-primary)] px-5 py-2 text-sm font-semibold text-[var(--color-primary)] hover:bg-[var(--color-primary)] hover:text-[var(--color-primary-foreground)] disabled:opacity-50"
            aria-label="下載 HTML 檔案"
          >
            ⬇️ 下載 .html
          </button>
          <button
            type="button"
            onClick={deploy}
            disabled={busy !== null}
            className="rounded-full bg-[var(--color-primary)] px-5 py-2 text-sm font-semibold text-[var(--color-primary-foreground)] shadow hover:opacity-90 disabled:opacity-50"
            aria-label="自動部署至 GitHub Pages"
          >
            {busy === "deploy" ? "部署中..." : "🚀 一鍵部署"}
          </button>
        </>
      )}
    </div>
  );
}
