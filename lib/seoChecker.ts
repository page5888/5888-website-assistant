/**
 * SEO Checker — 產線網站 SEO 品質檢查工具
 *
 * 基於 seo-checker 獨立工具改寫為 TypeScript module。
 * 生成 HTML 後自動執行品檢，不通過的網站不應交付。
 *
 * 用法：
 *   import { runSeoCheck, type SeoReport } from "@/lib/seoChecker";
 *   const report = runSeoCheck(html);
 *   if (report.summary.fail > 0) { ... }
 */

import * as cheerio from "cheerio";

// ============================================================
// 類型定義
// ============================================================

export type SeoLevel = "pass" | "fail" | "warn" | "info";

export interface SeoResult {
  level: SeoLevel;
  category: string;
  title: string;
  message: string;
  suggestion?: string;
}

export interface SeoSummary {
  pass: number;
  fail: number;
  warn: number;
  info: number;
  total: number;
}

export interface SeoReport {
  results: SeoResult[];
  summary: SeoSummary;
}

// ============================================================
// Report 累積器
// ============================================================

class Report {
  results: SeoResult[] = [];

  add(level: SeoLevel, category: string, title: string, message: string, suggestion?: string) {
    this.results.push({ level, category, title, message, suggestion });
  }
  pass(cat: string, title: string, msg: string) { this.add("pass", cat, title, msg); }
  fail(cat: string, title: string, msg: string, sug?: string) { this.add("fail", cat, title, msg, sug); }
  warn(cat: string, title: string, msg: string, sug?: string) { this.add("warn", cat, title, msg, sug); }
  info(cat: string, title: string, msg: string) { this.add("info", cat, title, msg); }

  summary(): SeoSummary {
    const pass = this.results.filter((r) => r.level === "pass").length;
    const fail = this.results.filter((r) => r.level === "fail").length;
    const warn = this.results.filter((r) => r.level === "warn").length;
    const info = this.results.filter((r) => r.level === "info").length;
    return { pass, fail, warn, info, total: this.results.length };
  }
}

// ============================================================
// 檢查器
// ============================================================

function checkHead($: cheerio.CheerioAPI, report: Report) {
  const cat = "Head 基礎";

  // html lang
  const lang = $("html").attr("lang");
  if (!lang) {
    report.fail(cat, "html lang", "缺少 <html lang> 屬性", '加上 <html lang="zh-Hant-TW">');
  } else if (lang === "zh-TW") {
    report.warn(cat, "html lang", `lang="${lang}" 是舊標準`, "建議改成 zh-Hant-TW");
  } else if (lang === "zh-Hant-TW" || lang === "zh-Hant") {
    report.pass(cat, "html lang", `lang="${lang}" ✓`);
  } else {
    report.warn(cat, "html lang", `lang="${lang}" 非預期值`, "台灣繁中建議用 zh-Hant-TW");
  }

  // charset
  if (!$("meta[charset]").attr("charset")) {
    report.fail(cat, "charset", "缺少 <meta charset>", '加上 <meta charset="UTF-8">');
  } else {
    report.pass(cat, "charset", "charset ✓");
  }

  // viewport
  if (!$('meta[name="viewport"]').attr("content")) {
    report.fail(cat, "viewport", "缺少 viewport meta");
  } else {
    report.pass(cat, "viewport", "viewport ✓");
  }

  // title
  const title = $("title").text().trim();
  if (!title) {
    report.fail(cat, "title", "缺少 <title>", "加上帶地區+服務+店名的 title");
  } else {
    const len = [...title].length;
    if (len < 15) report.warn(cat, "title", `title 過短（${len} 字）`, "建議 20-32 字");
    else if (len > 35) report.warn(cat, "title", `title 過長（${len} 字）`, "建議控制在 32 字內");
    else report.pass(cat, "title", `title (${len} 字) ✓`);
  }

  // description
  const desc = $('meta[name="description"]').attr("content");
  if (!desc) {
    report.fail(cat, "description", "缺少 meta description");
  } else {
    const len = [...desc].length;
    if (len < 80) report.warn(cat, "description", `description 過短（${len} 字）`);
    else if (len > 170) report.warn(cat, "description", `description 過長（${len} 字）`);
    else report.pass(cat, "description", `description (${len} 字) ✓`);
  }

  // canonical
  const canonical = $('link[rel="canonical"]').attr("href");
  if (!canonical) {
    report.fail(cat, "canonical", "缺少 canonical 連結");
  } else if (canonical.includes("{{CANONICAL_URL}}")) {
    // Placeholder not yet replaced — acceptable pre-deploy
    report.warn(cat, "canonical", "canonical 仍是佔位符（部署時會替換）");
  } else {
    report.pass(cat, "canonical", "canonical ✓");
  }
}

function checkSocialMeta($: cheerio.CheerioAPI, report: Report) {
  const cat = "社群分享";

  const ogFields: Record<string, string> = {
    "og:type": "OG type",
    "og:title": "OG 標題",
    "og:description": "OG 描述",
    "og:image": "OG 圖片",
    "og:url": "OG URL",
  };

  let ogComplete = true;
  for (const [prop, name] of Object.entries(ogFields)) {
    if (!$(`meta[property="${prop}"]`).attr("content")) {
      report.fail(cat, name, `缺少 ${prop}`);
      ogComplete = false;
    }
  }
  if (ogComplete) report.pass(cat, "Open Graph", "五件套完整 ✓");

  if (!$('meta[name="twitter:card"]').attr("content")) {
    report.warn(cat, "Twitter Card", "缺少 twitter:card");
  } else {
    report.pass(cat, "Twitter Card", "twitter:card ✓");
  }

  const ogImage = $('meta[property="og:image"]').attr("content");
  if (ogImage && !ogImage.startsWith("http")) {
    report.fail(cat, "og:image 格式", "og:image 不是絕對 URL");
  }
}

function checkSchema($: cheerio.CheerioAPI, report: Report) {
  const cat = "Schema 結構化資料";
  const scripts = $('script[type="application/ld+json"]');

  if (scripts.length === 0) {
    report.fail(cat, "JSON-LD", "完全沒有 JSON-LD schema", "至少要有 LocalBusiness schema");
    return;
  }

  const schemas: Record<string, unknown>[] = [];
  scripts.each((_i, el) => {
    try {
      schemas.push(JSON.parse($(el).html() ?? ""));
    } catch (e) {
      report.fail(cat, "JSON-LD 格式", `JSON-LD 解析失敗：${(e as Error).message}`);
    }
  });

  const bizTypes = [
    "LocalBusiness", "Restaurant", "Store", "Locksmith", "BeautySalon",
    "HairSalon", "CafeOrCoffeeShop", "Dentist", "ExerciseGym",
    "LodgingBusiness", "AutoRepair", "MedicalBusiness", "ProfessionalService",
    "LegalService", "RealEstateAgent",
  ];
  const localBiz = schemas.find((s) => {
    const t = s["@type"];
    if (Array.isArray(t)) return t.some((x) => bizTypes.includes(x as string));
    return bizTypes.includes(t as string);
  });

  if (!localBiz) {
    report.fail(cat, "LocalBusiness", "缺少 LocalBusiness schema");
  } else {
    report.pass(cat, "LocalBusiness", "LocalBusiness schema 存在 ✓");

    for (const f of ["name", "address", "telephone", "url"]) {
      if (!(localBiz as Record<string, unknown>)[f]) {
        report.fail(cat, `schema.${f}`, `LocalBusiness 缺少 ${f}`);
      }
    }
    for (const f of ["geo", "openingHoursSpecification", "image", "priceRange", "areaServed"]) {
      if (!(localBiz as Record<string, unknown>)[f]) {
        report.warn(cat, `schema.${f}`, `LocalBusiness 建議補上 ${f}`);
      }
    }

    if (typeof localBiz.url === "string" && (localBiz.url as string).includes("facebook.com")) {
      report.fail(cat, "schema.url", "schema url 指向 Facebook，應指向網站本身");
    }
  }

  // FAQPage
  const hasFaqSection = $("details").length > 0 || $("body").text().includes("常見問題");
  const hasFaqSchema = schemas.some((s) => s["@type"] === "FAQPage");
  if (hasFaqSection && !hasFaqSchema) {
    report.fail(cat, "FAQPage", "頁面有 FAQ 但沒有 FAQPage schema");
  } else if (hasFaqSchema) {
    report.pass(cat, "FAQPage", "FAQPage schema 存在 ✓");
  }
}

function checkHeadings($: cheerio.CheerioAPI, report: Report) {
  const cat = "標題階層";

  const h1s = $("h1");
  if (h1s.length === 0) {
    report.fail(cat, "H1", "整頁沒有 H1");
  } else if (h1s.length > 1) {
    report.fail(cat, "H1 數量", `有 ${h1s.length} 個 H1，應該只有 1 個`);
  } else {
    const h1 = h1s.first();
    const h1Text = h1.text().trim();

    // Check for per-character span splitting
    const singleCharSpans = h1.children("span")
      .map((_i, el) => $(el).text().length)
      .get()
      .filter((len: number) => len === 1).length;

    if (singleCharSpans >= 5) {
      report.fail(cat, "H1 字元拆分", `H1 被拆成 ${singleCharSpans} 個單字 <span>，Google 讀成斷字`);
    }

    if (h1Text.length < 2) {
      report.fail(cat, "H1 內容", "H1 幾乎是空的");
    } else {
      report.pass(cat, "H1", `H1 存在 ✓ ("${h1Text.substring(0, 40)}")`);
    }
  }

  // Heading hierarchy
  const headings: { level: number; text: string }[] = [];
  $("h1, h2, h3, h4, h5, h6").each((_i, el) => {
    headings.push({
      level: parseInt(el.tagName.substring(1)),
      text: $(el).text().trim().substring(0, 30),
    });
  });
  for (let i = 1; i < headings.length; i++) {
    if (headings[i].level - headings[i - 1].level > 1) {
      report.warn(cat, "H 階層跳級",
        `H${headings[i - 1].level} 後直接跳到 H${headings[i].level}`);
      break;
    }
  }
}

function checkImages($: cheerio.CheerioAPI, report: Report) {
  const cat = "圖片 SEO";
  const imgs = $("img");

  if (imgs.length === 0) {
    report.info(cat, "圖片", "頁面沒有圖片");
    return;
  }

  let noAlt = 0;
  let badAlt = 0;
  let noDimension = 0;
  let heroLazy = false;

  imgs.each((i, el) => {
    const $img = $(el);
    const alt = $img.attr("alt");
    const loading = $img.attr("loading");
    const width = $img.attr("width");
    const height = $img.attr("height");

    if (alt === undefined) noAlt++;
    else if (!alt.trim() || alt === "圖片" || alt === "image" || /\.(jpg|jpeg|png|webp|gif)$/i.test(alt)) badAlt++;

    if (!width || !height) noDimension++;
    if (i === 0 && loading === "lazy") heroLazy = true;
  });

  if (noAlt > 0) report.fail(cat, "alt 缺失", `${noAlt} 張圖沒有 alt 屬性`);
  if (badAlt > 0) report.warn(cat, "alt 品質", `${badAlt} 張圖 alt 空或無意義`);
  if (noDimension > 0) report.warn(cat, "圖片尺寸", `${noDimension} 張圖缺 width/height（影響 CLS）`);
  if (heroLazy) report.fail(cat, "Hero lazy", "首張圖用 loading=lazy，拖累 LCP");
  if (noAlt === 0 && badAlt === 0 && !heroLazy) {
    report.pass(cat, "圖片基礎", `${imgs.length} 張圖檢查通過 ✓`);
  }
}

function checkPerformance($: cheerio.CheerioAPI, report: Report) {
  const cat = "效能";

  if ($('script[src*="cdn.tailwindcss.com"]').length > 0) {
    // Known: we currently use Tailwind CDN. Mark as warn (not fail) since
    // we plan to replace it but it's functional.
    report.warn(cat, "Tailwind CDN", "使用 cdn.tailwindcss.com（production 建議預編譯）");
  }

  // Google Fonts preconnect
  if ($('link[href*="fonts.googleapis.com"]').length > 0) {
    if (!$('link[rel="preconnect"][href*="fonts.gstatic.com"]').length) {
      report.warn(cat, "Fonts preconnect", "用了 Google Fonts 但沒 preconnect");
    }
    const fontUrl = $('link[href*="fonts.googleapis.com"]').first().attr("href") ?? "";
    if (!fontUrl.includes("display=swap")) {
      report.warn(cat, "Fonts swap", "Google Fonts 沒加 display=swap");
    }
  }

  // HTTP resources
  let httpCount = 0;
  $('link[href^="http:"], script[src^="http:"], img[src^="http:"]').each(() => { httpCount++; });
  if (httpCount > 0) report.fail(cat, "HTTPS", `${httpCount} 個資源用 HTTP`);
}

function checkContactability($: cheerio.CheerioAPI, report: Report) {
  const cat = "聯絡可點擊";

  const telLinks = $('a[href^="tel:"]');
  const hasPhone = /0\d[-\s]?\d{3,4}[-\s]?\d{3,4}|\+886/.test($("body").text());

  if (hasPhone && telLinks.length === 0) {
    report.fail(cat, "電話連結", "有電話號碼但沒有 tel: 連結");
  } else if (telLinks.length > 0) {
    report.pass(cat, "電話連結", `${telLinks.length} 個 tel: 連結 ✓`);
  }

  const mapLinks = $('a[href*="maps.google"], a[href*="maps.app.goo.gl"], a[href*="goo.gl/maps"]');
  if (mapLinks.length === 0) {
    report.warn(cat, "地圖連結", "沒有 Google Map 連結");
  } else {
    report.pass(cat, "地圖連結", `${mapLinks.length} 個地圖連結 ✓`);
  }
}

function checkA11y($: cheerio.CheerioAPI, report: Report) {
  const cat = "無障礙";

  let noRel = 0;
  $('a[target="_blank"]').each((_i, el) => {
    if (!($(el).attr("rel") ?? "").includes("noopener")) noRel++;
  });
  if (noRel > 0) report.warn(cat, "外部連結安全", `${noRel} 個 target=_blank 缺 rel=noopener`);
}

// ============================================================
// 主函式
// ============================================================

/**
 * Run all SEO checks on an HTML string and return a structured report.
 */
export function runSeoCheck(html: string): SeoReport {
  const $ = cheerio.load(html);
  const report = new Report();

  checkHead($, report);
  checkSocialMeta($, report);
  checkSchema($, report);
  checkHeadings($, report);
  checkImages($, report);
  checkPerformance($, report);
  checkContactability($, report);
  checkA11y($, report);

  return {
    results: report.results,
    summary: report.summary(),
  };
}

/**
 * Quick check: does this HTML pass the minimum bar for delivery?
 * Returns true if there are zero "fail" level issues.
 */
export function passesSeoMinimum(html: string): boolean {
  return runSeoCheck(html).summary.fail === 0;
}
