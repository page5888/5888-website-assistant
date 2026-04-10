"use client";

import { useState } from "react";

export function PreviewActions({
  siteId,
  initialPaid,
}: {
  siteId: string;
  initialPaid: boolean;
}) {
  const [paid, setPaid] = useState(initialPaid);
  const [busy, setBusy] = useState<"pay" | "deploy" | "download" | null>(null);
  const [deployResult, setDeployResult] = useState<{
    pagesUrl: string;
    repoUrl: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function pay() {
    setBusy("pay");
    setError(null);
    try {
      const res = await fetch("/api/pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "付款失敗");
      setPaid(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
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
        <button
          type="button"
          onClick={pay}
          disabled={busy === "pay"}
          className="rounded-full bg-[var(--color-accent)] px-5 py-2 text-sm font-semibold text-white shadow hover:opacity-90 disabled:opacity-50"
          aria-label="付款解鎖下載"
        >
          {busy === "pay" ? "處理中..." : "💳 付款(模擬)"}
        </button>
      ) : (
        <>
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
