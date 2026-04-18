"use client";

import { useState, type FormEvent, type ChangeEvent } from "react";
import { GenerationOverlay, type GenerationStatus } from "./GenerationOverlay";
import { ImageSlotGrid, type FilledSlot } from "./ImageSlotGrid";
import { MIN_REQUIRED_SLOTS, SLOTS, type SlotId } from "@/lib/imageSlots";

interface FormState {
  storeName: string;
  sourceUrl: string;
  fbUrl: string;
  industryHint: string;
  address: string;
  phone: string;
  model: "sonnet" | "opus";
  template: "auto" | "editorial" | "bold";
}

const initialForm: FormState = {
  storeName: "",
  sourceUrl: "",
  fbUrl: "",
  industryHint: "",
  address: "",
  phone: "",
  model: "sonnet",
  template: "auto",
};

export function GeneratorForm() {
  const [form, setForm] = useState<FormState>(initialForm);
  const [slots, setSlots] = useState<Partial<Record<SlotId, FilledSlot>>>({});
  const [status, setStatus] = useState<GenerationStatus>("idle");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loading = status === "running";

  // Count required slots filled so we can gate the submit button and
  // show a helpful hint when the user is still missing photos.
  const requiredSlotsFilled = SLOTS.filter(
    (s) => s.required && slots[s.id],
  ).length;
  const canSubmit =
    !loading &&
    form.storeName.trim().length > 0 &&
    requiredSlotsFilled >= MIN_REQUIRED_SLOTS;

  function onChange(
    e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
  ) {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setPreviewUrl(null);
    setStatus("running");

    // Build the slot array in the canonical SLOTS order so the prompt
    // always gets hero first, then products, then interior, etc.
    const imageSlots = SLOTS.filter((s) => slots[s.id]).map((s) => ({
      slotId: s.id,
      url: slots[s.id]!.url,
      promptRole: s.promptRole,
      label: s.label,
    }));

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, imageSlots }),
      });

      const data = await res.json();
      if (!res.ok) {
        const detail = data.detail ? ` (${String(data.detail).slice(0, 200)})` : "";
        throw new Error((data.error || "生成失敗") + detail);
      }

      // Do NOT auto-navigate. Let the user click through themselves so
      // they feel in control, and so they can admire the finished card.
      setPreviewUrl(data.previewUrl as string);
      setStatus("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus("error");
    }
  }

  function closeOverlay() {
    setStatus("idle");
    setError(null);
  }

  return (
    <form
      onSubmit={onSubmit}
      className="grid gap-6 rounded-3xl border bg-white/60 p-8 shadow-sm md:grid-cols-2"
      aria-labelledby="form-title"
    >
      <h2
        id="form-title"
        className="md:col-span-2 text-2xl font-bold tracking-tight"
      >
        🎨 店家資料輸入
      </h2>

      {/* Rules info card — always visible so users know exactly what
          they get before hitting "開始生成". Historically users were
          confused about lifetime-free vs daily-free, and didn't know
          there was a 24h TTL on the preview. */}
      <section
        aria-labelledby="rules-title"
        className="md:col-span-2 rounded-2xl border border-[var(--color-primary)]/20 bg-gradient-to-br from-amber-50 via-white to-purple-50 p-5 text-sm"
      >
        <div className="flex items-start gap-3">
          <span
            aria-hidden
            className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100 text-lg"
          >
            💡
          </span>
          <div className="flex-1">
            <h3 id="rules-title" className="font-bold text-[var(--color-foreground)]">
              生成規則 · 請先閱讀
            </h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-amber-200 bg-white/80 p-3">
                <p className="text-xs font-bold uppercase tracking-wider text-amber-700">
                  🆓 免費版
                </p>
                <ul className="mt-2 space-y-1 text-xs text-[var(--color-muted-foreground)]">
                  <li>• 每個帳號 <strong>終身 2 次</strong> 免費生成</li>
                  <li>• 預覽網頁 <strong>24 小時後自動消失</strong></li>
                  <li>• 成品會有 5888 浮水印</li>
                  <li>• 不可下載 / 不可部署</li>
                </ul>
              </div>
              <div className="rounded-xl border border-purple-200 bg-white/80 p-3">
                <p className="text-xs font-bold uppercase tracking-wider text-purple-700">
                  💎 完整版 · NT$490 / 單一網站
                </p>
                <ul className="mt-2 space-y-1 text-xs text-[var(--color-muted-foreground)]">
                  <li>• 移除浮水印 · <strong>永久保留</strong></li>
                  <li>• 下載 index.html / 一鍵部署 GitHub Pages</li>
                  <li>• 可 <strong>逐段修改文字</strong>(最多 30 次)</li>
                  <li>• 可 <strong>逐張替換圖片</strong>(版位數 = 生成時上傳張數)</li>
                  <li>• 想做第二個網站需再付一次 NT$490</li>
                </ul>
              </div>
            </div>
            <p className="mt-3 text-xs text-[var(--color-muted-foreground)]">
              ⚠️ 生成前請務必確認店名、類別、圖片都正確;免費版只有 <strong>2 次</strong> 機會,
              生成後請 <strong>仔細檢查預覽</strong>,
              確認無誤再付款解鎖。付款後無法退款。
            </p>
            <p className="mt-2 text-xs text-amber-700">
              📸 <strong>圖片版位一次定型</strong> — 你現在上傳幾張,生成後可替換的也是幾張,<strong>事後無法增加新版位</strong>,請盡量上傳完整一點。
            </p>
          </div>
        </div>
      </section>

      <Field label="店家名稱 *" name="storeName" required>
        <input
          name="storeName"
          required
          value={form.storeName}
          onChange={onChange}
          placeholder="例:幸福瓢蟲手作雜貨"
          className="input"
          aria-label="店家名稱"
        />
      </Field>

      <Field label="產業類別提示">
        <input
          name="industryHint"
          value={form.industryHint}
          onChange={onChange}
          placeholder="例:咖啡廳、麵店、美髮沙龍"
          className="input"
          aria-label="產業類別"
        />
      </Field>

      <Field label="Google Maps 地標連結" className="md:col-span-2">
        <input
          name="sourceUrl"
          type="url"
          value={form.sourceUrl}
          onChange={onChange}
          placeholder="https://maps.google.com/..."
          className="input"
          aria-label="Google Maps 連結"
        />
      </Field>

      <Field label="Facebook 粉專連結" className="md:col-span-2">
        <input
          name="fbUrl"
          type="url"
          value={form.fbUrl}
          onChange={onChange}
          placeholder="https://www.facebook.com/..."
          className="input"
          aria-label="Facebook 粉專"
        />
      </Field>

      <Field label="地址">
        <input
          name="address"
          value={form.address}
          onChange={onChange}
          placeholder="花蓮縣花蓮市..."
          className="input"
          aria-label="地址"
        />
      </Field>

      <Field label="電話">
        <input
          name="phone"
          value={form.phone}
          onChange={onChange}
          placeholder="03-xxxxxxx"
          className="input"
          aria-label="電話"
        />
      </Field>

      <Field label="設計模板">
        <select
          name="template"
          value={form.template}
          onChange={onChange}
          className="input"
          aria-label="設計模板"
        >
          <option value="auto">自動選擇（依產業判斷）</option>
          <option value="editorial">雜誌風 — 大留白、左右分割、優雅（咖啡/花藝/選品）</option>
          <option value="bold">衝擊風 — 全版大圖、暗底白字、強烈（餐廳/健身/汽修）</option>
        </select>
      </Field>

      <Field label="AI 模型選擇">
        <select
          name="model"
          value={form.model}
          onChange={onChange}
          className="input"
          aria-label="AI 模型"
        >
          <option value="sonnet">Claude Sonnet 4.6(快,品質好)</option>
          <option value="opus">Claude Opus 4.6(最頂級,較慢)</option>
        </select>
      </Field>

      <ImageSlotGrid value={slots} onChange={setSlots} />

      {error && status !== "error" && (
        <div
          role="alert"
          className="md:col-span-2 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          ⚠️ {error}
        </div>
      )}

      <GenerationOverlay
        status={status}
        error={error}
        previewUrl={previewUrl}
        onRetry={closeOverlay}
      />

      <div className="md:col-span-2 flex flex-wrap items-center justify-end gap-3 pt-2">
        {!canSubmit && !loading && (
          <p className="text-xs text-[var(--color-muted-foreground)]">
            {form.storeName.trim().length === 0
              ? "請先填寫店家名稱"
              : `還需上傳 ${MIN_REQUIRED_SLOTS - requiredSlotsFilled} 張必填照片`}
          </p>
        )}
        <button
          type="submit"
          disabled={!canSubmit}
          className="rounded-full bg-[var(--color-primary)] px-8 py-3 text-base font-semibold text-[var(--color-primary-foreground)] shadow-lg transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="開始生成網站"
        >
          {loading ? "生成中..." : "🚀 開始生成"}
        </button>
      </div>

      <style jsx>{`
        .input {
          width: 100%;
          border-radius: 0.75rem;
          border: 1px solid var(--color-border);
          background: white;
          padding: 0.625rem 0.875rem;
          font-size: 0.95rem;
          transition: all 0.15s;
        }
        .input:focus {
          outline: none;
          border-color: var(--color-primary);
          box-shadow: 0 0 0 3px color-mix(in oklch, var(--color-primary) 20%, transparent);
        }
      `}</style>
    </form>
  );
}

function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  name?: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`flex flex-col gap-1.5 ${className}`}>
      <span className="text-sm font-medium">{label}</span>
      {children}
    </label>
  );
}
