/**
 * Context Formatter for RAG
 *
 * Formats static and dynamic context for system prompt injection.
 * Handles token budget management and truncation.
 *
 * @module lib/ai/rag/context-formatter
 */

import { formatStaticContext, type StaticContext } from "./static-context";

export interface DynamicResult {
  scope: string;
  title: string;
  description: string;
  url: string;
  score: number;
}

export interface FormattedContext {
  text: string;
  tokenEstimate: number;
}

/**
 * Rough token estimation ratio for English text.
 * OpenAI's tokenizer averages ~4 characters per token for English.
 * Source: OpenAI Tokenizer documentation and empirical testing.
 * This is a conservative estimate; actual ratios vary by content type
 * (code tends to be ~3 chars/token, prose ~4-5 chars/token).
 */
const CHARS_PER_TOKEN = 4;

function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * Formats dynamic search results as a string section.
 */
function formatDynamicResults(results: DynamicResult[]): string {
  if (results.length === 0) return "";

  const lines: string[] = ["", "=== SEARCH RESULTS FOR YOUR QUERY ===", ""];

  for (const result of results) {
    const scopeLabel = result.scope.charAt(0).toUpperCase() + result.scope.slice(1);
    lines.push(`[${scopeLabel}] "${result.title}"`);
    lines.push(result.description);
    lines.push(`URL: ${result.url}`);
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Truncates text to fit within a token budget.
 * Removes dynamic results first, then truncates static if still over budget.
 */
function truncateToTokenBudget(
  staticText: string,
  dynamicText: string,
  maxTokens: number,
): { text: string; tokenEstimate: number } {
  const staticTokens = estimateTokens(staticText);
  const dynamicTokens = estimateTokens(dynamicText);
  const totalTokens = staticTokens + dynamicTokens;

  // If within budget, return full context
  if (totalTokens <= maxTokens) {
    return {
      text: staticText + dynamicText,
      tokenEstimate: totalTokens,
    };
  }

  // If static alone exceeds budget, truncate static
  if (staticTokens > maxTokens) {
    const maxChars = maxTokens * CHARS_PER_TOKEN;
    const truncatedStatic = staticText.slice(0, maxChars) + "\n[Context truncated]";
    return {
      text: truncatedStatic,
      tokenEstimate: maxTokens,
    };
  }

  // Static fits, truncate dynamic to fill remaining budget
  const remainingTokens = maxTokens - staticTokens;
  const maxDynamicChars = remainingTokens * CHARS_PER_TOKEN;
  const truncatedDynamic = dynamicText.slice(0, maxDynamicChars);

  return {
    text: staticText + truncatedDynamic,
    tokenEstimate: staticTokens + estimateTokens(truncatedDynamic),
  };
}

export interface FormatContextOptions {
  maxTokens?: number;
}

/**
 * Formats combined static and dynamic context for system prompt injection.
 *
 * @param staticCtx - Pre-computed static context about the site/person
 * @param dynamicResults - Search results relevant to the user's query
 * @param options - Optional formatting options including token budget
 * @returns Formatted context text and token estimate
 */
export function formatContext(
  staticCtx: StaticContext,
  dynamicResults: DynamicResult[],
  options?: FormatContextOptions,
): FormattedContext {
  const maxTokens = options?.maxTokens ?? 2000;

  const staticText = formatStaticContext(staticCtx);
  const dynamicText = formatDynamicResults(dynamicResults);

  return truncateToTokenBudget(staticText, dynamicText, maxTokens);
}
