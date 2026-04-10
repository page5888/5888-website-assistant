/**
 * Free-tier watermark injection.
 *
 * Injects a fixed badge at the bottom-right of the generated HTML so that
 * free users see "Powered by 5888 網站助手(免費版)" on their preview.
 * Paid users' HTML is returned untouched.
 *
 * We inject right before </body> so the badge sits above all page content
 * via position:fixed. Uses scoped CSS class to avoid clashing with the
 * Claude-generated styles.
 */

const WATERMARK_HTML = `
<!-- 5888-watermark-start -->
<style id="x5888-wm-style">
  .x5888-watermark {
    position: fixed;
    right: 16px;
    bottom: 16px;
    z-index: 2147483647;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 10px 16px;
    background: rgba(17, 17, 17, 0.88);
    color: #ffffff;
    font-family: system-ui, -apple-system, "Noto Sans TC", "Microsoft JhengHei", sans-serif;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.02em;
    border-radius: 999px;
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
    text-decoration: none;
    pointer-events: auto;
    user-select: none;
  }
  .x5888-watermark::before {
    content: "";
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: linear-gradient(135deg, #a855f7, #06b6d4);
  }
  .x5888-watermark:hover {
    background: rgba(17, 17, 17, 0.95);
  }
  @media print {
    .x5888-watermark { display: none !important; }
  }
</style>
<a class="x5888-watermark"
   href="https://5888-website-assistant.vercel.app/?utm_source=watermark"
   target="_blank"
   rel="noopener noreferrer"
   aria-label="Powered by 5888 網站助手 — 免費版">
  Powered by 5888 網站助手・免費版
</a>
<!-- 5888-watermark-end -->
`.trim();

/**
 * Inject the free-tier watermark into a full HTML document.
 * If `</body>` cannot be found, append at end as fallback.
 */
export function injectWatermark(html: string): string {
  // Skip if already injected (idempotent)
  if (html.includes("5888-watermark-start")) return html;

  const bodyCloseRegex = /<\/body>/i;
  if (bodyCloseRegex.test(html)) {
    return html.replace(bodyCloseRegex, `${WATERMARK_HTML}\n</body>`);
  }
  return html + "\n" + WATERMARK_HTML;
}

/**
 * Strip the watermark from an HTML document (used when user upgrades
 * from free to paid and we re-serve the HTML without the badge).
 */
export function stripWatermark(html: string): string {
  return html.replace(
    /\n?<!-- 5888-watermark-start -->[\s\S]*?<!-- 5888-watermark-end -->\n?/g,
    "",
  );
}
