"use client";

import { useState } from "react";

/**
 * Admin-only floating button that lets the current (admin) user wipe
 * their own rate-limit keys so they can generate again without waiting
 * 24h. Rendered from layout based on session email matching
 * ADMIN_EMAILS env var.
 */
export function AdminResetButton() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function reset() {
    if (!confirm("確定要重置您自己的每日生成額度嗎?")) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/reset", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      // Log full breakdown to console for deeper debugging
      console.log("[admin-reset]", data);
      const n = typeof data.totalDeleted === "number" ? data.totalDeleted : 0;
      setMsg(
        n > 0
          ? `✅ 已清除 ${n} 個限額 key,可以繼續測試了`
          : "⚠️ 沒有找到任何限額 key — 你本來就沒被擋,可以直接生成",
      );
    } catch (err) {
      setMsg(
        "❌ 重置失敗:" + (err instanceof Error ? err.message : String(err)),
      );
    } finally {
      setBusy(false);
      setTimeout(() => setMsg(null), 6000);
    }
  }

  return (
    <div className="fixed bottom-4 left-4 z-40 flex flex-col items-start gap-2">
      <button
        type="button"
        onClick={reset}
        disabled={busy}
        className="rounded-full border border-purple-400/50 bg-purple-900/80 px-4 py-2 text-xs font-semibold text-purple-100 shadow-lg backdrop-blur hover:bg-purple-800 disabled:opacity-50"
        aria-label="管理員:重置我的生成額度"
        title="Admin: reset my daily quota"
      >
        {busy ? "重置中..." : "🔓 Admin · 重置我的額度"}
      </button>
      {msg && (
        <div
          className="max-w-xs rounded-xl border border-white/10 bg-black/80 px-3 py-2 text-xs text-white shadow-xl"
          role="status"
        >
          {msg}
        </div>
      )}
    </div>
  );
}
