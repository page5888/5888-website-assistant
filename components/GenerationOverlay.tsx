"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Full-screen overlay shown while Claude is generating the HTML.
 *
 * Design goals:
 *  - Make the 30-90 second wait feel shorter by rotating through a
 *    long cast of "team members" each doing their own task.
 *  - Show an estimated progress bar (cosmetic — based on elapsed time
 *    not actual backend progress) so the user gets visible feedback.
 *  - Keep it accessible: aria-live region + descriptive labels.
 *  - When `status === "done"`, replace the whole thing with a single
 *    "前往預覽" button — we do NOT auto-navigate, per user request.
 */

export type GenerationStatus = "idle" | "running" | "done" | "error";

interface StageMessage {
  emoji: string;
  role: string;
  text: string;
  colorFrom: string;
  colorTo: string;
}

const STAGES: StageMessage[] = [
  {
    emoji: "🕵️",
    role: "市場研究員",
    text: "正在分析您的產業與目標客群...",
    colorFrom: "#a855f7",
    colorTo: "#6366f1",
  },
  {
    emoji: "📊",
    role: "數據分析師",
    text: "調查同業競爭者並抓出致勝關鍵字...",
    colorFrom: "#6366f1",
    colorTo: "#06b6d4",
  },
  {
    emoji: "🎯",
    role: "品牌策略長",
    text: "提煉您的核心賣點與獨特價值主張...",
    colorFrom: "#06b6d4",
    colorTo: "#14b8a6",
  },
  {
    emoji: "✍️",
    role: "資深文案",
    text: "撰寫能打動人心的標題與介紹...",
    colorFrom: "#14b8a6",
    colorTo: "#84cc16",
  },
  {
    emoji: "🎨",
    role: "視覺設計師",
    text: "挑選配色與字型,調製專屬氛圍...",
    colorFrom: "#84cc16",
    colorTo: "#eab308",
  },
  {
    emoji: "🖌️",
    role: "UI 設計師",
    text: "排版各區塊的間距與層次...",
    colorFrom: "#eab308",
    colorTo: "#f97316",
  },
  {
    emoji: "📸",
    role: "藝術指導",
    text: "為每個區塊挑選最有感染力的圖片...",
    colorFrom: "#f97316",
    colorTo: "#ef4444",
  },
  {
    emoji: "🖼️",
    role: "AI 繪師",
    text: "生成獨家配圖,讓畫面不再千篇一律...",
    colorFrom: "#ef4444",
    colorTo: "#ec4899",
  },
  {
    emoji: "💡",
    role: "UX 顧問",
    text: "設計訪客的閱讀動線與行動按鈕...",
    colorFrom: "#ec4899",
    colorTo: "#a855f7",
  },
  {
    emoji: "📱",
    role: "前端工程師",
    text: "撰寫響應式 CSS,確保手機平板都好看...",
    colorFrom: "#a855f7",
    colorTo: "#8b5cf6",
  },
  {
    emoji: "🔍",
    role: "SEO 專員",
    text: "注入結構化資料,讓 Google 認識您...",
    colorFrom: "#8b5cf6",
    colorTo: "#6366f1",
  },
  {
    emoji: "♿",
    role: "無障礙稽核員",
    text: "檢查顏色對比與 alt 文字...",
    colorFrom: "#6366f1",
    colorTo: "#0ea5e9",
  },
  {
    emoji: "⚡",
    role: "效能工程師",
    text: "壓縮程式碼,確保載入速度飛快...",
    colorFrom: "#0ea5e9",
    colorTo: "#06b6d4",
  },
  {
    emoji: "🧪",
    role: "品質把關員",
    text: "跨瀏覽器驗證與最後潤飾...",
    colorFrom: "#06b6d4",
    colorTo: "#14b8a6",
  },
  {
    emoji: "🎁",
    role: "產品經理",
    text: "正在為您的網站繫上最後的蝴蝶結...",
    colorFrom: "#14b8a6",
    colorTo: "#a855f7",
  },
];

const TRIVIA = [
  "💡 你知道嗎?專業網頁設計師平均需要 3 天才能完成一個網站,而 AI 只需 2 分鐘。",
  "💡 76% 的消費者在訪問網站後會決定是否信任一家店,設計真的很重要。",
  "💡 每位訪客平均只花 15 秒決定要不要繼續留下,所以第一印象非常關鍵。",
  "💡 Google 研究指出,載入超過 3 秒的網站會失去 53% 的訪客。",
  "💡 結構化資料(Schema.org)能讓你的網站在搜尋結果中多出星星評分與營業時間。",
  "💡 AEO(Answer Engine Optimization)是 SEO 的下一代,專為 ChatGPT 和 Gemini 優化。",
  "💡 手機流量已經佔網頁瀏覽 65%,響應式設計早就不是選項而是必備。",
  "💡 研究顯示,有專業網站的店家平均營收比沒有的高 34%。",
  "💡 色彩心理學:藍色代表信任,綠色代表活力,紫色代表創意。",
  "💡 「Above the fold」黃金區塊 — 訪客第一眼看到的區域決定轉換率。",
];

export function GenerationOverlay({
  status,
  error,
  previewUrl,
  onRetry,
}: {
  status: GenerationStatus;
  error?: string | null;
  previewUrl?: string | null;
  onRetry?: () => void;
}) {
  const [stageIdx, setStageIdx] = useState(0);
  const [triviaIdx, setTriviaIdx] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef<number | null>(null);

  // Start / stop timers based on status
  useEffect(() => {
    if (status !== "running") {
      startRef.current = null;
      setElapsed(0);
      return;
    }

    startRef.current = Date.now();
    setStageIdx(0);
    setTriviaIdx(Math.floor(Math.random() * TRIVIA.length));

    const tickElapsed = setInterval(() => {
      if (startRef.current) {
        setElapsed((Date.now() - startRef.current) / 1000);
      }
    }, 100);

    // Rotate stage every ~4.5s, loop back to the last few when it
    // runs over time so the "finishing touches" roles play last.
    const rotateStage = setInterval(() => {
      setStageIdx((i) => {
        if (i < STAGES.length - 1) return i + 1;
        // Loop between the last 3 roles so we never show "done" stages
        return STAGES.length - 3 + Math.floor(Math.random() * 3);
      });
    }, 4500);

    // Rotate trivia every 7s
    const rotateTrivia = setInterval(() => {
      setTriviaIdx((i) => (i + 1) % TRIVIA.length);
    }, 7000);

    return () => {
      clearInterval(tickElapsed);
      clearInterval(rotateStage);
      clearInterval(rotateTrivia);
    };
  }, [status]);

  if (status === "idle") return null;

  const stage = STAGES[stageIdx]!;
  // Cosmetic progress: approaches 95% asymptotically over ~90s
  const estimatedProgress = Math.min(95, (1 - Math.exp(-elapsed / 30)) * 100);
  const displayProgress = status === "done" ? 100 : estimatedProgress;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-live="polite"
      aria-label="正在生成您的網站"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#0b0516]/95 backdrop-blur-sm p-6"
    >
      <div className="w-full max-w-xl">
        {status === "error" && (
          <div className="rounded-3xl border border-red-500/30 bg-red-950/40 p-8 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-500/20 text-4xl">
              ⚠️
            </div>
            <h2 className="text-xl font-bold text-white">生成失敗</h2>
            <p className="mt-3 text-sm text-red-200">{error || "未知錯誤"}</p>
            <button
              type="button"
              onClick={onRetry}
              className="mt-6 rounded-full bg-white px-6 py-2.5 text-sm font-semibold text-red-900 hover:bg-red-50"
            >
              關閉重試
            </button>
          </div>
        )}

        {status === "done" && (
          <div className="rounded-3xl border border-green-400/30 bg-gradient-to-br from-emerald-900/60 to-teal-900/60 p-10 text-center shadow-2xl">
            <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-green-400/20 text-5xl animate-bounce">
              🎉
            </div>
            <h2 className="text-3xl font-black text-white">網站已生成完成!</h2>
            <p className="mt-3 text-base text-emerald-100">
              您專屬的網站已經準備好了,點下方按鈕立刻預覽
            </p>
            <div className="mt-4 text-xs text-emerald-200/70">
              耗時 {Math.round(elapsed)} 秒 · 由 15 位虛擬團隊協作完成
            </div>
            {previewUrl && (
              <a
                href={previewUrl}
                className="mt-7 inline-block rounded-full bg-gradient-to-r from-emerald-400 to-teal-400 px-10 py-4 text-base font-bold text-emerald-950 shadow-xl shadow-emerald-500/30 transition hover:scale-105"
                aria-label="前往預覽您的網站"
              >
                👀 前往預覽您的網站 →
              </a>
            )}
          </div>
        )}

        {status === "running" && (
          <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-[#1a0f2e]/90 to-[#0b0516]/90 p-8 shadow-2xl backdrop-blur-xl">
            {/* Header */}
            <div className="mb-6 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="flex h-2 w-2">
                  <span className="absolute inline-flex h-2 w-2 animate-ping rounded-full bg-purple-400 opacity-75"></span>
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-purple-500"></span>
                </span>
                <span className="text-xs font-medium uppercase tracking-widest text-purple-300">
                  AI 創作中
                </span>
              </div>
              <span className="font-mono text-xs text-white/50">
                {Math.floor(elapsed)}s
              </span>
            </div>

            {/* Active role card */}
            <div
              key={stageIdx}
              className="rounded-2xl border border-white/10 bg-white/5 p-6 shadow-inner"
              style={{
                animation: "stageFade 0.6s ease-out",
              }}
            >
              <div className="flex items-start gap-4">
                <div
                  className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-3xl shadow-lg"
                  style={{
                    background: `linear-gradient(135deg, ${stage.colorFrom}, ${stage.colorTo})`,
                  }}
                >
                  {stage.emoji}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold uppercase tracking-wider text-white/60">
                    {stage.role}
                  </div>
                  <div className="mt-1 text-lg font-semibold text-white">
                    {stage.text}
                  </div>
                  {/* Thinking dots */}
                  <div className="mt-2 flex gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-white/60" style={{ animation: "dot 1.4s infinite", animationDelay: "0s" }} />
                    <span className="h-1.5 w-1.5 rounded-full bg-white/60" style={{ animation: "dot 1.4s infinite", animationDelay: "0.2s" }} />
                    <span className="h-1.5 w-1.5 rounded-full bg-white/60" style={{ animation: "dot 1.4s infinite", animationDelay: "0.4s" }} />
                  </div>
                </div>
              </div>
            </div>

            {/* Progress bar */}
            <div className="mt-6">
              <div className="mb-2 flex justify-between text-xs text-white/50">
                <span>整體進度</span>
                <span className="font-mono">{Math.round(displayProgress)}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-purple-500 via-pink-500 to-amber-400 transition-all duration-500 ease-out"
                  style={{
                    width: `${displayProgress}%`,
                    backgroundSize: "200% 100%",
                    animation: "shimmer 2s linear infinite",
                  }}
                />
              </div>
            </div>

            {/* Team roster preview */}
            <div className="mt-6 flex flex-wrap gap-2">
              {STAGES.map((s, i) => {
                const done = i < stageIdx;
                const active = i === stageIdx;
                return (
                  <span
                    key={i}
                    title={s.role}
                    className={[
                      "inline-flex h-8 w-8 items-center justify-center rounded-full text-base transition-all",
                      done ? "bg-green-500/20 opacity-60" : "",
                      active ? "scale-110 ring-2 ring-white/40" : "",
                      !done && !active ? "bg-white/5 opacity-30" : "",
                    ].join(" ")}
                    style={
                      active
                        ? {
                            background: `linear-gradient(135deg, ${s.colorFrom}, ${s.colorTo})`,
                          }
                        : undefined
                    }
                  >
                    {done ? "✓" : s.emoji}
                  </span>
                );
              })}
            </div>

            {/* Trivia */}
            <div className="mt-6 rounded-xl border border-white/5 bg-black/30 p-4">
              <p className="text-xs leading-relaxed text-white/70">
                {TRIVIA[triviaIdx]}
              </p>
            </div>

            <p className="mt-4 text-center text-xs text-white/40">
              請耐心等候 · AI 正在為您打造獨一無二的網站 · 約 30-90 秒
            </p>
          </div>
        )}
      </div>

      <style jsx>{`
        @keyframes stageFade {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes dot {
          0%,
          60%,
          100% {
            opacity: 0.2;
            transform: scale(0.8);
          }
          30% {
            opacity: 1;
            transform: scale(1);
          }
        }
        @keyframes shimmer {
          0% {
            background-position: 200% 0;
          }
          100% {
            background-position: -200% 0;
          }
        }
      `}</style>
    </div>
  );
}
