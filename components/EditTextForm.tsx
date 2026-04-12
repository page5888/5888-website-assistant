"use client";

import { useMemo, useState } from "react";
import type { TextSlot } from "@/lib/textSlots";
import { labelForKey } from "@/lib/textSlots";

/**
 * Client component for the text edit page.
 *
 * Shows one `<textarea>` per extracted `data-5888-text` slot. We
 * auto-group the slots into friendly sections (hero / section.* /
 * service.* / faq.* / contact.* / about.*) based on their key prefix
 * so a long site doesn't become one wall of 30 textareas.
 *
 * Only "dirty" fields are POSTed to /api/edit-text. This avoids wasting
 * the per-site edit counter (MAX_EDITS_PER_SITE) when the user clicks
 * save without having actually changed anything.
 *
 * On success the form reloads the page so the remaining-count header
 * and the underlying field values are re-read fresh from Redis.
 */
export function EditTextForm({
  siteId,
  slots,
  initialRemaining,
}: {
  siteId: string;
  slots: TextSlot[];
  initialRemaining: number;
}) {
  // Baseline copy — used to compute "dirty" so we only POST changed fields.
  const initialValues = useMemo(() => {
    const o: Record<string, string> = {};
    for (const s of slots) o[s.key] = s.value;
    return o;
  }, [slots]);

  const [values, setValues] = useState<Record<string, string>>(initialValues);
  const [status, setStatus] = useState<
    | { kind: "idle" }
    | { kind: "saving" }
    | { kind: "ok"; remaining: number; changed: boolean }
    | { kind: "error"; message: string }
  >({ kind: "idle" });

  // Group keys by top-level prefix for display. Order follows the
  // first occurrence of each prefix in `slots` (which follows document
  // order, which is how the AI laid the page out).
  const groups = useMemo(() => groupSlots(slots), [slots]);

  const dirtyKeys = Object.keys(values).filter(
    (k) => values[k] !== initialValues[k],
  );

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (dirtyKeys.length === 0) {
      setStatus({
        kind: "error",
        message: "沒有修改任何欄位,不需要儲存",
      });
      return;
    }
    setStatus({ kind: "saving" });
    try {
      const edits: Record<string, string> = {};
      for (const k of dirtyKeys) edits[k] = values[k];
      const res = await fetch("/api/edit-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId, edits }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        changed?: boolean;
        editsRemaining?: number;
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.error || `儲存失敗 (${res.status})`);
      }
      setStatus({
        kind: "ok",
        remaining: data.editsRemaining ?? initialRemaining,
        changed: Boolean(data.changed),
      });
      // Reload so the server re-reads the fresh HTML for the form.
      // Small delay so the user sees the success toast first.
      setTimeout(() => window.location.reload(), 1200);
    } catch (err) {
      setStatus({
        kind: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-10">
      {groups.map((group) => (
        <section
          key={group.title}
          className="rounded-3xl border border-[var(--color-border)] bg-white p-6 shadow-sm"
        >
          <h2 className="mb-4 text-lg font-bold tracking-tight">
            {group.title}
          </h2>
          <div className="space-y-4">
            {group.slots.map((slot) => {
              const isDirty = values[slot.key] !== initialValues[slot.key];
              const label = labelForKey(slot.key);
              const isHeading = /^h[1-6]$/i.test(slot.tag);
              return (
                <div key={slot.key}>
                  <label
                    htmlFor={`f-${slot.key}`}
                    className="flex items-center justify-between text-xs font-semibold text-[var(--color-foreground)]/80"
                  >
                    <span>
                      {label}
                      <span className="ml-2 font-mono text-[10px] text-[var(--color-muted-foreground)]">
                        {slot.tag} · {slot.key}
                      </span>
                    </span>
                    {isDirty && (
                      <span className="text-[10px] font-bold text-amber-700">
                        已修改
                      </span>
                    )}
                  </label>
                  <textarea
                    id={`f-${slot.key}`}
                    value={values[slot.key] ?? ""}
                    onChange={(e) =>
                      setValues((prev) => ({
                        ...prev,
                        [slot.key]: e.target.value,
                      }))
                    }
                    rows={isHeading ? 2 : 3}
                    className={`mt-1 w-full rounded-xl border bg-white p-3 text-sm leading-relaxed focus:border-[var(--color-primary)] focus:outline-none ${
                      isDirty
                        ? "border-amber-400"
                        : "border-[var(--color-border)]"
                    }`}
                  />
                </div>
              );
            })}
          </div>
        </section>
      ))}

      <div className="sticky bottom-4 z-10 flex items-center justify-between gap-4 rounded-2xl border border-[var(--color-border)] bg-white/95 px-5 py-4 shadow-lg backdrop-blur">
        <div className="text-xs text-[var(--color-muted-foreground)]">
          {dirtyKeys.length > 0 ? (
            <>
              已修改 <strong>{dirtyKeys.length}</strong> 個欄位 —
              儲存後會扣 1 次修改次數
            </>
          ) : (
            "尚未修改任何欄位"
          )}
          {status.kind === "error" && (
            <span className="ml-3 text-red-600">⚠ {status.message}</span>
          )}
          {status.kind === "ok" && (
            <span className="ml-3 text-green-700">
              ✓ {status.changed ? "已儲存,頁面即將重新整理" : "沒有變更"}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setValues(initialValues)}
            disabled={status.kind === "saving" || dirtyKeys.length === 0}
            className="rounded-full border border-[var(--color-border)] px-4 py-2 text-xs font-semibold text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)] disabled:opacity-40"
          >
            放棄變更
          </button>
          <button
            type="submit"
            disabled={status.kind === "saving" || dirtyKeys.length === 0}
            className="rounded-full bg-gradient-to-r from-[var(--color-primary)] to-[var(--color-accent)] px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-purple-500/30 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {status.kind === "saving" ? "儲存中..." : "💾 儲存變更"}
          </button>
        </div>
      </div>
    </form>
  );
}

/**
 * Group slots by top-level key prefix, preserving the document order
 * of each group's first appearance. Returns one section per group.
 */
function groupSlots(
  slots: TextSlot[],
): Array<{ title: string; slots: TextSlot[] }> {
  const order: string[] = [];
  const bucket: Record<string, TextSlot[]> = {};
  for (const slot of slots) {
    const prefix = getPrefix(slot.key);
    if (!bucket[prefix]) {
      bucket[prefix] = [];
      order.push(prefix);
    }
    bucket[prefix].push(slot);
  }
  return order.map((prefix) => ({
    title: titleForPrefix(prefix),
    slots: bucket[prefix],
  }));
}

function getPrefix(key: string): string {
  const parts = key.split(".");
  // section.<name>.* → group by section name
  if (parts[0] === "section" && parts.length >= 2) {
    return `section.${parts[1]}`;
  }
  // service.<n>.* → group under "services"
  if (parts[0] === "service") return "service";
  // faq.<n>.* → group under "faq"
  if (parts[0] === "faq") return "faq";
  // about.body.<n> or about.*
  if (parts[0] === "about") return "about";
  // Everything else by first segment (hero, contact, etc.)
  return parts[0];
}

function titleForPrefix(prefix: string): string {
  const map: Record<string, string> = {
    hero: "封面 Hero",
    about: "品牌故事 About",
    service: "商品 / 服務",
    faq: "常見問題 FAQ",
    contact: "聯絡資訊",
    "section.about": "品牌故事區塊",
    "section.services": "商品 / 服務區塊",
    "section.products": "商品 / 服務區塊",
    "section.story": "品牌故事區塊",
    "section.faq": "常見問題區塊",
    "section.contact": "聯絡資訊區塊",
    "section.gallery": "作品集區塊",
    "section.menu": "菜單區塊",
    "section.team": "團隊區塊",
  };
  return map[prefix] ?? prefix;
}
