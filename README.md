# Web-Cteater｜AI 店家網站產生器

一個 SaaS 型單頁網站產生器。使用者以 Google / Facebook 登入後,填入店家資料,
系統會呼叫 Claude API(依照內建的五大設計思維 system prompt)為店家產出
一份完整的 `index.html`。可預覽、付款(模擬)後下載,或一鍵部署到 GitHub Pages。

## 架構

- **Next.js 15** (App Router) + TypeScript + Tailwind CSS v4
- **Auth.js v5** (`next-auth@beta`) — Google OAuth(FB 待審核)
- **Upstash Redis** — 每日 1 次限額 + HTML 暫存(1 小時 TTL)
- **Anthropic Claude API** — 使用者可選 `claude-sonnet-4-6` 或 `claude-opus-4-6`
- **圖片來源(依序 fallback)**:使用者上傳 → FB 粉專爬蟲 → Unsplash → Gemini Imagen
- **GitHub REST API** (Octokit) — 建 repo + 上傳 + 啟用 Pages
- **Mock 付款** — 第一版用模擬,第二版再接 Stripe / 綠界

## 快速開始

### 1. 安裝依賴

```bash
pnpm install
```

### 2. 設定環境變數

複製 `.env.example` 為 `.env.local`,然後填入:

```bash
cp .env.example .env.local
```

| 變數 | 如何取得 |
|---|---|
| `AUTH_SECRET` | `openssl rand -hex 32` |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | [Google Cloud Console](https://console.cloud.google.com) → OAuth 2.0 → 建立 Client ID,redirect URI 填 `http://localhost:3000/api/auth/callback/google` |
| `ANTHROPIC_API_KEY` | [Anthropic Console](https://console.anthropic.com/settings/keys) |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | [Upstash Console](https://console.upstash.com) 建 Redis DB → REST API 區塊 |
| `UNSPLASH_ACCESS_KEY` | [Unsplash Developers](https://unsplash.com/developers) → New Application |
| `GOOGLE_GEMINI_API_KEY` | [Google AI Studio](https://aistudio.google.com/apikey) (選填,AI 圖片生成 fallback) |
| `GITHUB_TOKEN` | GitHub → Settings → Developer settings → Personal access tokens (fine-grained) → 權限 `repo` + `pages:write` |
| `GITHUB_OWNER` | 預設 `page5888` |

### 3. 啟動開發伺服器

```bash
pnpm dev
```

開 <http://localhost:3000>

### 4. 操作流程

1. 點「以 Google 登入」
2. 填表單(店名必填,其他選填)→ 送出
3. 等待 30-90 秒,跳轉到預覽頁
4. 點「💳 付款(模擬)」→ 立刻成功
5. 兩個選項:
   - ⬇️ 下載 `index.html` 到本機
   - 🚀 一鍵部署到 `https://page5888.github.io/site-xxx/`

## 目錄結構

```
app/
├─ api/
│  ├─ auth/[...nextauth]/  # Auth.js handlers
│  ├─ generate/            # POST: call Claude, store HTML in Redis
│  ├─ pay/                 # POST: mock payment, mark meta.paid = true
│  ├─ download/            # GET: return index.html (payment gated)
│  └─ deploy/              # POST: Octokit → create repo → upload → enable Pages
├─ preview/[id]/           # iframe sandbox preview
└─ page.tsx                # Landing + GeneratorForm
components/
├─ GeneratorForm.tsx       # client form with image upload
└─ PreviewActions.tsx      # pay / download / deploy buttons
lib/
├─ auth.ts                 # NextAuth config + getUserKey()
├─ ratelimit.ts            # Upstash ratelimit (1/day/account)
├─ redis.ts                # Upstash Redis client
├─ anthropic.ts            # Claude API wrapper + HTML validation
├─ prompts.ts              # 5-principle DESIGN_SYSTEM_PROMPT
├─ github.ts               # Octokit deploy flow
└─ images/
   ├─ collect.ts           # Priority pipeline
   ├─ fbScraper.ts         # Best-effort FB scraper
   ├─ unsplash.ts          # Unsplash API
   └─ aiGen.ts             # Gemini Imagen fallback
middleware.ts              # Protects /preview/* and /api/*
```

## 部署到 Vercel

```bash
pnpm build                  # smoke test locally
vercel                      # first deploy (interactive)
vercel --prod               # production
```

然後在 Vercel 專案 Settings → Environment Variables 把 `.env.local` 的所有變數貼上去。
Google OAuth redirect URI 要加上 production domain。

## 安全備註

- **`.env.local` 已在 `.gitignore`** 中,絕不要提交到 git
- `GITHUB_TOKEN` 外洩會導致你的 GitHub 帳號被任意建 repo,請只在伺服器端使用
- FB 粉專爬蟲是 best-effort,違反 FB TOS,失敗時會自動 fallback
- Mock 付款**沒有實際收費**,上線前必須接真實金流

## 已知待辦

- [ ] Facebook OAuth provider(等 FB App 審核通過)
- [ ] 接真實金流(Stripe / 綠界 / 藍新)
- [ ] AI 生成前預估 Claude token 成本並顯示
- [ ] 生成歷史記錄 / 我的網站列表
- [ ] IP + fingerprint 二次限額(防止多帳號繞過)

---

Web-Cteater ｜ 2026 Design by 幸福瓢蟲手作雜貨
