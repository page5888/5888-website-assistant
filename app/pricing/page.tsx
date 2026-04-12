import Link from "next/link";
import { EcosystemFooter } from "@/components/EcosystemFooter";

export const metadata = {
  title: "定價 | 5888 網站助手",
  description:
    "免費試用 2 次,完整版一次付費 NT$490 永久保留、逐段改文字、逐張換圖、自動部署到 GitHub。",
};

const FREE_FEATURES = [
  { text: "2 次 AI 生成", ok: true },
  { text: "24 小時預覽", ok: true },
  { text: "右下角浮水印", ok: false },
  { text: "永久保留", ok: false },
  { text: "下載 HTML 原始檔", ok: false },
  { text: "一鍵部署到 GitHub", ok: false },
  { text: "付款後改文字 / 換圖片", ok: false },
];

const PAID_FEATURES = [
  { text: "♾️ 永久保留,沒有時效", ok: true },
  { text: "✨ 移除浮水印", ok: true },
  { text: "⬇️ 下載 HTML 原始檔", ok: true },
  { text: "🚀 一鍵部署到 GitHub Pages", ok: true },
  { text: "✏️ 逐段修改文字(每個網站最多 30 次)", ok: true },
  { text: "🖼️ 逐張替換圖片(版位固定為生成時上傳的張數)", ok: true },
  { text: "🤖 AI 圖片生成(每張 10 點,用 5888 點數扣)", ok: true },
  { text: "💎 終身客服與更新", ok: true },
];

export default function PricingPage() {
  return (
    <main className="min-h-screen bg-[var(--color-background)] text-[var(--color-foreground)]">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-[var(--color-border)] bg-white/80 backdrop-blur-lg">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="text-xl font-black">
            <span className="text-[var(--color-primary)]">5888</span>
            <span className="ml-1">網站助手</span>
          </Link>
          <nav className="flex items-center gap-6 text-sm">
            <Link href="/" className="hover:text-[var(--color-primary)]">
              首頁
            </Link>
            <Link
              href="/pricing"
              className="font-semibold text-[var(--color-primary)]"
            >
              定價
            </Link>
            <Link href="/guide" className="hover:text-[var(--color-primary)]">
              使用說明
            </Link>
            <Link
              href="/changelog"
              className="hover:text-[var(--color-primary)]"
            >
              更新紀錄
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-4xl px-6 pb-12 pt-20 text-center">
        <p className="text-sm font-semibold uppercase tracking-widest text-[var(--color-primary)]">
          PRICING
        </p>
        <h1 className="mt-4 text-balance text-4xl font-black md:text-5xl">
          一次付費,終身擁有
        </h1>
        <p className="mt-6 text-lg text-[var(--color-muted-foreground)]">
          跟 Wix 年費 NT$6,000、外包設計師 NT$10,000+ 相比
          <br className="hidden md:inline" />
          我們只收你 <strong className="text-[var(--color-primary)]">NT$490</strong>,而且永遠是你的。
        </p>
      </section>

      {/* Plans */}
      <section className="mx-auto grid max-w-5xl gap-6 px-6 pb-20 md:grid-cols-2">
        {/* Free */}
        <article className="relative rounded-3xl border border-[var(--color-border)] bg-white p-8 shadow-sm">
          <h2 className="text-2xl font-bold">免費試用</h2>
          <p className="mt-2 text-sm text-[var(--color-muted-foreground)]">
            體驗完整生成流程 · 決定要不要升級
          </p>
          <div className="mt-6 flex items-baseline gap-1">
            <span className="text-5xl font-black">NT$0</span>
            <span className="text-sm text-[var(--color-muted-foreground)]">
              / 共 2 次
            </span>
          </div>
          <ul className="mt-8 space-y-3 text-sm">
            {FREE_FEATURES.map((f) => (
              <li key={f.text} className="flex items-start gap-2">
                <span className={f.ok ? "text-green-600" : "text-gray-300"}>
                  {f.ok ? "✓" : "✗"}
                </span>
                <span className={f.ok ? "" : "text-[var(--color-muted-foreground)] line-through"}>
                  {f.text}
                </span>
              </li>
            ))}
          </ul>
          <Link
            href="/"
            className="mt-8 block rounded-full border-2 border-[var(--color-primary)] px-6 py-3 text-center font-semibold text-[var(--color-primary)] hover:bg-[var(--color-primary)] hover:text-[var(--color-primary-foreground)]"
          >
            免費試用 2 次
          </Link>
        </article>

        {/* Paid */}
        <article className="relative overflow-hidden rounded-3xl border-2 border-[var(--color-primary)] bg-gradient-to-br from-white to-[#f5f0ff] p-8 shadow-xl shadow-purple-500/10">
          <span className="absolute right-4 top-4 rounded-full bg-gradient-to-r from-[var(--color-primary)] to-[var(--color-accent)] px-3 py-1 text-xs font-bold text-white">
            🔥 推薦
          </span>
          <h2 className="text-2xl font-bold">完整版</h2>
          <p className="mt-2 text-sm text-[var(--color-muted-foreground)]">
            一次付費 · 終身擁有 · 無訂閱
          </p>
          <div className="mt-6 flex items-baseline gap-1">
            <span className="text-5xl font-black text-[var(--color-primary)]">
              NT$490
            </span>
            <span className="text-sm text-[var(--color-muted-foreground)]">
              / 一次
            </span>
          </div>
          <ul className="mt-8 space-y-3 text-sm">
            {PAID_FEATURES.map((f) => (
              <li key={f.text} className="flex items-start gap-2">
                <span className="text-green-600">✓</span>
                <span>{f.text}</span>
              </li>
            ))}
          </ul>
          <Link
            href="/"
            className="mt-8 block rounded-full bg-gradient-to-r from-[var(--color-primary)] to-[var(--color-accent)] px-6 py-3 text-center font-semibold text-white shadow-lg shadow-purple-500/30 hover:opacity-90"
          >
            立即開始生成
          </Link>
          <p className="mt-3 text-center text-xs text-[var(--color-muted-foreground)]">
            付款完成後,在預覽頁按「解鎖完整版」即可升級
          </p>
        </article>
      </section>

      {/* FAQ */}
      <section className="mx-auto max-w-3xl px-6 pb-24">
        <h2 className="mb-8 text-center text-2xl font-black">常見問題</h2>
        <div className="space-y-4">
          <details className="group rounded-2xl border border-[var(--color-border)] bg-white p-5">
            <summary className="cursor-pointer font-semibold">
              NT$490 是真的一次付費嗎?有沒有隱藏月費?
            </summary>
            <p className="mt-3 text-sm text-[var(--color-muted-foreground)]">
              真的一次付費。綠界收款,一筆 NT$490,之後沒有任何月費、年費、續約費。你的網站 HTML 部署到你自己的 GitHub Pages 永久免費。
            </p>
          </details>
          <details className="group rounded-2xl border border-[var(--color-border)] bg-white p-5">
            <summary className="cursor-pointer font-semibold">
              付款後可以改哪些東西?改幾次?
            </summary>
            <p className="mt-3 text-sm text-[var(--color-muted-foreground)]">
              付款解鎖後,你可以:<br />
              1) <strong>逐段修改文字</strong> — 標題、副標、段落、商品說明都能直接改,每個網站最多 30 次(不限每日)<br />
              2) <strong>逐張替換圖片</strong> — 上傳新照片,系統會自動裁切到對的比例<br />
              <br />
              ⚠️ <strong>圖片版位固定為生成時上傳的張數。</strong>例如生成時只上傳 3 張,事後只能替換這 3 張,無法增加新的版位。建議生成前盡量多上傳幾張。
            </p>
          </details>
          <details className="group rounded-2xl border border-[var(--color-border)] bg-white p-5">
            <summary className="cursor-pointer font-semibold">
              30 次文字修改不夠用怎麼辦?
            </summary>
            <p className="mt-3 text-sm text-[var(--color-muted-foreground)]">
              正常店家改個 3~5 次就定稿了,30 次綽綽有餘。如果真的用完,請寫信告訴我們你的使用情境,我們會協助處理。
            </p>
          </details>
          <details className="group rounded-2xl border border-[var(--color-border)] bg-white p-5">
            <summary className="cursor-pointer font-semibold">
              付款方式有哪些?
            </summary>
            <p className="mt-3 text-sm text-[var(--color-muted-foreground)]">
              透過綠界金流,支援信用卡(VISA / Mastercard / JCB)、超商代碼(7-11 / 全家 / 萊爾富 / OK)、ATM 虛擬帳號、Apple Pay、Google Pay、Line Pay。
            </p>
          </details>
          <details className="group rounded-2xl border border-[var(--color-border)] bg-white p-5">
            <summary className="cursor-pointer font-semibold">
              想再做第二個網站要再付一次嗎?
            </summary>
            <p className="mt-3 text-sm text-[var(--color-muted-foreground)]">
              是的,一個 NT$490 對應一個網站。如果你開了第二間店,再付一次 NT$490 就能再做一個,兩個都是永久你的。
            </p>
          </details>
          <details className="group rounded-2xl border border-[var(--color-border)] bg-white p-5">
            <summary className="cursor-pointer font-semibold">
              24 小時後網站真的會消失嗎?
            </summary>
            <p className="mt-3 text-sm text-[var(--color-muted-foreground)]">
              免費試用的預覽會在生成後 24 小時自動過期。付款後立即解除時效,永久保留。
            </p>
          </details>
        </div>
      </section>

      <EcosystemFooter variant="light" />
    </main>
  );
}
