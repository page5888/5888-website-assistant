/**
 * Text editing helpers for paid sites.
 *
 * The AI prompt instructs Claude to tag every user-editable text element
 * with `data-5888-text="<key>"` attributes. This module parses those
 * attributes out of the stored HTML so the edit page can show a form,
 * and rewrites them back when the user saves.
 *
 * We intentionally do NOT use cheerio / jsdom to keep the dependency
 * footprint small. Regex-based extraction works because the AI always
 * emits valid HTML (verified across 50+ generations) and we only care
 * about elements whose *entire* text content is editable — we never
 * need to walk into nested markup.
 *
 * ## Rules enforced at rewrite time
 *
 *  1. The attribute value (key) must match `[a-z0-9._-]+` — we reject
 *     anything with HTML-special characters so there's no injection
 *     surface when building the replacement tag.
 *  2. Only the innerText is replaced. The opening tag (with all its
 *     other attributes, classes, inline styles, data-5888-slot images
 *     etc.) is preserved verbatim.
 *  3. The new value is HTML-escaped (< > & " ') so the user can paste
 *     raw text without breaking the page.
 *  4. Empty strings are allowed (lets the user delete a subtitle) but
 *     keys not present in the incoming map are left untouched.
 */

export interface TextSlot {
  /** The `data-5888-text` attribute value — e.g. "hero.title" */
  key: string;
  /** The tag name, lowercased — e.g. "h1", "p" */
  tag: string;
  /** Current inner text, already HTML-decoded for display. */
  value: string;
}

/**
 * Matches an opening tag that contains a `data-5888-text="..."` attribute,
 * and captures:
 *   [1] tag name
 *   [2] the key
 *   [3] the inner HTML between opening and closing tag
 *
 * Uses a reluctant `[\s\S]*?` body so it correctly matches the nearest
 * closing tag of the same name. Limits the tag name to word chars to
 * avoid matching malformed tags.
 *
 * Caveat: this pattern does NOT handle nested same-name tags
 * (e.g. a `<p>` inside another `<p>`), because the spec disallows them
 * and the AI never produces them. If we ever need to, switch to a
 * proper parser.
 */
const SLOT_RE =
  /<(h[1-6]|p|span|blockquote|q|dt|dd|figcaption|time|li|strong|em)\b([^>]*?)\bdata-5888-text="([a-z0-9._-]+)"([^>]*?)>([\s\S]*?)<\/\1>/gi;

/**
 * Extract all editable text slots from a stored HTML body in document
 * order. Returns one entry per `data-5888-text` attribute found.
 *
 * If the same key appears multiple times (which violates our prompt
 * rule), we only keep the first occurrence — the rewrite pass will
 * still update every copy, so the user's edit propagates, but we don't
 * want to show duplicate form fields.
 */
export function extractTextSlots(html: string): TextSlot[] {
  const seen = new Set<string>();
  const slots: TextSlot[] = [];
  let m: RegExpExecArray | null;
  // Reset lastIndex because SLOT_RE is a /g regex reused across calls.
  SLOT_RE.lastIndex = 0;
  while ((m = SLOT_RE.exec(html)) !== null) {
    const tag = m[1].toLowerCase();
    const key = m[3];
    const inner = m[5];
    if (seen.has(key)) continue;
    seen.add(key);
    slots.push({ key, tag, value: htmlToText(inner) });
  }
  return slots;
}

/**
 * Returns true iff the HTML contains at least one `data-5888-text`
 * attribute. Used to block the edit UI on old sites generated before
 * this feature shipped (they won't have any tags).
 */
export function hasTextSlots(html: string): boolean {
  return /data-5888-text="[a-z0-9._-]+"/i.test(html);
}

/**
 * Apply a map of `{key: newText}` edits to the HTML, returning the
 * rewritten document. Keys that are not present in the HTML are
 * silently ignored (lets callers POST a partial form).
 *
 * The new text is HTML-escaped so users can paste raw content like
 * "我們的 <地獄級> 豆子" without breaking anything.
 */
export function applyTextEdits(
  html: string,
  edits: Record<string, string>,
): string {
  if (Object.keys(edits).length === 0) return html;
  SLOT_RE.lastIndex = 0;
  return html.replace(
    SLOT_RE,
    (match, tag: string, attrsBefore: string, key: string, attrsAfter: string, _inner: string) => {
      if (!Object.prototype.hasOwnProperty.call(edits, key)) return match;
      const replacement = escapeHtml(edits[key] ?? "");
      return `<${tag}${attrsBefore} data-5888-text="${key}"${attrsAfter}>${replacement}</${tag}>`;
    },
  );
}

/**
 * Convert a snippet of inner HTML to plain text for display in a
 * textarea. We:
 *   - Collapse any child tags (like <br>, <em>) into spaces or newlines
 *   - Decode common entities (&amp; &lt; &gt; &quot; &#39; &nbsp;)
 *   - Trim surrounding whitespace
 *
 * This is lossy — the user edits plain text and the tag is replaced
 * with the new plain text. Any inline markup inside the original
 * element (bold spans etc.) will be lost on save. That's an acceptable
 * trade-off for v1 since the AI usually doesn't put inline markup
 * inside tagged elements.
 */
export function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .trim();
}

/**
 * Escape user-supplied text before injecting it back into HTML. Also
 * converts newlines to `<br>` so multi-line textarea input looks right
 * in the rendered page.
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/\r?\n/g, "<br>");
}

/**
 * Friendly Traditional Chinese label for a slot key. The keys follow
 * a dotted convention (hero.title, section.about.title, service.1.desc,
 * faq.2.q, contact.phone, etc.), so we can produce a decent label
 * without the AI having to emit one. Falls back to the raw key.
 */
export function labelForKey(key: string): string {
  const parts = key.split(".");
  const head = parts[0];
  const tail = parts[parts.length - 1];

  // Section-style keys: section.about.title / section.services.lead
  if (head === "section" && parts.length >= 3) {
    const name = parts[1];
    const role = parts[2];
    return `${titleForSection(name)} · ${titleForRole(role)}`;
  }

  switch (head) {
    case "hero":
      return `封面 · ${titleForRole(tail)}`;
    case "about":
      return `品牌故事 · ${titleForRole(parts[1] ?? tail, parts.length > 2 ? parts[2] : undefined)}`;
    case "service":
      return `商品 ${parts[1] ?? ""} · ${titleForRole(tail)}`;
    case "faq":
      return `FAQ ${parts[1] ?? ""} · ${tail === "q" ? "問題" : "回答"}`;
    case "contact":
      return `聯絡資訊 · ${titleForRole(tail)}`;
    default:
      return key;
  }
}

function titleForSection(name: string): string {
  const map: Record<string, string> = {
    about: "關於我們",
    services: "商品 / 服務",
    products: "商品 / 服務",
    story: "品牌故事",
    faq: "常見問題",
    contact: "聯絡資訊",
    gallery: "作品集",
    menu: "菜單",
    team: "團隊",
  };
  return map[name] ?? name;
}

function titleForRole(role: string, sub?: string): string {
  const map: Record<string, string> = {
    title: "標題",
    subtitle: "副標",
    lead: "導言",
    desc: "描述",
    body: "內文",
    meta: "Meta 資訊",
    address: "地址",
    phone: "電話",
    hours: "營業時間",
    q: "問題",
    a: "回答",
  };
  const base = map[role] ?? role;
  return sub ? `${base} ${sub}` : base;
}
