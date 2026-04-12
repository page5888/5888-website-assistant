"use client";

import { useState } from "react";
import { ImageReplaceModal, type ImageSlotRow } from "./ImageReplaceModal";

export function PreviewActions({
  siteId,
  initialPaid,
  price,
  balance,
  images = [],
}: {
  siteId: string;
  initialPaid: boolean;
  price: number;
  balance: number;
  /** Image slots parsed from the stored HTML — only populated for paid sites. */
  images?: ImageSlotRow[];
}) {
  const [paid] = useState(initialPaid);
  const [busy, setBusy] = useState<"pay" | "deploy" | "download" | null>(null);
  const [deployResult, setDeployResult] = useState<{
    pagesUrl: string;
    repoUrl: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [replaceOpen, setReplaceOpen] = useState(false);

  // The 5888 central wallet does NOT support partial redemption. The user
  // can either (a) redeem the full order with points if balance >= price,
  // or (b) pay the full cash amount via ECPay. No mixing. See
  // memory/project_wallet_integration.md ("wallet does not support partial
  // redemption") for the rationale.
  const canRedeemFull = balance >= price;
  // false = pay cash via ECPay; true = redeem all points, skip ECPay
  const [redeemMode, setRedeemMode] = useState<boolean>(canRedeemFull);

  /**
   * Start checkout. We POST to /api/checkout with the chosen redemption mode.
   *   - Full redemption: server returns JSON { paid: true, redirect }
   *   - Cash:            server returns auto-submitting ECPay HTML form
   */
  async function pay() {
    setBusy("pay");
    setError(null);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          siteId,
          usePoints: redeemMode ? price : 0,
        }),
      });
      const contentType = res.headers.get("content-type") ?? "";
      if (!res.ok) {
        const data = contentType.includes("application/json")
          ? await res.json().catch(() => ({}))
          : {};
        throw new Error(data.error || `建立訂單失敗 (${res.status})`);
      }
      // Full-redemption path returns JSON with a redirect target
      if (contentType.includes("application/json")) {
        const data = (await res.json()) as { paid?: boolean; redirect?: string };
        if (data.paid && data.redirect) {
          window.location.href = data.redirect;
          return;
        }
        throw new Error("付款流程異常,請重試");
      }
      // Cash path returns an auto-submitting ECPay HTML form
      const html = await res.text();
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
          {/* Balance card — shown whenever the user has a wallet uid,
              even if balance is 0, so they know where they stand. */}
          <div className="flex flex-col items-end gap-0.5 rounded-2xl border border-[var(--color-border)] bg-white/80 px-3 py-2 backdrop-blur">
            <div className="flex items-center gap-2 text-xs text-[var(--color-muted-foreground)]">
              <span>💰 5888 點數餘額</span>
              <strong className="text-[var(--color-foreground)] tabular-nums">
                {balance.toLocaleString()}
              </strong>
            </div>
            {canRedeemFull ? (
              <label className="flex items-center gap-1 text-[11px] text-[var(--color-muted-foreground)]">
                <input
                  type="checkbox"
                  checked={redeemMode}
                  onChange={(e) => setRedeemMode(e.target.checked)}
                  disabled={busy === "pay"}
                  className="h-3 w-3 accent-[var(--color-primary)]"
                />
                使用 {price} 點免費解鎖
              </label>
            ) : (
              <span className="text-[11px] text-[var(--color-muted-foreground)]">
                累積至 {price} 點可全額免費解鎖(還差 {price - balance} 點)
              </span>
            )}
          </div>

          <span className="hidden max-w-[14rem] text-xs text-amber-700 sm:inline">
            ⚠️ 請先仔細檢查預覽(特別是圖片),確認後再付款。付款後無法退款。
          </span>
          <button
            type="button"
            onClick={pay}
            disabled={busy === "pay"}
            className="rounded-full bg-gradient-to-r from-[var(--color-primary)] to-[var(--color-accent)] px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-purple-500/30 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label={
              redeemMode ? `使用 ${price} 點免費解鎖` : `付款 NT$${price} 解鎖完整版`
            }
          >
            {busy === "pay"
              ? "處理中..."
              : redeemMode
                ? `🎁 使用 ${price} 點免費解鎖`
                : `💎 解鎖完整版 NT$${price}`}
          </button>
        </>
      ) : (
        <>
          <span className="hidden text-xs font-semibold text-green-700 sm:inline">
            ✨ 已解鎖完整版
          </span>
          <a
            href={`/preview/${encodeURIComponent(siteId)}/edit`}
            className="rounded-full border-2 border-[var(--color-primary)]/70 px-4 py-2 text-sm font-semibold text-[var(--color-primary)] hover:bg-[var(--color-primary)] hover:text-[var(--color-primary-foreground)]"
            aria-label="修改網站文字內容"
          >
            ✏️ 修改文字
          </a>
          {images.length > 0 && (
            <button
              type="button"
              onClick={() => setReplaceOpen(true)}
              disabled={busy !== null}
              className="rounded-full border-2 border-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-[var(--color-accent)] hover:bg-[var(--color-accent)] hover:text-white disabled:opacity-50"
              aria-label="更換網站上的圖片"
            >
              🖼️ 更換圖片
            </button>
          )}
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

      {replaceOpen && (
        <ImageReplaceModal
          siteId={siteId}
          initialImages={images}
          balance={balance}
          onClose={() => setReplaceOpen(false)}
        />
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
                  • <strong>完整版用戶</strong>:點上方的「✏️ 修改文字」可逐段調整內容,每個網站最多 30 次
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
