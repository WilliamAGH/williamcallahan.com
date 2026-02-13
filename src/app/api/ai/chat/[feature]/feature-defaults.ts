import "server-only";

import type { ParsedRequestBody } from "@/types/schemas/ai-chat";
import type { FeatureModelDefaults, ResolvedModelParams } from "@/types/features/ai-chat";

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

Available search tools:
- "search_bookmarks" — saved bookmark entries
- "search_blog" — blog articles and posts
- "search_tags" — tags and topics across all content
- "search_investments" — investment portfolio (startups, ventures)
- "search_projects" — software projects and applications
- "search_experience" — work experience and career history
- "search_education" — education, degrees, certifications
- "search_books" — books and reading list
- "search_analysis" — AI-generated analysis and insights
- "search_thoughts" — personal thoughts and notes

Tool-call procedure:
1. Identify the content type the user is asking about
2. Call the matching tool with {"query": "...", "maxResults": 5}
3. Read tool results and answer from those results only
4. Format results as clickable links: "- [Title](/path/slug)"
5. Use only URLs returned by the tool — never invent URLs
6. If no relevant result exists, say none were found and suggest a refined query
- Never claim "I can search" or "searching now" — actually call the tool
- If the question spans multiple content types, call multiple tools`,
};

/** Per-feature overrides — omitted fields inherit from GLOBAL_DEFAULTS.
 *  terminal_chat deviates from the global temperature (1.0) because:
 *  - temperature 0.7: reduces sampling entropy for tool-calling turns where
 *    the model must emit structured JSON arguments reliably; full 1.0 causes
 *    occasional malformed tool-call payloads.
 *  - reasoningEffort "low": terminal responses should be fast and concise;
 *    extended chain-of-thought adds latency without improving short answers. */
const FEATURE_DEFAULTS: Record<string, FeatureModelDefaults> = {
  terminal_chat: {
    temperature: 0.7,
    reasoningEffort: "low",
    toolConfig: { enabled: true },
  },
  // Analysis features require strict, schema-conformant JSON. Lower entropy improves
  // response-format adherence and reduces malformed payload retries.
  "bookmark-analysis": { temperature: 0.2, reasoningEffort: "low" },
  "book-analysis": { temperature: 0.2, reasoningEffort: "low" },
  "project-analysis": { temperature: 0.2, reasoningEffort: "low" },
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
  temperature: 1,
  topP: 1,
  reasoningEffort: "medium",
  maxTokens: 8192,
  toolConfig: { enabled: false },
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

export function resolveToolConfig(feature: string): { enabled: boolean } {
  return FEATURE_DEFAULTS[feature]?.toolConfig ?? GLOBAL_DEFAULTS.toolConfig;
}

export function resolveToolChoice(params: {
  hasToolSupport: boolean;
  forcedToolName: string | undefined;
  turn: number;
  model: string;
}): "required" | "auto" | undefined {
  if (!params.hasToolSupport) return undefined;
  if (params.forcedToolName && params.turn === 0) {
    // llama.cpp ignores/mishandles tool_choice:"required" for Harmony-format
    // models (gpt-oss). Downgrade to "auto" and rely on deterministic fallback.
    return isHarmonyFormatModel(params.model) ? "auto" : "required";
  }
  return "auto";
}

/** Models trained on the OpenAI Harmony response format use internal control tokens
 *  that conflict with llama.cpp grammar-based structured output (json_schema).
 *  See: https://github.com/lmstudio-ai/lmstudio-bug-tracker/issues/1105
 *       https://github.com/ggml-org/llama.cpp/discussions/15341 */
const HARMONY_MODEL_PATTERNS = ["gpt-oss"] as const;

/** Returns true when the model uses the Harmony response format and therefore
 *  cannot reliably use `response_format: { type: "json_schema" }` via llama.cpp. */
export function isHarmonyFormatModel(model: string): boolean {
  const lower = model.toLowerCase();
  return HARMONY_MODEL_PATTERNS.some((pattern) => lower.includes(pattern));
}
