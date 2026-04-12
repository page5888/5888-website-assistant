import Link from "next/link";
import { auth, signIn, getUserKey } from "@/lib/auth";
import { GeneratorForm } from "@/components/GeneratorForm";
import { AccountChip } from "@/components/AccountChip";
import { EcosystemFooter } from "@/components/EcosystemFooter";
import { getActiveUserSites, HOMEPAGE_BANNER_LIMIT } from "@/lib/userSites";

export default async function HomePage() {
  const session = await auth();

  // If the user is logged in, surface any sites they generated recently
  // so they can jump straight back to the preview without remembering
  // the random siteId URL. Handles both in-progress free previews
  // (countdown) and already-paid sites.
  const userKey = getUserKey(session);
  const allUserSites = userKey ? await getActiveUserSites(userKey) : [];
  // Banner shows only the most recent few; the rest are on /my-sites.
  const recentSites = allUserSites.slice(0, HOMEPAGE_BANNER_LIMIT);
  const hasMore = allUserSites.length > recentSites.length;

  return (
    <main className="flex min-h-screen flex-col">
      {/* ============ HEADER ============ */}
      <header className="sticky top-0 z-50 border-b border-[var(--color-border)]/60 bg-[var(--color-background)]/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Link
            href="/"
            className="flex items-center gap-1 text-2xl font-black tracking-tight"
            aria-label="回到 5888 網站助手首頁"
          >
            <span className="text-gradient">5888</span>
            <span>網站助手</span>
          </Link>
          <nav aria-label="主選單" className="flex items-center gap-5 text-sm">
            {session?.user && (
              <Link
                href="/my-sites"
                className="hover:text-[var(--color-primary)]"
              >
                我的網站
              </Link>
            )}
            <Link
              href="/pricing"
              className="hidden sm:inline hover:text-[var(--color-primary)]"
            >
              定價
            </Link>
            <Link
              href="/guide"
              className="hidden sm:inline hover:text-[var(--color-primary)]"
            >
              使用說明
            </Link>
            <Link
              href="/changelog"
              className="hidden sm:inline hover:text-[var(--color-primary)]"
            >
              更新紀錄
            </Link>
            <AccountChip />
          </nav>
        </div>
      </header>

      {/* ============ RECENT SITES BANNER ============ */}
      {recentSites.length > 0 && (
        <section
          aria-label="你最近生成的網站"
          className="border-b border-[var(--color-border)]/60 bg-gradient-to-r from-[var(--color-primary)]/10 via-white to-[var(--color-accent)]/10"
        >
          <div className="mx-auto max-w-7xl px-6 py-4">
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--color-primary)]">
                📂 你最近生成的網站
              </p>
              <Link
                href="/my-sites"
                className="text-xs font-semibold text-[var(--color-primary)] hover:underline"
                aria-label="查看所有你的網站"
              >
                {hasMore ? `查看全部 (${allUserSites.length}) →` : "查看全部 →"}
              </Link>
            </div>
            <ul className="flex flex-wrap gap-2">
              {recentSites.map((s) => {
                const hoursLeft =
                  !s.paid && s.expiresAt
                    ? Math.max(
                        0,
                        Math.ceil((s.expiresAt - Date.now()) / (60 * 60 * 1000)),
                      )
                    : null;
                return (
                  <li key={s.siteId}>
                    <Link
                      href={`/preview/${s.siteId}`}
                      className="group inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-white px-4 py-2 text-sm shadow-sm transition hover:border-[var(--color-primary)] hover:shadow-md"
                      aria-label={`回到預覽 ${s.storeName}`}
                    >
                      <span className="font-semibold text-[var(--color-foreground)]">
                        {s.storeName}
                      </span>
                      {s.paid ? (
                        <span className="rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-bold text-green-800">
                          ✨ 已付款
                        </span>
                      ) : hoursLeft !== null ? (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800">
                          ⏰ {hoursLeft}h 後消失
                        </span>
                      ) : null}
                      <span className="text-[var(--color-primary)] transition group-hover:translate-x-0.5">
                        →
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>
      )}

      {/* ============ HERO ============ */}
      <section
        aria-labelledby="hero-title"
        className="relative isolate overflow-hidden"
      >
        {/* Aurora background */}
        <div
          aria-hidden
          className="absolute inset-0 -z-10"
          style={{ backgroundImage: "var(--gradient-aurora)" }}
        />
        <div aria-hidden className="absolute inset-0 -z-10 dots opacity-40" />

        <div className="mx-auto grid max-w-7xl gap-12 px-6 pb-24 pt-20 md:grid-cols-12 md:pt-28">
          <div className="md:col-span-7 flex flex-col gap-7">
            <span className="flex w-fit items-center gap-2 rounded-full border border-[var(--color-primary)]/30 bg-white/70 px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-[var(--color-primary)] backdrop-blur">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--color-primary)]" />
              Powered by Claude 4.6
            </span>
            <h1
              id="hero-title"
              className="text-5xl font-black leading-[1.05] tracking-tight md:text-7xl"
            >
              用你的照片
              <br />
              生成<span className="text-gradient">店家級</span>官網
              <br />
              <span className="text-[var(--color-foreground)]/60">不用寫 code</span>
            </h1>
            <p className="max-w-xl text-lg leading-relaxed text-[var(--color-foreground)]/75">
              上傳 3-10 張店家照片 + 填入店名,AI 會依照嚴謹的五大設計思維,
              為你產出可立刻上線的
              <strong className="text-[var(--color-foreground)]"> index.html</strong>。
              內建 SEO / AEO / GEO 所有要素,讓你的店家在 Google、ChatGPT、Perplexity 都找得到。
            </p>
            <div className="flex flex-wrap gap-4">
              {session?.user ? (
                <a
                  href="#form"
                  className="group inline-flex items-center gap-2 rounded-full bg-[var(--color-primary)] px-8 py-4 text-base font-bold text-[var(--color-primary-foreground)] shadow-xl shadow-[var(--color-primary)]/30 transition hover:scale-105 hover:shadow-2xl"
                  aria-label="捲動至生成表單"
                >
                  🚀 開始生成
                  <span className="transition group-hover:translate-x-1">→</span>
                </a>
              ) : (
                <form
                  action={async () => {
                    "use server";
                    await signIn("google", { redirectTo: "/" });
                  }}
                >
                  <button
                    type="submit"
                    className="group inline-flex items-center gap-2 rounded-full bg-[var(--color-primary)] px-8 py-4 text-base font-bold text-[var(--color-primary-foreground)] shadow-xl shadow-[var(--color-primary)]/30 transition hover:scale-105 hover:shadow-2xl"
                    aria-label="Google 登入以開始生成"
                  >
                    🚀 Google 登入並開始
                    <span className="transition group-hover:translate-x-1">→</span>
                  </button>
                </form>
              )}
              <a
                href="#why"
                className="inline-flex items-center gap-2 rounded-full border-2 border-[var(--color-foreground)]/15 bg-white/60 px-8 py-4 text-base font-semibold backdrop-blur transition hover:bg-white"
                aria-label="了解為什麼需要網站"
              >
                為什麼需要網站?
              </a>
            </div>
            <p className="text-xs text-[var(--color-muted-foreground)]">
              ✦ 終身 2 次免費 ✦ 24 小時預覽 ✦ NT$490 解鎖永久保留 + 下載 + GitHub 部署
            </p>
          </div>

          {/* Decorative visual column */}
          <div
            aria-hidden
            className="relative hidden md:col-span-5 md:block"
          >
            <div className="relative aspect-square">
              <div
                className="absolute inset-[10%] rounded-[3rem] blur-3xl opacity-60"
                style={{ backgroundImage: "var(--gradient-hero)" }}
              />
              <div className="absolute inset-0 rounded-[2.5rem] border border-white/50 bg-white/40 backdrop-blur-2xl shadow-2xl">
                <div className="flex h-full flex-col p-8">
                  <div className="flex gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
                    <span className="h-2.5 w-2.5 rounded-full bg-yellow-400" />
                    <span className="h-2.5 w-2.5 rounded-full bg-green-400" />
                  </div>
                  <div className="mt-6 space-y-3">
                    <div className="h-3 w-3/4 rounded-full bg-[var(--color-foreground)]/10" />
                    <div className="h-3 w-1/2 rounded-full bg-[var(--color-foreground)]/10" />
                  </div>
                  <div className="mt-6 flex flex-1 gap-3">
                    <div
                      className="flex-1 rounded-2xl"
                      style={{ backgroundImage: "var(--gradient-hero)" }}
                    />
                    <div className="flex flex-1 flex-col gap-3">
                      <div className="flex-1 rounded-2xl bg-[var(--color-secondary)]/60" />
                      <div className="flex-1 rounded-2xl bg-[var(--color-accent)]/60" />
                    </div>
                  </div>
                  <div className="mt-4 flex items-center justify-between">
                    <div className="h-2 w-16 rounded-full bg-[var(--color-foreground)]/20" />
                    <span className="rounded-full bg-[var(--color-primary)] px-3 py-1 text-[10px] font-bold text-white">
                      LIVE
                    </span>
                  </div>
                </div>
              </div>
              {/* Floating chip */}
              <div className="absolute -left-6 top-1/4 rotate-[-6deg] rounded-2xl border border-[var(--color-border)] bg-white px-4 py-3 shadow-xl">
                <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--color-muted-foreground)]">
                  SEO Score
                </p>
                <p className="text-2xl font-black text-[var(--color-success)]">
                  98<span className="text-sm">/100</span>
                </p>
              </div>
              <div className="absolute -right-4 bottom-8 rotate-[5deg] rounded-2xl border border-[var(--color-border)] bg-white px-4 py-3 shadow-xl">
                <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--color-muted-foreground)]">
                  Load Time
                </p>
                <p className="text-2xl font-black text-[var(--color-primary)]">
                  0.4<span className="text-sm">s</span>
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ============ WHY WEBSITE ============ */}
      <WhyWebsiteSection />

      {/* ============ FORM / SIGN-IN ============ */}
      <section
        id="form"
        className="relative overflow-hidden"
        style={{ backgroundImage: "var(--gradient-subtle)" }}
      >
        <div className="mx-auto max-w-7xl px-6 py-20">
          {session?.user ? (
            <GeneratorForm />
          ) : (
            <div className="rounded-3xl border-2 border-dashed border-[var(--color-primary)]/30 bg-white/60 p-16 text-center backdrop-blur">
              <p className="text-3xl font-black">請先登入才能開始生成 🎨</p>
              <p className="mt-4 text-base text-[var(--color-muted-foreground)]">
                我們使用 Google 登入來防止濫用 · 每個帳號終身 2 次免費生成
              </p>
            </div>
          )}
        </div>
      </section>

      {/* ============ FOOTER ============ */}
      <EcosystemFooter variant="dark" />
    </main>
  );
}

function WhyWebsiteSection() {
  return (
    <section
      id="why"
      aria-labelledby="why-website-title"
      className="relative overflow-hidden py-24"
      style={{ backgroundImage: "var(--gradient-dark)" }}
    >
      <div aria-hidden className="absolute inset-0 dots opacity-20" />
      <div className="relative mx-auto flex max-w-7xl flex-col gap-16 px-6 text-[var(--color-background)]">
        <div className="flex flex-col gap-5">
          <span className="w-fit rounded-full bg-white/10 px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-[var(--color-accent)]">
            Why Website · 2026
          </span>
          <h2
            id="why-website-title"
            className="max-w-4xl text-4xl font-black leading-[1.1] tracking-tight md:text-6xl"
          >
            只靠 FB 粉專與 Google 商家,
            <br />
            你正在{" "}
            <span
              className="bg-clip-text text-transparent"
              style={{ backgroundImage: "var(--gradient-hero)" }}
            >
              失去一半的客人
            </span>
            。
          </h2>
          <p className="max-w-3xl text-lg leading-relaxed text-[var(--color-background)]/80 md:text-xl">
            使用者找店家的方式正在劇烈改變 — 年輕人問
            <strong className="text-[var(--color-secondary)]"> ChatGPT</strong>
            「花蓮市好吃的咖啡廳」,長輩問{" "}
            <strong className="text-[var(--color-accent)]">Siri</strong>,上班族看{" "}
            <strong className="text-[var(--color-primary)]">Perplexity</strong>{" "}
            的 AI 摘要。這些「生成式搜尋」會
            <strong className="text-white"> 直接唸答案</strong>
            給使用者聽,而 AI 只能引用「擁有結構化資料的網站」。
            <br />
            <span className="text-[var(--color-background)]/60">
              沒有自己的網站 = 在 AI 時代隱形。
            </span>
          </p>
        </div>

        {/* Three term cards with DIFFERENT color treatments */}
        <div className="grid gap-6 md:grid-cols-3">
          <TermCard
            badge="SEO"
            title="搜尋引擎優化"
            subtitle="Search Engine Optimization"
            body="讓你的店家在 Google 關鍵字搜尋結果的前幾名出現。核心要素:精準的 <title>、Meta 描述、語意化 HTML5、行動裝置適配、載入速度、內部連結結構。本工具產出的 HTML 全部符合。"
            variant="primary"
          />
          <TermCard
            badge="AEO"
            title="答案引擎優化"
            subtitle="Answer Engine Optimization"
            body="Google AI Overview、Siri、Alexa、Google Assistant 會「直接唸答案」給使用者。你的網站必須把常見問題設計成簡潔的 Q&A 結構,才會被抓取成語音回答。本工具自動產生 FAQ 區塊。"
            variant="secondary"
          />
          <TermCard
            badge="GEO"
            title="生成式引擎優化"
            subtitle="Generative Engine Optimization"
            body="當人們問 ChatGPT、Claude、Perplexity、Gemini 時,AI 需要讀取結構化資料才能把你的店家「引用」進答案。沒有 LocalBusiness JSON-LD 的店家,在 AI 眼中不存在。本工具自動注入完整 schema.org 結構化資料。"
            variant="accent"
          />
        </div>

        {/* Versus comparison */}
        <div className="grid gap-0 overflow-hidden rounded-3xl md:grid-cols-2">
          <div className="bg-white/5 p-10 backdrop-blur">
            <h3 className="text-2xl font-black text-[var(--color-background)]/80">
              ❌ 只有 FB 粉專的店家
            </h3>
            <ul className="mt-5 space-y-3 text-sm leading-relaxed text-[var(--color-background)]/60">
              <li>• Meta 演算法壓低自然觸及,貼文要付錢才有人看</li>
              <li>• Google 爬蟲無法完整抓取 FB 動態牆內容</li>
              <li>• ChatGPT / Claude 幾乎不會引用 FB 粉專</li>
              <li>• 無法客製網域、無法自訂外觀、無法 A/B 測試</li>
              <li>• 平台政策一改,你的粉絲一夕歸零</li>
            </ul>
          </div>
          <div
            className="p-10"
            style={{ backgroundImage: "var(--gradient-hero)" }}
          >
            <h3 className="text-2xl font-black text-white">
              ✅ 擁有 5888 網站助手生成網站的店家
            </h3>
            <ul className="mt-5 space-y-3 text-sm leading-relaxed text-white/90">
              <li>
                • 完整的{" "}
                <code className="rounded bg-white/20 px-1.5 py-0.5 text-xs font-mono">
                  LocalBusiness
                </code>{" "}
                JSON-LD 結構化資料
              </li>
              <li>• 帶地區 + 產業關鍵字的 meta title / description</li>
              <li>• 語意化 HTML5 與 WCAG 無障礙規範,Google 權重更高</li>
              <li>• 單檔 index.html,載入極速,Core Web Vitals 滿分</li>
              <li>• 一鍵部署 GitHub Pages,擁有獨立網址 = 擁有品牌主權</li>
            </ul>
          </div>
        </div>

        {/* Bottom line pull-quote */}
        <div className="relative rounded-3xl border border-white/10 bg-white/5 p-10 backdrop-blur md:p-14">
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-[var(--color-accent)]">
            Bottom Line
          </p>
          <p className="mt-4 text-3xl font-black leading-[1.2] text-white md:text-5xl">
            「搜尋引擎會抓到你」已經不夠了。
            <br />
            新時代的目標是「
            <span
              className="bg-clip-text text-transparent"
              style={{ backgroundImage: "var(--gradient-hero)" }}
            >
              被 AI 引用
            </span>
            」。
          </p>
          <p className="mt-6 max-w-3xl text-base leading-relaxed text-[var(--color-background)]/70">
            5888 網站助手 內建的設計系統與 prompt,會把上述所有 SEO / AEO / GEO
            要素自動寫進你的 HTML。不用懂技術、不用寫一行 code,30
            秒後你就有一份可以立刻上線的店家官網。
          </p>
        </div>
      </div>
    </section>
  );
}

function TermCard({
  badge,
  title,
  subtitle,
  body,
  variant,
}: {
  badge: string;
  title: string;
  subtitle: string;
  body: string;
  variant: "primary" | "secondary" | "accent";
}) {
  const styles = {
    primary: {
      card: "bg-[var(--color-primary)] text-white border-transparent",
      chip: "bg-white/20 text-white",
      sub: "text-white/70",
      body: "text-white/85",
    },
    secondary: {
      card: "bg-[var(--color-secondary)] text-[var(--color-secondary-foreground)] border-transparent",
      chip: "bg-[var(--color-secondary-foreground)]/10 text-[var(--color-secondary-foreground)]",
      sub: "text-[var(--color-secondary-foreground)]/70",
      body: "text-[var(--color-secondary-foreground)]/85",
    },
    accent: {
      card: "bg-[var(--color-accent)] text-[var(--color-accent-foreground)] border-transparent",
      chip: "bg-[var(--color-accent-foreground)]/10 text-[var(--color-accent-foreground)]",
      sub: "text-[var(--color-accent-foreground)]/70",
      body: "text-[var(--color-accent-foreground)]/85",
    },
  }[variant];

  return (
    <article
      className={`group flex flex-col gap-3 rounded-3xl border p-7 shadow-xl transition hover:-translate-y-2 hover:shadow-2xl ${styles.card}`}
    >
      <span
        className={`w-fit rounded-full px-3 py-1 text-xs font-black tracking-[0.2em] ${styles.chip}`}
      >
        {badge}
      </span>
      <h3 className="text-3xl font-black tracking-tight">{title}</h3>
      <p className={`text-[11px] font-bold uppercase tracking-[0.15em] ${styles.sub}`}>
        {subtitle}
      </p>
      <p className={`text-sm leading-relaxed ${styles.body}`}>{body}</p>
    </article>
  );
}
