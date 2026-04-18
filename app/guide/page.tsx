import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { EcosystemFooter } from "@/components/EcosystemFooter";

export const metadata = {
  title: "使用說明 | 5888 網站助手",
  description:
    "從建立網站到付款、修改文字、換圖片、AI 圖片生成、一鍵部署,完整操作指南。",
  openGraph: {
    title: "使用說明 | 5888 網站助手",
    description: "從零開始到上線,完整操作指南。",
    images: ["/logo-512.png"],
  },
};

/**
 * Guide sections. Each section has a numbered step with clear
 * instructions. When we add templates later, add a new section here.
 */

export default function GuidePage() {
  return (
    <main className="min-h-screen bg-[var(--color-background)] text-[var(--color-foreground)]">
      {/* ============ HEADER ============ */}
      <SiteHeader activePath="/guide" maxWidth="max-w-4xl" />

      {/* ============ HERO ============ */}
      <section className="border-b border-[var(--color-border)] bg-gradient-to-br from-[var(--color-primary)]/5 via-white to-[var(--color-accent)]/5">
        <div className="mx-auto max-w-4xl px-6 py-16 text-center">
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.25em] text-[var(--color-primary)]">
            Guide
          </p>
          <h1 className="mb-4 text-4xl font-black tracking-tight md:text-5xl">
            使用說明
          </h1>
          <p className="mx-auto max-w-2xl text-base text-[var(--color-foreground)]/70">
            從零開始到上線,只需幾分鐘。以下是完整的操作步驟。
          </p>
        </div>
      </section>

      {/* ============ STEPS ============ */}
      <section className="mx-auto max-w-4xl px-6 py-16">
        <div className="space-y-12">
          {/* Step 1 */}
          <Step
            num={1}
            title="登入帳號"
            color="emerald"
          >
            <p>
              點選首頁右上角的「Google 登入」按鈕,使用 Google 帳號授權登入。
              登入後即可開始建立網站。
            </p>
            <Tip>
              每個 Google 帳號有 <strong>2 次免費生成</strong> 機會,請珍惜使用。
            </Tip>
          </Step>

          {/* Step 2 */}
          <Step
            num={2}
            title="填寫店家資訊 + 上傳照片"
            color="blue"
          >
            <p>在首頁的表單中填寫:</p>
            <ul className="mt-3 space-y-1.5">
              <Li>店家名稱(必填)</Li>
              <Li>產業類別提示(例:咖啡廳、美髮沙龍)</Li>
              <Li>Google Maps 連結 / 地址 / 電話(選填,填越多文案越精準)</Li>
              <Li>上傳照片 — 前 3 張必填,最多可上傳 10 張</Li>
            </ul>
            <Warning>
              圖片版位一次定型 — 你現在上傳幾張,生成後可替換的也是幾張,
              <strong>事後無法增加新版位</strong>。建議盡量多上傳。
            </Warning>
          </Step>

          {/* Step 3 */}
          <Step
            num={3}
            title="AI 生成網站"
            color="purple"
          >
            <p>
              按下「生成網站」後,AI 會根據你的資料打造一個雜誌級的單頁宣傳網站。
              過程約 30-60 秒,會顯示即時進度動畫。
            </p>
            <p className="mt-2">
              生成完成後自動跳轉到預覽頁,你可以在 iframe 中看到完整的網站效果。
            </p>
            <Tip>
              免費預覽有效期 <strong>24 小時</strong>,之後自動消失。
              覺得滿意再付款,不滿意不用花錢。
            </Tip>
          </Step>

          {/* Step 4 */}
          <Step
            num={4}
            title="付款解鎖"
            color="amber"
          >
            <p>
              在預覽頁點選「💎 解鎖完整版 NT$490」進行付款。支援:
            </p>
            <ul className="mt-3 space-y-1.5">
              <Li>信用卡(VISA / Mastercard / JCB)</Li>
              <Li>超商代碼(7-11 / 全家 / 萊爾富 / OK)</Li>
              <Li>ATM 虛擬帳號</Li>
              <Li>Apple Pay / Google Pay / Line Pay</Li>
              <Li>5888 點數全額折抵(餘額 ≥ 490 點時可用)</Li>
            </ul>
            <p className="mt-3">
              付款成功後,浮水印自動移除,網站永久保留。
            </p>
          </Step>

          {/* Step 5 */}
          <Step
            num={5}
            title="修改文字"
            color="sky"
          >
            <p>
              付款後,預覽頁上方出現「✏️ 修改文字」按鈕。點進去會看到一個表單頁面,
              列出網站上所有可編輯的文字區塊:
            </p>
            <ul className="mt-3 space-y-1.5">
              <Li>封面標題 / 副標</Li>
              <Li>品牌故事段落</Li>
              <Li>商品名稱 / 描述</Li>
              <Li>FAQ 問答</Li>
              <Li>聯絡資訊(地址 / 電話 / 營業時間)</Li>
            </ul>
            <p className="mt-3">
              直接在欄位裡修改,按「💾 儲存變更」即可。
            </p>
            <Tip>
              每個網站最多 <strong>30 次</strong> 文字修改,不限每日。
              純文字修改不扣點數。
            </Tip>
            <Warning>
              2026/4/12 之前生成的網站沒有文字標記,暫不支援此功能。
              如需使用,請重新生成一個新網站。
            </Warning>
          </Step>

          {/* Step 6 */}
          <Step
            num={6}
            title="更換圖片"
            color="rose"
          >
            <p>
              付款後,預覽頁出現「🖼️ 更換圖片」按鈕。點開後看到所有圖片版位,
              每個版位有兩種替換方式:
            </p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <FeatureCard
                icon="📁"
                title="上傳自己的照片"
                desc="選擇本機照片,系統自動裁切到正確比例。免費,不限次數。"
              />
              <FeatureCard
                icon="🤖"
                title="AI 圖片生成"
                desc="輸入文字描述(例:手沖咖啡特寫),AI 自動生成並替換。每張消耗 10 點。"
              />
            </div>
            <Tip>
              AI 生成的圖片品質取決於描述的精確度。建議寫明主題、色調、構圖。
              例:「白色大理石桌上的拿鐵拉花,俯拍,暖色調」比「咖啡」好十倍。
            </Tip>
          </Step>

          {/* Step 7 */}
          <Step
            num={7}
            title="下載 / 一鍵部署"
            color="green"
          >
            <p>付款後有兩個選項:</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <FeatureCard
                icon="⬇️"
                title="下載 HTML"
                desc="下載一個完整的 index.html 檔案,可以放到任何伺服器上。"
              />
              <FeatureCard
                icon="🚀"
                title="一鍵部署到 GitHub Pages"
                desc="自動建立 GitHub repo + 啟用 Pages,幾秒鐘後就有公開網址。"
              />
            </div>
            <Tip>
              部署完成後,你的網站會出現在「我的網站」頁面,可以隨時找到。
              GitHub Pages 首次上線約需 30-60 秒,如果看到 404 請稍候重整。
            </Tip>
          </Step>

          {/* Step 8 — template selection */}
          <Step
            num={8}
            title="選擇設計模板"
            color="violet"
            badge="New"
          >
            <p>
              在「設計模板」下拉選單中,可以選擇網站的視覺風格:
            </p>
            <ul className="mt-3 space-y-1.5">
              <Li><strong>自動選擇</strong> — 系統依產業類別自動挑最適合的模板</Li>
              <Li><strong>雜誌風 Editorial</strong> — 大量留白、左右分割排版、優雅 serif 字體,適合咖啡廳、花藝、選品店</Li>
              <Li><strong>衝擊風 Bold</strong> — 全版大圖、暗底白字、強烈 CTA,適合餐廳、健身房、汽修</Li>
            </ul>
            <Tip>模板只決定版面設計,AI 會根據你的店家資料自動填入文案、配色和 SEO 資訊。</Tip>
            <p className="mt-3 text-[var(--color-muted-foreground)]">
              更多模板持續開發中,請關注更新紀錄。
            </p>
          </Step>
        </div>
      </section>

      {/* ============ FAQ ============ */}
      <section className="border-t border-[var(--color-border)] bg-white/50">
        <div className="mx-auto max-w-4xl px-6 py-16">
          <h2 className="mb-8 text-center text-2xl font-black">常見問題</h2>
          <div className="space-y-4">
            <Faq
              q="免費版和付費版的差異?"
              a="免費版可以預覽 24 小時,有浮水印,不能下載或部署。付款 NT$490 後永久保留、去浮水印、可修改文字/換圖/下載/部署。"
            />
            <Faq
              q="AI 生成的文字有錯怎麼辦?"
              a="付款後點「✏️ 修改文字」逐段修正,每個網站最多 30 次。AI 文案只是起點,最終定稿權在你手上。"
            />
            <Faq
              q="圖片破掉 / 載入不出來?"
              a="回首頁重新上傳你自己的照片再生成一次(免費版有 2 次機會)。或者付款後用「更換圖片」功能手動替換。"
            />
            <Faq
              q="5888 點數是什麼?怎麼取得?"
              a="5888 點數是跨站通用的虛擬貨幣(1 點 = NT$1)。可用於折抵網站費用或 AI 圖片生成。前往 5888 錢包主頁查看點數明細和取得方式。"
            />
            <Faq
              q="部署後的網站可以綁自己的網域嗎?"
              a="目前預設部署到 page5888.github.io。如需自訂網域,請聯繫客服協助設定 CNAME。"
            />
          </div>
        </div>
      </section>

      {/* ============ CTA ============ */}
      <section className="mx-auto max-w-4xl px-6 py-16 text-center">
        <h2 className="text-2xl font-black">準備好了嗎?</h2>
        <p className="mt-3 text-[var(--color-muted-foreground)]">
          免費試用,不滿意不用付錢。
        </p>
        <Link
          href="/"
          className="mt-6 inline-block rounded-full bg-gradient-to-r from-[var(--color-primary)] to-[var(--color-accent)] px-8 py-3 font-semibold text-white shadow-lg shadow-purple-500/30 hover:opacity-90"
        >
          開始生成我的網站
        </Link>
      </section>

      <EcosystemFooter variant="light" />
    </main>
  );
}

/* ─── Sub-components ─── */

const COLOR_MAP: Record<string, string> = {
  emerald: "bg-emerald-500",
  blue: "bg-blue-500",
  purple: "bg-purple-500",
  amber: "bg-amber-500",
  sky: "bg-sky-500",
  rose: "bg-rose-500",
  green: "bg-green-500",
  violet: "bg-violet-500",
};

function Step({
  num,
  title,
  color,
  badge,
  children,
}: {
  num: number;
  title: string;
  color: string;
  badge?: string;
  children: React.ReactNode;
}) {
  return (
    <article className="relative rounded-3xl border border-[var(--color-border)] bg-white p-6 shadow-sm transition hover:shadow-md sm:p-8">
      <div className="mb-4 flex items-center gap-3">
        <span
          className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-black text-white ${COLOR_MAP[color] ?? "bg-gray-500"}`}
        >
          {num}
        </span>
        <h2 className="text-xl font-bold tracking-tight">{title}</h2>
        {badge && (
          <span className="rounded-full border border-violet-200 bg-violet-100 px-2.5 py-0.5 text-[11px] font-bold text-violet-700">
            {badge}
          </span>
        )}
      </div>
      <div className="space-y-2 text-sm leading-relaxed text-[var(--color-foreground)]/80">
        {children}
      </div>
    </article>
  );
}

function Li({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2">
      <span
        aria-hidden
        className="mt-1.5 inline-block h-1.5 w-1.5 flex-shrink-0 rounded-full bg-[var(--color-primary)]"
      />
      <span>{children}</span>
    </li>
  );
}

function Tip({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs text-emerald-900">
      <strong>💡 提示:</strong> {children}
    </div>
  );
}

function Warning({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-900">
      <strong>⚠️ 注意:</strong> {children}
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  desc,
}: {
  icon: string;
  title: string;
  desc: string;
}) {
  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-4">
      <p className="text-lg">{icon}</p>
      <p className="mt-1 text-sm font-bold">{title}</p>
      <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">{desc}</p>
    </div>
  );
}

function Faq({ q, a }: { q: string; a: string }) {
  return (
    <details className="group rounded-2xl border border-[var(--color-border)] bg-white p-5">
      <summary className="cursor-pointer font-semibold">{q}</summary>
      <p className="mt-3 text-sm text-[var(--color-muted-foreground)]">{a}</p>
    </details>
  );
}
