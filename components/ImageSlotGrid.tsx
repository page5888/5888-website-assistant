"use client";

import { useState, useRef, useCallback } from "react";
import { SLOTS, type SlotId, type SlotDefinition } from "@/lib/imageSlots";

/**
 * One filled slot in the parent form state. Holds the Blob URL after
 * upload so we can POST it to /api/generate, plus the size we shrank
 * the user-facing thumbnail down to for fast rendering.
 */
export interface FilledSlot {
  slotId: SlotId;
  url: string;
  previewDataUrl: string;
}

interface Props {
  value: Partial<Record<SlotId, FilledSlot>>;
  onChange: (next: Partial<Record<SlotId, FilledSlot>>) => void;
}

/**
 * Max dimension for the in-browser preview thumbnail. Keeping it small
 * makes the form page snappy even with 10 photos. The full-res image
 * lives in Blob — this is purely a client-side thumbnail.
 */
const PREVIEW_MAX_DIM = 320;
/**
 * Max dimension of the upload we send to the server. We compress in the
 * browser first so phone users on 4G don't have to wait forever.
 * 1920 is enough for the hero's target 1920×1080.
 */
const UPLOAD_MAX_DIM = 1920;

export function ImageSlotGrid({ value, onChange }: Props) {
  const filledCount = Object.keys(value).length;
  const requiredFilledCount = SLOTS.filter(
    (s) => s.required && value[s.id],
  ).length;
  const allRequiredDone = requiredFilledCount === SLOTS.filter((s) => s.required).length;

  return (
    <div className="md:col-span-2 rounded-2xl border border-[var(--color-border)] bg-white/60 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--color-primary)]">
            📸 上傳店家照片(至少 3 張)
          </h3>
          <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
            每一格都有明確用途,請照標籤上傳對應的照片。前 3 格 <strong>必填</strong>,
            後 7 格選填 — 上傳越多,AI 能做出越豐富的網站。
          </p>
        </div>
        <div
          className={`rounded-full px-3 py-1.5 text-xs font-bold ${
            allRequiredDone
              ? "bg-green-100 text-green-700"
              : "bg-amber-100 text-amber-700"
          }`}
        >
          {allRequiredDone
            ? `✓ 已上傳 ${filledCount} / 10`
            : `${requiredFilledCount} / 3 必填已完成`}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
        {SLOTS.map((slot) => (
          <SlotCell
            key={slot.id}
            slot={slot}
            filled={value[slot.id]}
            onFilled={(filled) => onChange({ ...value, [slot.id]: filled })}
            onRemove={() => {
              const next = { ...value };
              delete next[slot.id];
              onChange(next);
            }}
          />
        ))}
      </div>
    </div>
  );
}

function SlotCell({
  slot,
  filled,
  onFilled,
  onRemove,
}: {
  slot: SlotDefinition;
  filled: FilledSlot | undefined;
  onFilled: (f: FilledSlot) => void;
  onRemove: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openPicker = useCallback(() => inputRef.current?.click(), []);

  async function onFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("請選擇圖片檔");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      // 1. Client-side compression: shrink to UPLOAD_MAX_DIM on the
      //    longest edge, re-encode as JPEG. Saves 80%+ of upload time
      //    for phone photos.
      const compressedBlob = await compressImage(file, UPLOAD_MAX_DIM, 0.85);

      // 2. Tiny preview thumb for the grid cell.
      const previewDataUrl = await compressImageToDataUrl(
        file,
        PREVIEW_MAX_DIM,
        0.72,
      );

      // 3. Ship it to /api/upload-image
      const form = new FormData();
      form.append("file", compressedBlob, file.name.replace(/\.[^.]+$/, ".jpg"));
      form.append("slotId", slot.id);

      const res = await fetch("/api/upload-image", {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `上傳失敗 (${res.status})`);
      }

      onFilled({
        slotId: slot.id,
        url: data.url,
        previewDataUrl,
      });
    } catch (err) {
      console.error("[slot-upload]", err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-col">
      <label
        className="mb-1.5 flex items-center gap-1 text-[11px] font-semibold text-[var(--color-foreground)]"
        title={slot.hint}
      >
        <span>
          {slot.emoji} {slot.label}
        </span>
        {slot.required && <span className="text-red-500">*</span>}
      </label>

      <button
        type="button"
        onClick={filled ? undefined : openPicker}
        disabled={busy}
        className={`group relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-xl border-2 transition ${
          filled
            ? "border-solid border-[var(--color-primary)]"
            : "border-dashed border-[var(--color-border)] hover:border-[var(--color-primary)] hover:bg-[var(--color-muted)]"
        } ${busy ? "opacity-60" : ""}`}
        aria-label={`上傳 ${slot.label}`}
      >
        {busy ? (
          <div className="flex flex-col items-center gap-1">
            <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-[var(--color-primary)] border-t-transparent" />
            <span className="text-[10px] text-[var(--color-muted-foreground)]">
              處理中...
            </span>
          </div>
        ) : filled ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={filled.previewDataUrl}
              alt={slot.label}
              className="h-full w-full object-cover"
            />
            <div className="absolute inset-x-0 bottom-0 flex gap-1 bg-gradient-to-t from-black/80 to-transparent p-2 opacity-0 transition group-hover:opacity-100">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  openPicker();
                }}
                className="flex-1 rounded-md bg-white/90 px-2 py-1 text-[10px] font-bold text-black hover:bg-white"
              >
                更換
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove();
                }}
                className="rounded-md bg-red-500 px-2 py-1 text-[10px] font-bold text-white hover:bg-red-600"
              >
                刪除
              </button>
            </div>
            <div className="absolute top-1 right-1 rounded-full bg-green-500 p-0.5 text-white shadow">
              <svg
                aria-hidden
                className="h-3 w-3"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center gap-1 text-center">
            <span className="text-2xl">{slot.emoji}</span>
            <span className="text-[10px] leading-tight text-[var(--color-muted-foreground)]">
              {slot.hint}
            </span>
            <span className="text-[9px] font-bold text-[var(--color-primary)]">
              點擊上傳
            </span>
          </div>
        )}
      </button>

      {error && (
        <p className="mt-1 text-[10px] text-red-600" role="alert">
          {error}
        </p>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onFileSelected}
      />
    </div>
  );
}

/**
 * Resize an image file to fit within `maxDim` on the longest side,
 * re-encode as JPEG at the given quality, and return a Blob.
 * Runs entirely in-browser via Canvas — no server round-trip.
 */
async function compressImage(
  file: File,
  maxDim: number,
  quality: number,
): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const { width, height } = fitWithin(bitmap.width, bitmap.height, maxDim);

  const canvas =
    typeof OffscreenCanvas !== "undefined"
      ? new OffscreenCanvas(width, height)
      : Object.assign(document.createElement("canvas"), { width, height });
  const ctx = (canvas as HTMLCanvasElement).getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();

  if ("convertToBlob" in canvas) {
    return (canvas as OffscreenCanvas).convertToBlob({
      type: "image/jpeg",
      quality,
    });
  }
  return new Promise<Blob>((resolve, reject) => {
    (canvas as HTMLCanvasElement).toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("toBlob failed"))),
      "image/jpeg",
      quality,
    );
  });
}

async function compressImageToDataUrl(
  file: File,
  maxDim: number,
  quality: number,
): Promise<string> {
  const blob = await compressImage(file, maxDim, quality);
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function fitWithin(w: number, h: number, maxDim: number) {
  if (w <= maxDim && h <= maxDim) return { width: w, height: h };
  const scale = Math.min(maxDim / w, maxDim / h);
  return {
    width: Math.round(w * scale),
    height: Math.round(h * scale),
  };
}
