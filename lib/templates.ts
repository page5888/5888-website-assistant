import fs from "fs";
import path from "path";

// ============================================================
// Template registry
// ============================================================

export interface TemplateInfo {
  id: string;
  /** Display name shown in the form */
  name: string;
  /** Short Chinese description */
  description: string;
  /** Which industries this template works best for */
  bestFor: string;
  /** Filename in lib/templates/ */
  filename: string;
}

export const TEMPLATES: TemplateInfo[] = [
  {
    id: "editorial",
    name: "雜誌風 Editorial",
    description: "大量留白、左右分割排版、serif 字體、克制配色",
    bestFor: "咖啡廳、烘焙、花藝、手作、選品店、精品",
    filename: "editorial.html",
  },
  {
    id: "bold",
    name: "衝擊風 Bold",
    description: "全版照片、暗底白字、強烈 CTA、高對比度",
    bestFor: "餐廳、健身房、汽修、鎖匠、理髮、運動",
    filename: "bold.html",
  },
  {
    id: "auto",
    name: "自動選擇",
    description: "依產業類別自動選擇最適合的模板",
    bestFor: "所有產業",
    filename: "", // resolved at runtime
  },
];

/**
 * Read a template HTML file from disk.
 * Returns the raw HTML with {{PLACEHOLDER}} tokens.
 */
export function readTemplate(templateId: string): string {
  const tpl = TEMPLATES.find((t) => t.id === templateId);
  if (!tpl || !tpl.filename) {
    throw new Error(`Unknown template: ${templateId}`);
  }
  const filePath = path.join(process.cwd(), "lib", "templates", tpl.filename);
  return fs.readFileSync(filePath, "utf-8");
}

/**
 * Given an industry hint, pick the best template automatically.
 */
export function autoPickTemplate(industryHint: string): string {
  const hint = (industryHint ?? "").toLowerCase();
  const boldKeywords = [
    "餐", "食", "鍋", "麵", "飯", "丼", "燒", "烤", "炸",
    "健身", "運動", "gym", "fit",
    "汽車", "機車", "修車", "保養", "auto",
    "鎖", "鑰匙", "lock",
    "理髮", "barber", "剪髮",
    "酒", "bar", "pub",
  ];
  if (boldKeywords.some((kw) => hint.includes(kw))) {
    return "bold";
  }
  return "editorial";
}

/**
 * Get the list of all {{PLACEHOLDER}} keys used in a template HTML.
 * Useful for building the filling prompt.
 */
export function extractPlaceholders(html: string): string[] {
  const matches = html.matchAll(/\{\{([A-Z0-9_]+)\}\}/g);
  const keys = new Set<string>();
  for (const m of matches) keys.add(m[1]);
  return [...keys].sort();
}
