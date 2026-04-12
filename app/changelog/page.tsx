import Link from "next/link";
import { EcosystemFooter } from "@/components/EcosystemFooter";

export const metadata = {
  title: "更新紀錄 | 5888 網站助手",
  description:
    "5888 網站助手的每次更新內容與改進紀錄。新功能、修補、效能改善都會列在這裡。",
};

/**
 * Changelog entries.
 *
 * How to add a new entry:
 *   1. Prepend a new object at the TOP of this array (newest first).
 *   2. `date` is ISO format (YYYY-MM-DD).
 *   3. `tag` is one of: "新功能" | "修補" | "改進" | "安全性" — pick whatever fits.
 *      Multiple changes of different kinds → split into multiple items.
 *   4. `items` is a short bullet list. Keep each line under ~80 chars.
 *   5. No build step needed — just deploy.
 */
type Tag = "新功能" | "修補" | "改進" | "安全性";

interface ChangelogEntry {
  date: string; // YYYY-MM-DD
  tag: Tag;
  title: string;
  items: string[];
}

const ENTRIES: ChangelogEntry[] = [
  {
    date: "2026-04-12",
    tag: "新功能",
    title: "AI 圖片生成 — 沒有照片也能做出漂亮網站",
    items: [
      "付款後在「更換圖片」面板,每個版位新增「🤖 AI 生成」按鈕",
      "輸入文字描述(例:手沖咖啡特寫),AI 自動生成並替換到網站上",
      "每張圖片消耗 5888 點數 10 點,不用的版位不收費",
      "生成的圖片會自動裁切到正確比例,和手動上傳的照片一樣精準",
    ],
  },
  {
    date: "2026-04-12",
    tag: "新功能",
    title: "付款後可逐段修改網站文字",
    items: [
      "付款解鎖後,預覽頁出現「✏️ 修改文字」按鈕,點進專屬編輯頁",
      "AI 標記每個文字區塊(標題、副標、商品說明、FAQ...),逐段修改不怕改壞",
      "每個網站最多 30 次修改,不限每日,純文字不扣點數",
      "定價頁與表單「生成規則」說明已同步更新,如實告知圖片版位固定規則",
    ],
  },
  {
    date: "2026-04-12",
    tag: "新功能",
    title: "新增「我的網站」頁 — 付費網站永遠找得到",
    items: [
      "登入後右上角新增「我的網站」入口,一頁看完所有生成過的網站",
      "分三區顯示:🚀 已上架 GitHub Pages、✨ 已付款未部署、⏰ 免費預覽",
      "已部署網站會直接顯示公開網址 + GitHub repo 連結,可以一鍵複製分享",
      "修掉 /api/deploy 會把付款網站 meta 改成 1 小時 TTL 的隱性 bug",
      "首頁最近網站 banner 增加「查看全部 →」連結,不再被 5 筆上限遮蔽",
    ],
  },
  {
    date: "2026-04-12",
    tag: "新功能",
    title: "5888 生態系導覽 + 品牌識別全面升級",
    items: [
      "所有頁面 footer 新增「5888 生態系」區塊,可一鍵回到錢包主頁、查看點數明細、買月費",
      "共用 EcosystemFooter component — 未來調整一次改全部,不會各頁面各自飄移",
      "為錢包主頁卡片製作了品牌 logo (32/64/512 PNG + SVG),紫粉漸層 + 圓角方框",
      "首頁 meta description / Open Graph 圖片同步更新,SNS 分享時會顯示 logo",
      "正式上線到 https://5888-website-assistant.vercel.app (公開 beta)",
    ],
  },
  {
    date: "2026-04-11",
    tag: "修補",
    title: "付款回跳在 tunnel/proxy 環境下會卡住",
    items: [
      "修掉 /api/ecpay/return 在反向代理底下回傳絕對網址 localhost 的問題",
      "改用 path-only Location header,瀏覽器會對自身 host 做相對解析",
      "新增 29 項端到端自動測試覆蓋整條付款 pipeline(簽章驗證 / 升級 paid / 冪等性 / 防竄改)",
    ],
  },
  {
    date: "2026-04-10",
    tag: "新功能",
    title: "付款後可逐張更換網站圖片",
    items: [
      "付款解鎖後,預覽頁出現「🖼️ 更換圖片」按鈕",
      "支援上傳新圖並自動裁切,每張圖都對應原始設計的版位(slot)",
      "修改直接寫回 Redis 的 site HTML,重新整理就生效",
      "換圖時會自動移除浮水印並驗證 URL 白名單,防止 XSS",
    ],
  },
  {
    date: "2026-04-10",
    tag: "新功能",
    title: "首頁顯示最近生成的網站",
    items: [
      "登入後首頁上方會列出最近 5 個還在有效期的預覽",
      "每個預覽會顯示「⏰ 剩餘時數」或「✨ 已付款」狀態",
      "免費預覽 24 小時後自動從清單消失",
    ],
  },
  {
    date: "2026-04-10",
    tag: "新功能",
    title: "預覽頁加上登入/登出狀態",
    items: [
      "預覽頁右上角顯示目前登入帳號,可以直接登出切換",
      "首頁與預覽頁共用同一個 AccountChip 元件,狀態永遠一致",
    ],
  },
  {
    date: "2026-04-09",
    tag: "改進",
    title: "點數折抵改為「全額或完全不抵」",
    items: [
      "5888 中央錢包不支援部分折抵,因此移除混合付款模式",
      "點數 ≥ 490 → 一鍵全額兌換,不經綠界",
      "點數不足 → 走正常綠界刷卡流程,不扣點數",
      "簡化了 checkout/notify 的錯誤分支,降低未來維護成本",
    ],
  },
  {
    date: "2026-04-08",
    tag: "新功能",
    title: "綠界金流 + 浮水印 + 24 小時免費試用",
    items: [
      "正式串接綠界(ECPay)信用卡付款,NT$490 一次付費",
      "免費預覽右下角顯示「5888 網站助手・免費版」浮水印",
      "免費網站 24 小時後自動過期,付款後永久保留",
      "定價頁詳列免費版與完整版差異",
    ],
  },
  {
    date: "2026-04-07",
    tag: "新功能",
    title: "豐富的生成進度動畫 + 管理員重置",
    items: [
      "送出表單後顯示多階段動畫(圖片處理 → 草稿 → 美化 → 收尾)",
      "管理員帳號可於左下角一鍵重置自己的每日額度,方便除錯",
    ],
  },
  {
    date: "2026-04-06",
    tag: "安全性",
    title: "升級 Next.js 修補 CVE-2025-29927",
    items: [
      "升級至 Next.js 15.5.15,修補 middleware 權限繞過風險",
    ],
  },
];

const TAG_STYLE: Record<Tag, string> = {
  新功能: "bg-emerald-100 text-emerald-800 border-emerald-200",
  修補: "bg-amber-100 text-amber-800 border-amber-200",
  改進: "bg-sky-100 text-sky-800 border-sky-200",
  安全性: "bg-rose-100 text-rose-800 border-rose-200",
};

function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${y} 年 ${Number(m)} 月 ${Number(d)} 日`;
}

export default function ChangelogPage() {
  return (
    <main className="min-h-screen bg-[var(--color-background)] text-[var(--color-foreground)]">
      {/* ============ HEADER ============ */}
      <header className="sticky top-0 z-20 border-b border-[var(--color-border)] bg-white/80 backdrop-blur-lg">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <Link href="/" className="text-xl font-black">
            <span className="text-[var(--color-primary)]">5888</span>
            <span className="ml-1">網站助手</span>
          </Link>
          <nav className="flex items-center gap-6 text-sm">
            <Link href="/" className="hover:text-[var(--color-primary)]">
              首頁
            </Link>
            <Link href="/pricing" className="hover:text-[var(--color-primary)]">
              定價
            </Link>
            <Link
              href="/changelog"
              className="font-semibold text-[var(--color-primary)]"
            >
              更新紀錄
            </Link>
          </nav>
        </div>
      </header>

      {/* ============ HERO ============ */}
      <section className="border-b border-[var(--color-border)] bg-gradient-to-br from-[var(--color-primary)]/5 via-white to-[var(--color-accent)]/5">
        <div className="mx-auto max-w-4xl px-6 py-16 text-center">
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.25em] text-[var(--color-primary)]">
            Changelog
          </p>
          <h1 className="mb-4 text-4xl font-black tracking-tight md:text-5xl">
            更新紀錄
          </h1>
          <p className="mx-auto max-w-2xl text-base text-[var(--color-foreground)]/70">
            我們持續優化 5888 網站助手。所有新功能、修補和改進都會列在這裡,
            讓你清楚知道每一次變更內容與日期。
          </p>
        </div>
      </section>

      {/* ============ TIMELINE ============ */}
      <section className="mx-auto max-w-4xl px-6 py-16">
        <ol className="relative space-y-10 border-l-2 border-[var(--color-border)] pl-8">
          {ENTRIES.map((entry, i) => (
            <li key={`${entry.date}-${i}`} className="relative">
              {/* Timeline dot */}
              <span
                aria-hidden
                className="absolute -left-[41px] top-1 h-5 w-5 rounded-full border-4 border-white bg-gradient-to-br from-[var(--color-primary)] to-[var(--color-accent)] shadow"
              />
              <article className="rounded-2xl border border-[var(--color-border)] bg-white p-6 shadow-sm transition hover:shadow-md">
                <div className="mb-3 flex flex-wrap items-center gap-3">
                  <time
                    dateTime={entry.date}
                    className="text-sm font-semibold text-[var(--color-foreground)]/60"
                  >
                    {formatDate(entry.date)}
                  </time>
                  <span
                    className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold tracking-wide ${TAG_STYLE[entry.tag]}`}
                  >
                    {entry.tag}
                  </span>
                </div>
                <h2 className="mb-3 text-xl font-bold tracking-tight">
                  {entry.title}
                </h2>
                <ul className="space-y-1.5 text-sm leading-relaxed text-[var(--color-foreground)]/80">
                  {entry.items.map((item, j) => (
                    <li key={j} className="flex gap-2">
                      <span
                        aria-hidden
                        className="mt-1.5 inline-block h-1 w-1 flex-shrink-0 rounded-full bg-[var(--color-primary)]/60"
                      />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </article>
            </li>
          ))}
        </ol>

        {/* Footer note */}
        <div className="mt-16 rounded-2xl border border-dashed border-[var(--color-border)] bg-white/50 p-6 text-center text-sm text-[var(--color-foreground)]/60">
          找不到你想要的功能?歡迎{" "}
          <a
            href="mailto:srbow.tw@gmail.com"
            className="font-semibold text-[var(--color-primary)] hover:underline"
          >
            寫信告訴我們
          </a>
          ,我們會評估是否納入下一次更新。
        </div>
      </section>

      {/* ============ FOOTER ============ */}
      <EcosystemFooter variant="light" />
    </main>
  );
}
