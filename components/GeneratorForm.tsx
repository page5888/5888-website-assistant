"use client";

import { useState, type FormEvent, type ChangeEvent } from "react";
import { GenerationOverlay, type GenerationStatus } from "./GenerationOverlay";

interface FormState {
  storeName: string;
  sourceUrl: string;
  fbUrl: string;
  industryHint: string;
  address: string;
  phone: string;
  model: "sonnet" | "opus";
}

const initialForm: FormState = {
  storeName: "",
  sourceUrl: "",
  fbUrl: "",
  industryHint: "",
  address: "",
  phone: "",
  model: "sonnet",
};

export function GeneratorForm() {
  const [form, setForm] = useState<FormState>(initialForm);
  const [userImages, setUserImages] = useState<string[]>([]);
  const [status, setStatus] = useState<GenerationStatus>("idle");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loading = status === "running";

  function onChange(
    e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
  ) {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
  }

  async function onFiles(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []).slice(0, 10);
    const dataUrls = await Promise.all(
      files.map(
        (f) =>
          new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.onerror = reject;
            reader.readAsDataURL(f);
          }),
      ),
    );
    setUserImages(dataUrls);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setPreviewUrl(null);
    setStatus("running");

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, userImages }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "生成失敗");
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

      <Field label="店家名稱 *" name="storeName" required>
        <input
          name="storeName"
          required
          value={form.storeName}
          onChange={onChange}
          placeholder="例:花蓮瓊瑤打字行"
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

      <Field label="自訂圖片(選填,可多選)">
        <input
          type="file"
          accept="image/*"
          multiple
          onChange={onFiles}
          className="input"
          aria-label="上傳自訂圖片"
        />
        {userImages.length > 0 && (
          <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
            已選 {userImages.length} 張
          </p>
        )}
      </Field>

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

      <div className="md:col-span-2 flex items-center justify-between pt-2">
        <p className="text-xs text-[var(--color-muted-foreground)]">
          ⚠️ 免費版:一生 1 次生成 · 24 小時後自動消失
        </p>
        <button
          type="submit"
          disabled={loading || !form.storeName}
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
