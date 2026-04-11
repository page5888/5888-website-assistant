"use client";

import { useState } from "react";
import { SLOTS, type SlotId } from "@/lib/imageSlots";

export interface ImageSlotRow {
  slotId: SlotId;
  currentUrl: string;
}

/**
 * Floating modal shown when a paid user clicks "🖼️ 更換圖片" in the
 * preview header. Lists every image slot the generated site uses, with
 * a thumbnail and a "更換" button per row.
 *
 * Flow per row:
 *   1. User picks a file in the native picker
 *   2. POST /api/upload-image (multipart) — sharp crops to slot aspect,
 *      returns a Vercel Blob URL
 *   3. POST /api/replace-image — rewrites stored HTML in Redis
 *   4. Local state + optional live iframe DOM patch shows the new image
 *      immediately so the user can verify before closing.
 *
 * On close we reload the page so the server-rendered iframe srcDoc is
 * fresh (covers cases where the in-place DOM patch didn't take).
 */
export function ImageReplaceModal({
  siteId,
  initialImages,
  onClose,
}: {
  siteId: string;
  initialImages: ImageSlotRow[];
  onClose: () => void;
}) {
  const [rows, setRows] = useState<ImageSlotRow[]>(initialImages);
  const [busySlot, setBusySlot] = useState<SlotId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  async function handleFile(slotId: SlotId, file: File) {
    setBusySlot(slotId);
    setError(null);
    try {
      // 1. Upload — this goes through sharp + Vercel Blob
      const fd = new FormData();
      fd.append("file", file);
      fd.append("slotId", slotId);
      const upRes = await fetch("/api/upload-image", {
        method: "POST",
        body: fd,
      });
      const upData = await upRes.json().catch(() => ({}));
      if (!upRes.ok) {
        throw new Error(upData.error || `上傳失敗 (${upRes.status})`);
      }
      const newUrl = upData.url as string;

      // 2. Rewrite stored HTML
      const rpRes = await fetch("/api/replace-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId, slotId, url: newUrl }),
      });
      const rpData = await rpRes.json().catch(() => ({}));
      if (!rpRes.ok) {
        throw new Error(rpData.error || `替換失敗 (${rpRes.status})`);
      }

      // 3. Optimistic local update
      setRows((prev) =>
        prev.map((r) => (r.slotId === slotId ? { ...r, currentUrl: newUrl } : r)),
      );
      setTouched(true);

      // 4. Try to update the live iframe DOM so the user sees the swap
      //    immediately. Best-effort — if CORS/sandbox blocks it, the
      //    close button will reload the whole page anyway.
      try {
        const iframe = document.querySelector("iframe") as HTMLIFrameElement | null;
        const doc = iframe?.contentDocument;
        if (doc) {
          const imgs = doc.querySelectorAll<HTMLImageElement>(
            `img[data-5888-slot="${slotId}"]`,
          );
          imgs.forEach((img) => {
            img.removeAttribute("srcset");
            img.src = newUrl;
          });
        }
      } catch {
        // ignore — page reload on close covers it
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusySlot(null);
    }
  }

  function handleClose() {
    if (touched) {
      // Reload so the server-rendered srcDoc matches the new Redis state
      window.location.reload();
    } else {
      onClose();
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="replace-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={handleClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-3xl bg-white p-8 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--color-primary)]">
              付款後專屬 · POST-PAID
            </p>
            <h2 id="replace-title" className="mt-1 text-2xl font-black">
              更換網站圖片
            </h2>
            <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
              點選任一張圖片的「換圖」,上傳新照片即可立即替換。系統會自動依照正確比例裁切。
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-full border border-[var(--color-border)] px-3 py-1 text-sm hover:bg-[var(--color-muted)]"
            aria-label="關閉圖片更換視窗"
          >
            ✕
          </button>
        </div>

        {error && (
          <div
            role="alert"
            className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          >
            {error}
          </div>
        )}

        {rows.length === 0 ? (
          <p className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-6 text-center text-sm text-amber-800">
            這個網站沒有可更換的圖片位置,可能是舊版生成的檔案。
          </p>
        ) : (
          <ul className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {rows.map((row) => {
              const slot = SLOTS.find((s) => s.id === row.slotId);
              const label = slot?.label ?? row.slotId;
              const hint = slot?.hint ?? "";
              const busy = busySlot === row.slotId;
              return (
                <li
                  key={row.slotId}
                  className="flex items-center gap-3 rounded-2xl border border-[var(--color-border)] bg-white p-3"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={row.currentUrl}
                    alt={`${label} 目前的圖片`}
                    className="h-16 w-24 flex-shrink-0 rounded-lg object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">
                      {slot?.emoji} {label}
                    </p>
                    <p className="truncate text-[11px] text-[var(--color-muted-foreground)]">
                      {hint}
                    </p>
                  </div>
                  <label
                    className={`inline-flex cursor-pointer items-center justify-center rounded-full border border-[var(--color-primary)] px-3 py-1.5 text-xs font-semibold text-[var(--color-primary)] hover:bg-[var(--color-primary)] hover:text-[var(--color-primary-foreground)] ${
                      busy ? "pointer-events-none opacity-50" : ""
                    }`}
                  >
                    {busy ? "處理中…" : "換圖"}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={busy}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleFile(row.slotId, f);
                        e.target.value = ""; // allow re-selecting same file
                      }}
                    />
                  </label>
                </li>
              );
            })}
          </ul>
        )}

        <div className="mt-6 flex items-center justify-between">
          <p className="text-[11px] text-[var(--color-muted-foreground)]">
            ※ 每次換圖會產生一張新圖檔,舊的會保留在雲端空間,不會被刪除。
          </p>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-full bg-[var(--color-foreground)] px-5 py-2 text-sm font-semibold text-[var(--color-background)] hover:opacity-90"
          >
            {touched ? "完成並重新載入" : "關閉"}
          </button>
        </div>
      </div>
    </div>
  );
}
