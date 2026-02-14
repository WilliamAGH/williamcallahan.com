/**
 * Bookmark Tool Helpers
 *
 * Bookmark-specific helpers for link formatting, URL sanitization,
 * and query extraction. Tool schemas and execution logic live in
 * tool-registry.ts and tool-dispatch.ts.
 *
 * @module api/ai/chat/bookmark-tool
 */

import "server-only";

/** Cap per-query results to keep tool responses concise for the LLM context window */
const TOOL_MAX_RESULTS_DEFAULT = 5;

const MARKDOWN_LINK_PATTERN = /\[([^\]\n]+)\]\(([^)\n]+)\)/g;

/**
 * Reject protocol-relative and external URLs; accept only internal paths.
 *
 * @param url - Raw URL string from a search result or model-authored link
 * @returns The trimmed path if it starts with a single `/`, or `null` for
 *          external URLs, protocol-relative URLs (`//`), and empty strings
 */
export function normalizeInternalPath(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return null;
  return trimmed;
}

/**
 * Format pre-normalized tool results as clickable markdown links.
 * Deduplicates by URL. Works for any tool's results, not just bookmarks.
 */
export function formatBookmarkResultsAsLinks(
  results: Array<{ title: string; url: string }>,
): string {
  const seen = new Set<string>();
  const uniqueResults: Array<{ title: string; url: string }> = [];
  for (const result of results) {
    if (seen.has(result.url)) continue;
    seen.add(result.url);
    uniqueResults.push(result);
  }

  if (uniqueResults.length === 0) {
    return "I could not find a matching result in the current search index. Try adding more specific keywords.";
  }

  const topResults = uniqueResults.slice(0, TOOL_MAX_RESULTS_DEFAULT);
  const lines = ["Here are the best matches I found:"];
  for (const result of topResults) {
    lines.push(`- [${result.title}](${result.url})`);
  }
  return lines.join("\n");
}

/**
 * Sanitize assistant-authored markdown links against deterministic tool-observed URLs.
 * Any non-allowlisted link is replaced with plain text and flagged for caller fallback.
 */
export function sanitizeBookmarkLinksAgainstAllowlist(params: {
  text: string;
  observedResults: Array<{ title: string; url: string }>;
}): { sanitizedText: string; hadDisallowedLink: boolean; allowedLinkCount: number } {
  const allowedUrls = new Set<string>();
  for (const result of params.observedResults) {
    allowedUrls.add(result.url);
  }

  let hadDisallowedLink = false;
  let allowedLinkCount = 0;
  const sanitizedText = params.text.replaceAll(
    MARKDOWN_LINK_PATTERN,
    (_match: string, title: string, rawUrl: string) => {
      const normalizedUrl = normalizeInternalPath(rawUrl);
      if (normalizedUrl && allowedUrls.has(normalizedUrl)) {
        allowedLinkCount += 1;
        return `[${title}](${normalizedUrl})`;
      }
      hadDisallowedLink = true;
      return `${title} (link removed)`;
    },
  );

  return { sanitizedText, hadDisallowedLink, allowedLinkCount };
}

/** Scope nouns across all content types, stripped during query extraction */
const SCOPE_NOUN_PATTERN_STR =
  "bookmarks?|links?|resources?|blog|articles?|posts?|tags?|topics?|investments?|portfolio|projects?|experience|jobs?|education|degrees?|books?|reading|analysis|summaries|thoughts?";

/** Strip common question phrasing and content-scope nouns to isolate the search topic. */
export function extractSearchQueryFromMessage(message: string): string {
  const scopeNounGlobal = new RegExp(`\\b(?:${SCOPE_NOUN_PATTERN_STR})\\b\\s*`, "gi");
  const text = message
    .replace(/^(?:hello|hi|hey|greetings)[!,.]?\s*/i, "")
    .replaceAll(/\b(?:do\s+you\s+have|that)\b\s*/gi, "")
    .replace(/\b(?:search|find|show)\s*/i, "")
    .replace(/\b(?:for|about|on|contain(?:ing)?|with|matching|regarding)\s*/i, "")
    .replaceAll(scopeNounGlobal, "")
    .replaceAll(/\b(?:any|some|the|my|your|all|me|what)\s+/gi, "")
    .replace(/\?+$/, "")
    .replaceAll(/\s{2,}/g, " ")
    .trim();
  return text.length > 0 ? text : message;
}
