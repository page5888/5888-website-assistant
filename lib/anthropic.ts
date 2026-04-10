import Anthropic from "@anthropic-ai/sdk";
import { DESIGN_SYSTEM_PROMPT, buildUserPrompt, type BuildPromptInput } from "./prompts";

export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export type ClaudeModelChoice = "sonnet" | "opus";

/**
 * Model IDs with safe fallbacks.
 *
 * Anthropic's model IDs can change over time. We keep a PRIMARY id we'd
 * like to use and a list of FALLBACKS we'll try if the primary returns
 * a 404/424 "model not found". Aliases (without date suffixes) are
 * preferred because they always resolve to the latest minor version.
 *
 * Safe choices as of 2025-2026:
 *   - claude-sonnet-4-5  / claude-sonnet-4-5-20250929
 *   - claude-opus-4-1    / claude-opus-4-1-20250805
 *   - claude-3-5-sonnet-latest (legacy safety net)
 */
const MODEL_CHAINS: Record<ClaudeModelChoice, string[]> = {
  sonnet: [
    "claude-sonnet-4-5",
    "claude-sonnet-4-5-20250929",
    "claude-sonnet-4-20250514",
    "claude-3-5-sonnet-latest",
  ],
  opus: [
    "claude-opus-4-1",
    "claude-opus-4-1-20250805",
    "claude-opus-4-20250514",
    "claude-3-opus-latest",
  ],
};

export interface GenerateOptions extends BuildPromptInput {
  model: ClaudeModelChoice;
}

/**
 * Escape HTML special chars so a user-supplied store name can't break out of
 * the footer we inject. Small, no-dependency implementation.
 */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Non-streaming generation — returns the full HTML string once done.
 *
 * Implements a small fallback loop: if Claude returns a 404 or 424
 * "model not found / could not serve request", we try the next model
 * in the chain. Other errors (credit, auth, prompt error) fail fast.
 */
export async function generateSiteHtml(opts: GenerateOptions): Promise<string> {
  const chain = MODEL_CHAINS[opts.model] ?? MODEL_CHAINS.sonnet;

  let lastError: unknown;
  for (const modelId of chain) {
    try {
      const response = await anthropic.messages.create({
        model: modelId,
        max_tokens: 8192,
        system: DESIGN_SYSTEM_PROMPT,
        messages: [{ role: "user", content: buildUserPrompt(opts) }],
      });

      // Extract text from the response blocks
      const textBlock = response.content.find((b) => b.type === "text");
      if (!textBlock || textBlock.type !== "text") {
        throw new Error("Claude did not return any text content");
      }

      let html = textBlock.text.trim();

      // Strip accidental markdown code fences
      html = html.replace(/^```(?:html)?\s*\n?/i, "").replace(/\n?```\s*$/i, "");

      // Sanity check for DOCTYPE — this is non-recoverable, Claude must output real HTML
      if (!/^<!doctype html/i.test(html)) {
        throw new Error("Generated HTML does not start with <!DOCTYPE html>");
      }

      // Auto-repair: if Claude forgot the mandatory footer, inject it ourselves
      // rather than failing the whole generation. Throwing here used to force
      // the user to retry from scratch (and burn their free-tier quota for
      // nothing). See: 2026-04-10 "missing the mandatory footer" incident.
      if (!html.includes("花蓮瓊瑤打字行")) {
        console.warn(
          `[anthropic] model=${modelId} omitted the mandatory footer — auto-injecting`,
        );
        const injectedFooter = `<footer style="padding:2rem 1rem;text-align:center;font-size:0.875rem;color:var(--muted,#6b7280);border-top:1px solid var(--border,#e5e7eb);margin-top:3rem;">${escapeHtml(opts.storeName)} ｜ 2026 Design by 花蓮瓊瑤打字行</footer>`;

        if (/<\/body>/i.test(html)) {
          html = html.replace(/<\/body>/i, `${injectedFooter}</body>`);
        } else if (/<\/html>/i.test(html)) {
          html = html.replace(/<\/html>/i, `${injectedFooter}</html>`);
        } else {
          html = html + injectedFooter;
        }
      }

      console.log(`[anthropic] generated with model=${modelId}`);
      return html;
    } catch (err: unknown) {
      lastError = err;

      // Only fall through on "model not available" style errors.
      const status =
        typeof err === "object" && err !== null && "status" in err
          ? (err as { status?: number }).status
          : undefined;
      const message =
        err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();

      const shouldTryNext =
        status === 404 ||
        status === 424 ||
        message.includes("not_found_error") ||
        message.includes("could not serve") ||
        message.includes("model") && message.includes("not");

      if (!shouldTryNext) {
        // Non-recoverable error (auth, credit, prompt) — bail out immediately
        throw err;
      }

      console.warn(
        `[anthropic] model=${modelId} failed (${status}), trying next in chain…`,
      );
    }
  }

  // If we got here, every fallback failed
  throw lastError ?? new Error("All Claude models in the fallback chain failed");
}
