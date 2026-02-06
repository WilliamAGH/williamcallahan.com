import "server-only";

import type { ParsedRequestBody } from "@/types/schemas/ai-chat";
import type { FeatureModelDefaults, ResolvedModelParams } from "@/types/features/ai-chat";

export type { FeatureModelDefaults, ResolvedModelParams };

const FEATURE_SYSTEM_PROMPTS: Record<string, string> = {
  terminal_chat: `You are a helpful assistant in a terminal interface on williamcallahan.com, the personal website of William Callahan (software engineer, investor, entrepreneur).

Response style:
- Keep responses short and conversational (2-4 sentences typical, expand only when necessary)
- Use plain text only - no markdown, no HTML, no formatting symbols like ** or #, except for search result link lines
- For lists, use simple dashes: "- item one" on new lines
- Be friendly but concise - this is a terminal, not a document
- When asked about William (William Callahan) or the site, share relevant context naturally
- Use the INVENTORY CATALOG section to answer list questions; do not invent items not in the catalog
- If asked for "all" items, respond in pages of ~25 lines and ask if they want the next page
- When SEARCH RESULTS FOR YOUR QUERY is present, treat it as preloaded context from the server
- For bookmark search requests, call the "search_bookmarks" tool before answering
- Never claim "I can search" or "searching now" after a user asks to search; actually call the tool
- Tool-call procedure: (1) call "search_bookmarks" with {"query": "...", "maxResults": 5}, (2) read tool results, (3) answer from those results only
- After tool results arrive, answer with clickable markdown lines in this exact format: "- [Title](/bookmarks/slug)"
- Use only URLs returned by the tool
- If no relevant result exists, clearly say none were found and suggest a refined query`,
};

/** Per-feature overrides — omitted fields inherit from GLOBAL_DEFAULTS.
 *  terminal_chat deviates from the global temperature (1.0) because:
 *  - temperature 0.7: reduces sampling entropy for tool-calling turns where
 *    the model must emit structured JSON arguments reliably; full 1.0 causes
 *    occasional malformed tool-call payloads.
 *  - reasoningEffort "low": terminal responses should be fast and concise;
 *    extended chain-of-thought adds latency without improving short answers. */
const FEATURE_DEFAULTS: Record<string, FeatureModelDefaults> = {
  terminal_chat: { temperature: 0.7, reasoningEffort: "low" },
};

/** Baseline values applied when neither the request body nor FEATURE_DEFAULTS
 *  provides a value. Tuned for gpt-oss-120b, a reasoning MoE model whose
 *  official recommendation is temperature=1.0, top_p=1.0 (see HuggingFace
 *  openai/gpt-oss-120b discussions #21).
 *  - temperature 1.0 / topP 1.0: full sampling as recommended for reasoning
 *  - reasoningEffort "medium": balanced reasoning depth for general queries
 *  - maxTokens 8192: generous reply budget; maps to max_completion_tokens
 *    (Chat Completions) or max_output_tokens (Responses API) */
const GLOBAL_DEFAULTS: Required<FeatureModelDefaults> = {
  temperature: 1.0,
  topP: 1.0,
  reasoningEffort: "medium",
  maxTokens: 8192,
};

export function resolveFeatureSystemPrompt(
  feature: string,
  augmentedPrompt: string | undefined,
): string | undefined {
  const base: string | undefined = FEATURE_SYSTEM_PROMPTS[feature];
  if (base && augmentedPrompt) return `${base}\n\n${augmentedPrompt}`;
  return base ?? augmentedPrompt;
}

export function resolveModelParams(
  feature: string,
  parsedBody: ParsedRequestBody,
): ResolvedModelParams {
  const featureDefaults = FEATURE_DEFAULTS[feature];
  return {
    temperature:
      parsedBody.temperature ?? featureDefaults?.temperature ?? GLOBAL_DEFAULTS.temperature,
    topP: parsedBody.top_p ?? featureDefaults?.topP ?? GLOBAL_DEFAULTS.topP,
    reasoningEffort:
      parsedBody.reasoning_effort ??
      featureDefaults?.reasoningEffort ??
      GLOBAL_DEFAULTS.reasoningEffort,
    maxTokens: featureDefaults?.maxTokens ?? GLOBAL_DEFAULTS.maxTokens,
  };
}
