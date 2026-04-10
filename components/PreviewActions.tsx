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
  const [helpOpen, setHelpOpen] = useState(false);

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

      {/* Help trigger — always available, even after payment */}
      <button
        type="button"
        onClick={() => setHelpOpen(true)}
        className="rounded-full border border-[var(--color-border)] bg-white px-3 py-2 text-xs font-medium text-[var(--color-muted-foreground)] transition hover:bg-[var(--color-muted)]"
        aria-label="開啟說明:網站有問題怎麼辦"
      >
        ❓ 有問題嗎?
      </button>

      {!paid ? (
        <>
          <span className="hidden max-w-[14rem] text-xs text-amber-700 sm:inline">
            ⚠️ 請先仔細檢查預覽(特別是圖片),確認後再付款。付款後無法退款。
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

      {helpOpen && (
        <HelpModal paid={paid} onClose={() => setHelpOpen(false)} />
      )}
    </div>
  );
}

/**
 * Floating help modal shown when the user clicks "有問題嗎?" on the
 * preview page. Covers the three most likely failure modes (broken
 * images, wrong content, other) with actionable advice. Intentionally
 * lives here instead of as its own file because it's only used once.
 */
function HelpModal({ paid, onClose }: { paid: boolean; onClose: () => void }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="help-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white p-8 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--color-primary)]">
              常見問題 · FAQ
            </p>
            <h2 id="help-title" className="mt-1 text-2xl font-black">
              網站有問題嗎?
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-[var(--color-border)] px-3 py-1 text-sm hover:bg-[var(--color-muted)]"
            aria-label="關閉說明視窗"
          >
            ✕
          </button>
        </div>

        <div className="mt-6 space-y-5 text-sm leading-relaxed">
          <article className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <h3 className="font-bold text-amber-900">🖼️ 圖片破掉 / 載入不出來</h3>
            <p className="mt-2 text-amber-900/80">
              AI 生成時會自動從 Facebook 粉專或 Unsplash 抓合適的圖片,
              偶爾會遇到圖片 URL 失效或 CORS 限制。如果你看到破圖:
            </p>
            <ul className="mt-2 space-y-1 text-amber-900/80">
              <li>
                1. <strong>請先不要付款</strong> — 免費預覽期間破圖的話付款後仍然會破
              </li>
              <li>
                2. 回到首頁,在「自訂圖片」欄位 <strong>直接上傳你自己的照片</strong>
                (店面、產品、環境照都可以),AI 會優先使用你上傳的圖片
              </li>
              <li>
                3. 如果你已經用完免費額度、也還沒付款,請寫信給我們申請重置
              </li>
            </ul>
          </article>

          <article className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
            <h3 className="font-bold text-blue-900">
              📝 內容不對 / 店家資訊錯誤
            </h3>
            <p className="mt-2 text-blue-900/80">
              AI 是依照你填入的「店名 / 產業類別 / 地址」來生成文案。如果文案不對:
            </p>
            <ul className="mt-2 space-y-1 text-blue-900/80">
              <li>• 檢查你填的「產業類別提示」是否夠具體(例:「手沖咖啡廳」比「咖啡」精準)</li>
              <li>• 同時填寫「地址」與「Google Maps 連結」會讓 AI 理解地區氛圍</li>
              {paid && (
                <li>
                  • <strong>完整版用戶</strong>:可以用 30 次修改額度調整內容(尚未開放,即將推出)
                </li>
              )}
            </ul>
          </article>

          <article className="rounded-2xl border border-green-200 bg-green-50 p-4">
            <h3 className="font-bold text-green-900">💬 其他問題 / 想要退款</h3>
            <p className="mt-2 text-green-900/80">
              原則上付款後 <strong>不提供退款</strong>,但如果是我們這邊的技術問題
              (例如生成出空白頁、完全無法下載),請聯繫我們協助處理:
            </p>
            <a
              href="mailto:srbow.tw@gmail.com?subject=5888%20網站助手%20客服&body=Site%20ID:%20"
              className="mt-3 inline-flex items-center gap-2 rounded-full bg-green-600 px-4 py-2 text-xs font-bold text-white hover:bg-green-700"
            >
              📧 srbow.tw@gmail.com
            </a>
          </article>
        </div>

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-[var(--color-foreground)] px-5 py-2 text-sm font-semibold text-[var(--color-background)] hover:opacity-90"
          >
            我了解了
          </button>
        </div>
      </div>
    </div>
  );
}
