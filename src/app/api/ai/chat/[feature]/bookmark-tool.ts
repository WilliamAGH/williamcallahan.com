/**
 * Bookmark Tool Helpers
 *
 * Bookmark-specific helpers for link formatting, URL sanitization,
 * search pattern matching, and query extraction. Tool schemas and
 * execution logic live in tool-registry.ts and tool-dispatch.ts.
 *
 * @module api/ai/chat/bookmark-tool
 */

import "server-only";

/** Cap per-query results to keep tool responses concise for the LLM context window */
const TOOL_MAX_RESULTS_DEFAULT = 5;

/** Matches explicit user intent to search (e.g. "search bookmarks", "find links") */
const EXPLICIT_SEARCH_REQUEST_PATTERN = /\b(search|find|look\s+for|look\s+up|show)\b/i;

const BOOKMARK_NOUN_PATTERN = /\b(?:bookmarks?|links?|resources?|saved)\b/i;
const TOPIC_CONNECTOR_PATTERN =
  /\b(?:about|for|on|related|regarding|specifically?|contain(?:ing)?|with|matching|have)\b/i;
const TOPIC_CONNECTOR_MAX_DISTANCE = 40;
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
 * Test whether the user message matches bookmark search intent patterns.
 * Requires a bookmark-related noun to be present — a bare search verb
 * ("show me X", "find Y") is not sufficient to force a bookmark tool call.
 * The caller is responsible for gating on feature support.
 */
export function matchesBookmarkSearchPattern(latestUserMessage: string | undefined): boolean {
  if (typeof latestUserMessage !== "string") return false;
  const hasBookmarkNoun = BOOKMARK_NOUN_PATTERN.test(latestUserMessage);
  if (hasBookmarkNoun && EXPLICIT_SEARCH_REQUEST_PATTERN.test(latestUserMessage)) return true;
  const nounMatch = BOOKMARK_NOUN_PATTERN.exec(latestUserMessage);
  if (!nounMatch) return false;
  const afterNoun = latestUserMessage.slice(
    nounMatch.index + nounMatch[0].length,
    nounMatch.index + nounMatch[0].length + TOPIC_CONNECTOR_MAX_DISTANCE,
  );
  return TOPIC_CONNECTOR_PATTERN.test(afterNoun);
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

/** Strip common question phrasing to isolate the search topic from a user message. */
export function extractSearchQueryFromMessage(message: string): string {
  const text = message
    .replace(/^(?:hello|hi|hey|greetings)[!,.]?\s*/i, "")
    .replace(/\bwhat\s+(?:bookmarks?|links?|resources?)\b\s*/i, "")
    .replaceAll(/\b(?:do\s+you\s+have|that)\b\s*/gi, "")
    .replace(/\b(?:for|about|on|contain(?:ing)?|with|matching|regarding)\s*/i, "")
    .replace(/\b(?:search|find|show)\s+(?:bookmarks?|links?)?\s*/i, "")
    .replaceAll(/\b(?:any|some|the|my|all|me)\s+/gi, "")
    .replace(/\?+$/, "")
    .trim();
  return text.length > 0 ? text : message;
}
