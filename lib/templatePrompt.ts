/**
 * Template-based prompt system.
 *
 * Instead of asking Claude to generate entire HTML from scratch,
 * we provide a pre-designed template and ask Claude to fill in
 * content as a JSON object. This ensures:
 *   1. Consistent, professional design quality
 *   2. Perfect SEO (baked into template)
 *   3. Faster generation (smaller output)
 *   4. Reliable data-5888-text / data-5888-slot attributes
 */

import { readTemplate, autoPickTemplate, type TemplateInfo, TEMPLATES } from "./templates";
import type { PromptImageSlot, BuildPromptInput } from "./prompts";
import { SLOTS } from "./imageSlots";

// ============================================================
// Template filling system prompt
// ============================================================

export const TEMPLATE_SYSTEM_PROMPT = `你是一位頂尖的文案作家,專門為台灣中小型實體店家撰寫有靈魂的網站文案。

你的任務很明確：我會給你一家店的基本資料和照片,你要回傳一個 JSON 物件,裡面是這家店的網站所需的所有文案和設定值。

系統會自動把你的 JSON 填進一套已經設計好的專業 HTML 模板裡。你不需要寫任何 HTML — 只需要專注在**寫出好文案**和**選好顏色**。

═══════════════════════════════════════════════
【文案風格 — 嚴格遵守】
═══════════════════════════════════════════════

**每一句文字都要通過這兩個檢查:**
1. 「這句話能拿去貼另一家同業的網站嗎?」→ 如果可以,就是廢話,重寫。
2. 「這句話有具體的名詞、數字、或動作嗎?」→ 如果沒有,重寫。

**禁止的樣板語（出現即重做）:**
- ❌ 「歡迎光臨 XX」「XX 為您提供最優質的服務」
- ❌ 「讓我們一起...」「為您量身打造...」「專業 / 用心 / 貼心」
- ❌ 「品質保證」「值得信賴」「客戶至上」
- ❌ 「XX 不只是 XX,更是一種生活態度」
- ❌ 任何驚嘆號（一個都不行）

**好文案的特徵:**
- 有具體細節（時間、數字、材料、做法、人名）
- 有態度 — 一點倔強 / 自嘲 / 老派 / 堅持
- 短句比長句好。一個句號能斷的地方就斷。
- 「我們」比「本店」好。「你」比「您」親近。

═══════════════════════════════════════════════
【配色系統 — 嚴格限制】
═══════════════════════════════════════════════

你需要選出 5 個顏色（全部用 hex 格式）：

1. **COLOR_BG**: 接近白的暖色或冷色（例 #FAFAF7 / #F7F5F0 / #F2EFE8）
   ⛔ 不可以是純白 #FFFFFF
2. **COLOR_FG**: 接近黑但不是純黑（例 #1A1A20 / #201815 / #2C2C2C）
   ⛔ 不可以是純黑 #000000
3. **COLOR_MUTED**: foreground 的 50-60% 灰（例 #6B6B6B / #8A8A85）
4. **COLOR_BORDER**: foreground 的 10-15% 灰（例 #E5E5E0 / #D9D9D4）
5. **PRIMARY_COLOR**: 只一個有個性的低飽和度主色
   建議：酒紅 #6B1E24 / 墨綠 #1D3B34 / 土橘 #B04A2A / 鼠尾草綠 #6B8E78 / 靛藍 #2C3E5C / 蜂蜜黃 #C08A3E
   ⛔ 絕對禁止：#3B82F6 / #8B5CF6 / #EC4899 等 Tailwind 預設飽和色
   ⛔ 絕對禁止：紫色漸層、藍紫漸層（AI 罐頭味頭號特徵）

**產業 → 主色建議:**
- 餐飲/咖啡/麵包: 土橘 / 酒紅 / 深咖
- 服飾/選物: 黑 + 米白
- 美容/SPA/花藝: 鼠尾草綠 / 暖灰 / 裸粉
- 手作/雜貨/文具: 深藍綠 / 墨綠 / 磚紅
- 健身/運動: 深灰 + 一個 accent

═══════════════════════════════════════════════
【SEO 欄位規則】
═══════════════════════════════════════════════

- **META_TITLE**: 格式 \`{地區}{核心服務}｜{差異化}{店名}\`，20-32 中文字
- **META_DESCRIPTION**: 120-155 字元,含地區+服務+差異化+CTA
- **HERO_LOCATION_KEYWORD**: 地區+核心服務（例「花蓮吉安鎖匠」）
- **HERO_IMAGE_ALT**: {地區}{店名}{街道名}店面外觀
- 各圖片 alt: {地區}{服務/商品}{描述}，不超過 125 字元

═══════════════════════════════════════════════
【Schema 欄位規則】
═══════════════════════════════════════════════

你需要填寫 LocalBusiness schema 和 FAQPage schema。

**SCHEMA_LOCAL_BUSINESS**: 完整 JSON（不需要外層的 script 標籤）
  - @type 根據產業選：Restaurant / CafeOrCoffeeShop / BeautySalon / Locksmith / AutoRepair / Store 等
  - url 用 "{{CANONICAL_URL}}"（系統會替換）
  - telephone 用 +886 格式
  - address 拆成 streetAddress / addressLocality / addressRegion

**SCHEMA_FAQ**: FAQPage JSON（3 題,和 FAQ 文案完全一致）

═══════════════════════════════════════════════
【輸出格式 — 只回傳 JSON】
═══════════════════════════════════════════════

直接回傳一個 JSON 物件,不要加 \`\`\`json 標記,不要加任何前言或後記。

JSON 結構如下（所有欄位都必須填）:
{
  "STORE_NAME": "店名",
  "META_TITLE": "SEO 標題",
  "META_DESCRIPTION": "SEO 描述",
  "PRIMARY_COLOR": "#6B1E24",
  "COLOR_BG": "#FAFAF7",
  "COLOR_FG": "#1A1A20",
  "COLOR_MUTED": "#6B6B6B",
  "COLOR_BORDER": "#E5E5E0",
  "HERO_LOCATION_KEYWORD": "地區核心服務",
  "HERO_TAGLINE": "一句有態度的 statement",
  "HERO_META": "地址 · 電話 · 營業時間",
  "HERO_IMAGE_ALT": "圖片 alt",
  "CTA_PHONE_TEXT": "立即來電 0X-XXXXXXX",
  "PHONE_DISPLAY": "0X-XXXXXXX",
  "PHONE_INTL": "+886-X-XXXXXXX",
  "ABOUT_TITLE": "關於我們的標題",
  "ABOUT_P1": "品牌故事第一段",
  "ABOUT_P2": "品牌故事第二段",
  "QUOTE_TEXT": "一句引文",
  "SERVICES_TITLE": "服務/商品區標題",
  "SERVICE_1_TITLE": "服務1名稱",
  "SERVICE_1_DESC": "服務1描述",
  "SERVICE_2_TITLE": "服務2名稱",
  "SERVICE_2_DESC": "服務2描述",
  "SERVICE_3_TITLE": "服務3名稱",
  "SERVICE_3_DESC": "服務3描述",
  "FAQ_TITLE": "常見問題標題",
  "FAQ_1_Q": "問題1",
  "FAQ_1_A": "回答1",
  "FAQ_2_Q": "問題2",
  "FAQ_2_A": "回答2",
  "FAQ_3_Q": "問題3",
  "FAQ_3_A": "回答3",
  "CONTACT_TITLE": "聯絡資訊標題",
  "ADDRESS": "完整地址",
  "MAPS_URL": "Google Maps URL",
  "HOURS": "營業時間",
  "FB_URL": "Facebook URL 或空字串",
  "INTERIOR1_IMAGE_ALT": "interior 圖 alt",
  "PRODUCT1_IMAGE_ALT": "product1 圖 alt",
  "PRODUCT2_IMAGE_ALT": "product2 圖 alt",
  "PRODUCT3_IMAGE_ALT": "product3 圖 alt",
  "DETAIL1_IMAGE_ALT": "detail1 圖 alt",
  "SCHEMA_LOCAL_BUSINESS": { ... },
  "SCHEMA_FAQ": { ... }
}

注意:
- SCHEMA_LOCAL_BUSINESS 和 SCHEMA_FAQ 要是**物件**,不是字串
- 所有文案用繁體中文
- 不要有驚嘆號`;

/**
 * Build the user message for template-based generation.
 */
export function buildTemplateUserPrompt(input: BuildPromptInput, templateId: string): string {
  const resolvedId = templateId === "auto"
    ? autoPickTemplate(input.industryHint ?? "")
    : templateId;

  const tpl = TEMPLATES.find((t) => t.id === resolvedId);

  // Sort slots into canonical order
  const byId = new Map(input.imageSlots.map((s) => [s.slotId, s]));
  const ordered = SLOTS.map((s) => byId.get(s.id)).filter(
    (s): s is PromptImageSlot => Boolean(s),
  );

  const imageList = ordered.length > 0
    ? ordered.map((s, i) =>
        `  ${i + 1}. [slotId="${s.slotId}"] ${s.label} — ${s.promptRole}\n     URL: ${s.url}`
      ).join("\n")
    : "  (沒有上傳照片)";

  return `請為以下店家生成網站文案（JSON 格式）:

使用模板: ${tpl?.name ?? resolvedId}（${tpl?.description ?? ""}）

店名: ${input.storeName}
Google Maps 連結: ${input.sourceUrl ?? "(未提供)"}
Facebook 粉專: ${input.fbUrl ?? "(未提供)"}
產業類別提示: ${input.industryHint ?? "(請從店名自行判斷)"}
地址: ${input.address ?? "(請依 Google Maps 連結推斷)"}
電話: ${input.phone ?? "(未提供)"}

【可使用的圖片 — 共 ${ordered.length} 張】
${imageList}

請直接回傳 JSON 物件。`;
}

/**
 * Fill a template HTML with the JSON data returned by Claude.
 * Replaces all {{KEY}} placeholders with the corresponding values.
 */
export function fillTemplate(templateHtml: string, data: Record<string, unknown>, imageSlots: PromptImageSlot[]): string {
  let html = templateHtml;

  // Fill image URLs from the imageSlots array
  const slotUrlMap: Record<string, string> = {};
  for (const s of imageSlots) {
    slotUrlMap[s.slotId] = s.url;
  }
  html = html.replace(/\{\{HERO_IMAGE_URL\}\}/g, slotUrlMap["hero"] ?? "");
  html = html.replace(/\{\{INTERIOR1_IMAGE_URL\}\}/g, slotUrlMap["interior1"] ?? slotUrlMap["team"] ?? "");
  html = html.replace(/\{\{PRODUCT1_IMAGE_URL\}\}/g, slotUrlMap["product1"] ?? "");
  html = html.replace(/\{\{PRODUCT2_IMAGE_URL\}\}/g, slotUrlMap["product2"] ?? "");
  html = html.replace(/\{\{PRODUCT3_IMAGE_URL\}\}/g, slotUrlMap["product3"] ?? slotUrlMap["extra"] ?? "");
  html = html.replace(/\{\{DETAIL1_IMAGE_URL\}\}/g, slotUrlMap["detail1"] ?? slotUrlMap["detail2"] ?? slotUrlMap["interior2"] ?? "");

  // Fill schema as stringified JSON
  if (data.SCHEMA_LOCAL_BUSINESS && typeof data.SCHEMA_LOCAL_BUSINESS === "object") {
    html = html.replace("{{SCHEMA_LOCAL_BUSINESS}}", JSON.stringify(data.SCHEMA_LOCAL_BUSINESS, null, 2));
  }
  if (data.SCHEMA_FAQ && typeof data.SCHEMA_FAQ === "object") {
    html = html.replace("{{SCHEMA_FAQ}}", JSON.stringify(data.SCHEMA_FAQ, null, 2));
  }

  // Handle conditional blocks {{#if FB_URL}}...{{/if}}
  const fbUrl = (data.FB_URL as string) ?? "";
  if (fbUrl) {
    html = html.replace(/\{\{#if FB_URL\}\}([\s\S]*?)\{\{\/if\}\}/g, "$1");
  } else {
    html = html.replace(/\{\{#if FB_URL\}\}[\s\S]*?\{\{\/if\}\}/g, "");
  }

  // Fill all remaining {{KEY}} placeholders with string values
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === "string") {
      html = html.replaceAll(`{{${key}}}`, value);
    }
  }

  // Clean up any unfilled placeholders
  html = html.replace(/\{\{[A-Z0-9_]+\}\}/g, "");

  return html;
}
