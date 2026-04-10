import Anthropic from "@anthropic-ai/sdk";
import { DESIGN_SYSTEM_PROMPT, buildUserPrompt, type BuildPromptInput } from "./prompts";

export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export type ClaudeModelChoice = "sonnet" | "opus";

const MODEL_IDS: Record<ClaudeModelChoice, string> = {
  sonnet: "claude-sonnet-4-6",
  opus: "claude-opus-4-6",
};

export interface GenerateOptions extends BuildPromptInput {
  model: ClaudeModelChoice;
}

/**
 * Non-streaming generation — returns the full HTML string once done.
 * We use non-streaming for simplicity in the MVP; the generate route
 * can still be async and return a session id to poll.
 */
export async function generateSiteHtml(opts: GenerateOptions): Promise<string> {
  const modelId = MODEL_IDS[opts.model] ?? MODEL_IDS.sonnet;

  const response = await anthropic.messages.create({
    model: modelId,
    max_tokens: 16000,
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

  // Ensure mandatory footer is present
  if (!html.includes("花蓮瓊瑤打字行")) {
    throw new Error("Generated HTML is missing the mandatory footer");
  }

  // Sanity check for DOCTYPE
  if (!/^<!doctype html/i.test(html)) {
    throw new Error("Generated HTML does not start with <!DOCTYPE html>");
  }

  return html;
}
