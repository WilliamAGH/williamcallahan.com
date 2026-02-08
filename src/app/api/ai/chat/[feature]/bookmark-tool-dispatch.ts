/**
 * Bookmark Tool Dispatch
 *
 * Executes bookmark search tool calls from upstream model responses,
 * handling both Chat Completions and Responses API formats. Provides
 * per-call error isolation so a single tool failure does not crash
 * the entire batch.
 *
 * @module api/ai/chat/bookmark-tool-dispatch
 */

import "server-only";

import logger from "@/lib/utils/logger";
import {
  searchBookmarksToolResultSchema,
  type SearchBookmarksToolResult,
} from "@/types/schemas/ai-chat";
import type { ExecutedToolCall, ToolDispatchResult } from "@/types/features/ai-chat";
import {
  openAiCompatibleResponsesFunctionCallSchema,
  type OpenAiCompatibleResponsesFunctionCall,
  type OpenAiCompatibleChatMessage,
} from "@/types/schemas/ai-openai-compatible";
import {
  SEARCH_BOOKMARKS_TOOL,
  SEARCH_BOOKMARKS_RESPONSE_TOOL,
  executeSearchBookmarksTool,
} from "./bookmark-tool";

/** Extract title+url pairs from a parsed tool result */
function extractResultLinks(
  parsed: SearchBookmarksToolResult,
): Array<{ title: string; url: string }> {
  return parsed.results.map((r) => ({ title: r.title, url: r.url }));
}

const EMPTY_TOOL_ERROR_RESULT: SearchBookmarksToolResult = {
  query: "",
  results: [],
  totalResults: 0,
};

async function executeToolCallBatch(
  calls: Array<{ callId: string; rawArguments: string }>,
): Promise<ExecutedToolCall[]> {
  const results: ExecutedToolCall[] = [];
  for (const call of calls) {
    try {
      const toolResult = await executeSearchBookmarksTool(call.rawArguments);
      const validated = searchBookmarksToolResultSchema.safeParse(toolResult);
      if (!validated.success) {
        logger.error("[AI Chat] Tool result failed schema validation", {
          callId: call.callId,
          error: validated.error.message,
        });
        results.push({
          callId: call.callId,
          failed: true,
          parsed: { ...EMPTY_TOOL_ERROR_RESULT, error: "Tool result validation failed" },
          links: [],
        });
        continue;
      }
      results.push({
        callId: call.callId,
        failed: false,
        parsed: validated.data,
        links: extractResultLinks(validated.data),
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      logger.error("[AI Chat] Tool execution failed", { callId: call.callId, error: detail });
      results.push({
        callId: call.callId,
        failed: true,
        parsed: { ...EMPTY_TOOL_ERROR_RESULT, error: `Tool execution error: ${detail}` },
        links: [],
      });
    }
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
  const failedCallIds: string[] = [];
  for (const result of batchResults) {
    if (result.failed) {
      failedCallIds.push(result.callId);
    } else {
      observedResults.push(...result.links);
    }
    responseMessages.push({
      role: "tool",
      tool_call_id: result.callId,
      content: JSON.stringify(result.parsed),
    });
  }

  if (failedCallIds.length > 0) {
    logger.error("[AI Chat] Tool call batch completed with failures", {
      failed: failedCallIds.length,
      total: validCalls.length,
      failedCallIds,
    });
  }

  return { responseMessages, observedResults, failedCallIds };
}

export function extractSearchBookmarkToolCalls(
  responseOutput: unknown[],
): OpenAiCompatibleResponsesFunctionCall[] {
  const toolCalls: OpenAiCompatibleResponsesFunctionCall[] = [];
  for (const item of responseOutput) {
    // Skip non-function-call items (text, reasoning, etc.) before schema parsing
    if (!item || typeof item !== "object" || !("type" in item) || item.type !== "function_call") {
      continue;
    }
    const parsed = openAiCompatibleResponsesFunctionCallSchema.safeParse(item);
    if (!parsed.success) {
      logger.warn("[AI Chat] Function call item failed schema validation", {
        error: parsed.error.message,
      });
      continue;
    }
    if (parsed.data.name !== SEARCH_BOOKMARKS_RESPONSE_TOOL.name) {
      logger.warn("[AI Chat] Ignoring unrecognized tool in response output", {
        toolName: parsed.data.name,
      });
      continue;
    }
    toolCalls.push(parsed.data);
  }
  return toolCalls;
}

export async function dispatchResponseToolCalls(
  toolCalls: OpenAiCompatibleResponsesFunctionCall[],
): Promise<{
  outputs: Array<{ type: "function_call_output"; call_id: string; output: string }>;
  observedResults: Array<{ title: string; url: string }>;
  failedCallIds: string[];
}> {
  const calls = toolCalls.map((tc) => ({ callId: tc.call_id, rawArguments: tc.arguments }));
  const batchResults = await executeToolCallBatch(calls);
  const failedCallIds = batchResults.filter((r) => r.failed).map((r) => r.callId);

  if (failedCallIds.length > 0) {
    logger.error("[AI Chat] Response tool call batch completed with failures", {
      failed: failedCallIds.length,
      total: calls.length,
      failedCallIds,
    });
  }

  return {
    outputs: batchResults.map((r) => ({
      type: "function_call_output" as const,
      call_id: r.callId,
      output: JSON.stringify(r.parsed),
    })),
    observedResults: batchResults.filter((r) => !r.failed).flatMap((r) => r.links),
    failedCallIds,
  };
}
