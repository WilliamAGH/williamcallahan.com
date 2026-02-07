/**
 * Bookmark Search Tool for AI Chat
 *
 * Handles the "search_bookmarks" tool call lifecycle: argument parsing,
 * executing the bookmark search, formatting results as markdown links,
 * and providing a deterministic fallback when the model skips the tool.
 *
 * @module api/ai/chat/bookmark-tool
 */

import "server-only";

import type { FunctionTool } from "openai/resources/responses/responses";
import { searchBookmarks } from "@/lib/search/searchers/dynamic-searchers";
import logger from "@/lib/utils/logger";
import {
  searchBookmarksToolArgsSchema,
  searchBookmarksToolResultSchema,
  type SearchBookmarksToolResult,
} from "@/types/schemas/ai-chat";
import type { ExecutedToolCall, ToolDispatchResult } from "@/types/features/ai-chat";
import {
  openAiCompatibleResponsesFunctionCallSchema,
  type OpenAiCompatibleResponsesFunctionCall,
  type OpenAiCompatibleChatMessage,
} from "@/types/schemas/ai-openai-compatible";

/** Cap per-query results to keep tool responses concise for the LLM context window */
const TOOL_MAX_RESULTS_DEFAULT = 5;

/** Matches explicit user intent to search (e.g. "search bookmarks", "find links") */
const EXPLICIT_SEARCH_REQUEST_PATTERN = /\b(search|find|look\s+for|look\s+up|show)\b/i;

const BOOKMARK_NOUN_PATTERN = /\b(?:bookmarks?|links?|resources?|saved)\b/i;
const TOPIC_CONNECTOR_PATTERN =
  /\b(?:about|for|on|related|regarding|specifically?|contain(?:ing)?|with|matching|have)\b/i;
const TOPIC_CONNECTOR_MAX_DISTANCE = 40;
const MARKDOWN_LINK_PATTERN = /\[([^\]\n]+)\]\(([^)\n]+)\)/g;

export const SEARCH_BOOKMARKS_TOOL = {
  type: "function" as const,
  function: {
    name: "search_bookmarks",
    description: "Searches saved bookmark entries by natural-language query",
    strict: true,
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The user search query",
        },
        maxResults: {
          type: "number",
          description: "Maximum number of matches to return (default: 5)",
        },
      },
      required: ["query", "maxResults"],
      additionalProperties: false,
    },
  },
};

export const SEARCH_BOOKMARKS_RESPONSE_TOOL: FunctionTool = {
  type: "function",
  name: "search_bookmarks",
  description: "Searches saved bookmark entries by natural-language query",
  strict: true,
  parameters: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "The user search query",
      },
      maxResults: {
        type: "number",
        description: "Maximum number of matches to return (default: 5)",
      },
    },
    required: ["query", "maxResults"],
    additionalProperties: false,
  },
};

/** Reject protocol-relative and external URLs; accept only internal paths */
function normalizeInternalPath(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return null;
  return trimmed;
}

/**
 * Test whether the user message matches bookmark search intent patterns.
 * The caller is responsible for gating on feature support.
 */
export function matchesBookmarkSearchPattern(latestUserMessage: string | undefined): boolean {
  if (typeof latestUserMessage !== "string") return false;
  if (EXPLICIT_SEARCH_REQUEST_PATTERN.test(latestUserMessage)) return true;
  const nounMatch = BOOKMARK_NOUN_PATTERN.exec(latestUserMessage);
  if (!nounMatch) return false;
  const afterNoun = latestUserMessage.slice(
    nounMatch.index + nounMatch[0].length,
    nounMatch.index + nounMatch[0].length + TOPIC_CONNECTOR_MAX_DISTANCE,
  );
  return TOPIC_CONNECTOR_PATTERN.test(afterNoun);
}

export async function executeSearchBookmarksTool(
  rawArguments: string,
): Promise<SearchBookmarksToolResult> {
  let parsedRawArguments: unknown;
  try {
    parsedRawArguments = JSON.parse(rawArguments);
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : String(error);
    logger.warn("[AI Chat] Failed to parse tool call arguments as JSON", {
      rawArguments: rawArguments.slice(0, 200),
      error: detail,
    });
    return {
      query: "",
      results: [],
      totalResults: 0,
      error: `Malformed JSON in tool arguments: ${detail}`,
    };
  }

  const parsedJsonResult = searchBookmarksToolArgsSchema.safeParse(parsedRawArguments);
  if (!parsedJsonResult.success) {
    logger.warn("[AI Chat] Tool call arguments failed schema validation", {
      rawArguments: rawArguments.slice(0, 200),
      error: parsedJsonResult.error.message,
    });
    return {
      query: "",
      results: [],
      totalResults: 0,
      error: `Invalid tool arguments: ${parsedJsonResult.error.message}`,
    };
  }

  const args = parsedJsonResult.data;
  const rawResults = await searchBookmarks(args.query);
  const normalizedResults = rawResults
    .map((result) => {
      const normalizedUrl = normalizeInternalPath(result.url);
      if (!normalizedUrl) return null;
      return {
        title: result.title,
        url: normalizedUrl,
        ...(typeof result.description === "string" && result.description.length > 0
          ? { description: result.description }
          : {}),
      };
    })
    .filter((result): result is NonNullable<typeof result> => result !== null);

  const limitedResults = normalizedResults.slice(0, args.maxResults ?? TOOL_MAX_RESULTS_DEFAULT);

  return {
    query: args.query,
    results: limitedResults,
    totalResults: normalizedResults.length,
  };
}

/** Extract title+url pairs from a parsed tool result, dropping the optional description field */
function extractResultLinks(
  parsed: SearchBookmarksToolResult,
): Array<{ title: string; url: string }> {
  return parsed.results.map((r) => ({ title: r.title, url: r.url }));
}

/**
 * Format pre-normalized bookmark results as clickable markdown links.
 * URLs are already validated by executeSearchBookmarksTool; this deduplicates by URL.
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

export async function runDeterministicBookmarkFallback(
  feature: string,
  latestUserMessage: string,
): Promise<string> {
  const searchQuery = extractSearchQueryFromMessage(latestUserMessage);
  logger.warn("[AI Chat] Using deterministic bookmark fallback", { feature, searchQuery });
  const result = await executeSearchBookmarksTool(
    JSON.stringify({ query: searchQuery, maxResults: TOOL_MAX_RESULTS_DEFAULT }),
  );
  return formatBookmarkResultsAsLinks(
    extractResultLinks(searchBookmarksToolResultSchema.parse(result)),
  );
}

async function executeToolCallBatch(
  calls: Array<{ callId: string; rawArguments: string }>,
): Promise<ExecutedToolCall[]> {
  const results: ExecutedToolCall[] = [];
  for (const call of calls) {
    const toolResult = await executeSearchBookmarksTool(call.rawArguments);
    const parsed = searchBookmarksToolResultSchema.parse(toolResult);
    results.push({ callId: call.callId, parsed, links: extractResultLinks(parsed) });
  }
  return results;
}

/** Execute all tool calls in one assistant turn and return the results without mutation */
export async function dispatchToolCalls(
  toolCalls: Array<{ id: string; function: { name: string; arguments?: string } }>,
): Promise<ToolDispatchResult> {
  const responseMessages: OpenAiCompatibleChatMessage[] = [];
  const observedResults: Array<{ title: string; url: string }> = [];

  const validCalls: Array<{ callId: string; rawArguments: string }> = [];
  for (const toolCall of toolCalls) {
    if (toolCall.function.name !== SEARCH_BOOKMARKS_TOOL.function.name) {
      logger.warn("[AI Chat] Received call for unknown tool", {
        toolName: toolCall.function.name,
        toolCallId: toolCall.id,
      });
      responseMessages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: JSON.stringify({ error: `Unknown tool "${toolCall.function.name}"` }),
      });
      continue;
    }
    if (!toolCall.function.arguments) {
      logger.warn("[AI Chat] Tool call received without arguments", { toolCallId: toolCall.id });
      responseMessages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: JSON.stringify({ error: "Tool call missing arguments" }),
      });
      continue;
    }
    validCalls.push({ callId: toolCall.id, rawArguments: toolCall.function.arguments });
  }

  const batchResults = await executeToolCallBatch(validCalls);
  for (const result of batchResults) {
    observedResults.push(...result.links);
    responseMessages.push({
      role: "tool",
      tool_call_id: result.callId,
      content: JSON.stringify(result.parsed),
    });
  }

  return { responseMessages, observedResults };
}

export function extractSearchBookmarkToolCalls(
  responseOutput: unknown[],
): OpenAiCompatibleResponsesFunctionCall[] {
  const toolCalls: OpenAiCompatibleResponsesFunctionCall[] = [];
  for (const item of responseOutput) {
    const parsed = openAiCompatibleResponsesFunctionCallSchema.safeParse(item);
    if (!parsed.success || parsed.data.name !== SEARCH_BOOKMARKS_RESPONSE_TOOL.name) continue;
    toolCalls.push(parsed.data);
  }
  return toolCalls;
}

export async function dispatchResponseToolCalls(
  toolCalls: OpenAiCompatibleResponsesFunctionCall[],
): Promise<{
  outputs: Array<{ type: "function_call_output"; call_id: string; output: string }>;
  observedResults: Array<{ title: string; url: string }>;
}> {
  const calls = toolCalls.map((tc) => ({ callId: tc.call_id, rawArguments: tc.arguments }));
  const batchResults = await executeToolCallBatch(calls);
  return {
    outputs: batchResults.map((r) => ({
      type: "function_call_output" as const,
      call_id: r.callId,
      output: JSON.stringify(r.parsed),
    })),
    observedResults: batchResults.flatMap((r) => r.links),
  };
}
