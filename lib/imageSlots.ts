/**
 * Named image slots used by the generator form and prompt pipeline.
 *
 * The upload UI presents these slots in order. The first 3 are REQUIRED
 * (we won't let the form submit without them); the rest are optional.
 * Each slot has a target aspect ratio that `sharp` will crop to server-
 * side before the image is stored in Vercel Blob, so every generated
 * site gets consistently-sized imagery without AI scraping.
 *
 * CSS filter values are applied at render time (not baked into the
 * image) so the user can preview the processed photo as-is during
 * upload, but the generated HTML still gets the unified "look".
 */

export type SlotId =
  | "hero"
  | "product1"
  | "product2"
  | "product3"
  | "interior1"
  | "interior2"
  | "team"
  | "detail1"
  | "detail2"
  | "extra";

export interface SlotDefinition {
  id: SlotId;
  /** Short Traditional Chinese label shown in the upload UI. */
  label: string;
  /** Longer hint explaining what to upload here. */
  hint: string;
  /** Emoji used as visual placeholder in empty slot. */
  emoji: string;
  /** Aspect ratio (width / height) — sharp crops to this. */
  aspectRatio: number;
  /** Target width in pixels after resize. */
  targetWidth: number;
  /** Target height — derived from width / aspectRatio. */
  targetHeight: number;
  /** If true, the form won't submit until this slot is filled. */
  required: boolean;
  /** Semantic role for the AI prompt. */
  promptRole: string;
}

export const SLOTS: SlotDefinition[] = [
  {
    id: "hero",
    label: "封面主視覺",
    hint: "店面外觀或代表性空間(橫幅)",
    emoji: "🏪",
    aspectRatio: 16 / 9,
    targetWidth: 1920,
    targetHeight: 1080,
    required: true,
    promptRole: "Hero banner — the first thing visitors see",
  },
  {
    id: "product1",
    label: "主打商品 A",
    hint: "招牌商品、主力服務照 1",
    emoji: "⭐",
    aspectRatio: 4 / 3,
    targetWidth: 1200,
    targetHeight: 900,
    required: true,
    promptRole: "Primary product / signature item #1",
  },
  {
    id: "product2",
    label: "主打商品 B",
    hint: "招牌商品、主力服務照 2",
    emoji: "⭐",
    aspectRatio: 4 / 3,
    targetWidth: 1200,
    targetHeight: 900,
    required: true,
    promptRole: "Primary product / signature item #2",
  },
  {
    id: "product3",
    label: "主打商品 C",
    hint: "招牌商品、主力服務照 3",
    emoji: "⭐",
    aspectRatio: 4 / 3,
    targetWidth: 1200,
    targetHeight: 900,
    required: false,
    promptRole: "Primary product / signature item #3",
  },
  {
    id: "interior1",
    label: "店內環境 A",
    hint: "店內空間、座位區、氛圍",
    emoji: "🪑",
    aspectRatio: 4 / 3,
    targetWidth: 1200,
    targetHeight: 900,
    required: false,
    promptRole: "Interior / atmosphere shot #1",
  },
  {
    id: "interior2",
    label: "店內環境 B",
    hint: "吧台、廚房、展示櫃等",
    emoji: "🪑",
    aspectRatio: 4 / 3,
    targetWidth: 1200,
    targetHeight: 900,
    required: false,
    promptRole: "Interior / atmosphere shot #2",
  },
  {
    id: "team",
    label: "老闆 / 團隊",
    hint: "老闆、員工、工作中的照片",
    emoji: "👨‍🍳",
    aspectRatio: 4 / 3,
    targetWidth: 1200,
    targetHeight: 900,
    required: false,
    promptRole: "Owner / team / staff working",
  },
  {
    id: "detail1",
    label: "細節特寫 A",
    hint: "材料、工序、設備等細節",
    emoji: "🔍",
    aspectRatio: 1 / 1,
    targetWidth: 1080,
    targetHeight: 1080,
    required: false,
    promptRole: "Close-up detail / craftsmanship shot #1",
  },
  {
    id: "detail2",
    label: "細節特寫 B",
    hint: "更多製作/服務過程特寫",
    emoji: "🔍",
    aspectRatio: 1 / 1,
    targetWidth: 1080,
    targetHeight: 1080,
    required: false,
    promptRole: "Close-up detail / craftsmanship shot #2",
  },
  {
    id: "extra",
    label: "其他照片",
    hint: "任何想放的補充素材",
    emoji: "📸",
    aspectRatio: 4 / 3,
    targetWidth: 1200,
    targetHeight: 900,
    required: false,
    promptRole: "Supplementary / miscellaneous",
  },
];

/** Number of slots that MUST be filled before form submission. */
export const MIN_REQUIRED_SLOTS = SLOTS.filter((s) => s.required).length;
/** Total available slots. */
export const MAX_SLOTS = SLOTS.length;

export function getSlot(id: SlotId): SlotDefinition {
  const s = SLOTS.find((x) => x.id === id);
  if (!s) throw new Error(`Unknown slot id: ${id}`);
  return s;
}

/**
 * CSS filter string applied to every `<img>` in the generated HTML so
 * that phone photos from different lighting conditions look like they
 * belong to the same brand. Values are conservative — enough to unify
 * colour temperature without looking Instagrammed.
 */
export const UNIFIED_CSS_FILTER =
  "saturate(1.08) contrast(1.04) brightness(1.02)";

/**
 * Small snippet of CSS to inject into the generated HTML <head>. It
 * targets any `<img>` that has the `data-5888-slot` attribute so the
 * AI can tag them and we apply a consistent look.
 */
export const UNIFIED_FILTER_CSS = `
<style id="5888-unified-filter">
  img[data-5888-slot] {
    filter: ${UNIFIED_CSS_FILTER};
  }
</style>
`.trim();
