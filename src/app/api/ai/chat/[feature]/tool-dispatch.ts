/**
 * Generic Tool Dispatch
 *
 * Executes tool calls from upstream model responses by looking up the
 * registered searcher function for each tool name. Handles both Chat
 * Completions and Responses API formats. Per-call error isolation
 * ensures a single tool failure does not crash the batch.
 *
 * @module api/ai/chat/tool-dispatch
 */

import "server-only";

import logger from "@/lib/utils/logger";
import { searchToolArgsSchema, searchToolResultSchema } from "@/types/schemas/ai-chat";
import type { ExecutedToolCall, ToolDispatchResult } from "@/types/features/ai-chat";
import {
  openAiCompatibleResponsesFunctionCallSchema,
  type OpenAiCompatibleResponsesFunctionCall,
  type OpenAiCompatibleChatMessage,
} from "@/types/schemas/ai-openai-compatible";
import { getToolByName } from "./tool-registry";
import { normalizeInternalPath } from "./bookmark-tool";

/** Cap per-query results to keep tool responses concise for the LLM context window */
const TOOL_MAX_RESULTS_DEFAULT = 5;
/** Schema cap for maxResults — models frequently overshoot; clamp instead of rejecting */
const TOOL_MAX_RESULTS_CAP = 10;
/** Maximum characters to include in log preview of raw arguments */
const LOG_PREVIEW_MAX_LENGTH = 200;

/** Parse raw JSON, clamp maxResults, and validate against the tool args schema */
function parseAndValidateToolArgs(
  toolName: string,
  rawArguments: string,
): { query: string; maxResults?: number } | { error: string } {
  let parsedRawArguments: unknown;
  try {
    parsedRawArguments = JSON.parse(rawArguments);
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : String(error);
    logger.warn("[AI Chat] Failed to parse tool call arguments as JSON", {
      tool: toolName,
      rawArguments: rawArguments.slice(0, LOG_PREVIEW_MAX_LENGTH),
      error: detail,
    });
    return { error: `Malformed JSON: ${detail}` };
  }

  if (
    parsedRawArguments &&
    typeof parsedRawArguments === "object" &&
    "maxResults" in parsedRawArguments
  ) {
    const raw = (parsedRawArguments as Record<string, unknown>).maxResults;
    if (typeof raw === "number" && raw > TOOL_MAX_RESULTS_CAP) {
      logger.warn("[AI Chat] Clamped maxResults from model overshoot", {
        tool: toolName,
        requested: raw,
        clamped: TOOL_MAX_RESULTS_CAP,
      });
      (parsedRawArguments as Record<string, unknown>).maxResults = TOOL_MAX_RESULTS_CAP;
    }
  }

  const parsedArgs = searchToolArgsSchema.safeParse(parsedRawArguments);
  if (!parsedArgs.success) {
    logger.warn("[AI Chat] Tool call arguments failed schema validation", {
      tool: toolName,
      rawArguments: rawArguments.slice(0, LOG_PREVIEW_MAX_LENGTH),
      error: parsedArgs.error.message,
    });
    return { error: `Invalid args: ${parsedArgs.error.message}` };
  }

  return parsedArgs.data;
}

/** Execute a single tool call by looking up its searcher in the registry */
async function executeSingleToolCall(
  toolName: string,
  rawArguments: string,
): Promise<{
  query: string;
  results: Array<{ title: string; url: string; description?: string }>;
  totalResults: number;
  error?: string;
}> {
  const registration = getToolByName(toolName);
  if (!registration) {
    return { query: "", results: [], totalResults: 0, error: `Unknown tool "${toolName}"` };
  }

  const parsed = parseAndValidateToolArgs(toolName, rawArguments);
  if ("error" in parsed) {
    return { query: "", results: [], totalResults: 0, error: parsed.error };
  }

  const { query, maxResults } = parsed;
  const rawResults = await registration.searcher(query);
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

  const limit = typeof maxResults === "number" ? maxResults : TOOL_MAX_RESULTS_DEFAULT;
  const limitedResults = normalizedResults.slice(0, limit);

  return { query, results: limitedResults, totalResults: normalizedResults.length };
}

async function executeToolCallBatch(
  calls: Array<{ callId: string; toolName: string; rawArguments: string }>,
): Promise<ExecutedToolCall[]> {
  const results: ExecutedToolCall[] = [];
  for (const call of calls) {
    try {
      const toolResult = await executeSingleToolCall(call.toolName, call.rawArguments);
      const validated = searchToolResultSchema.safeParse(toolResult);
      if (!validated.success) {
        logger.error("[AI Chat] Tool result failed schema validation", {
          callId: call.callId,
          tool: call.toolName,
          error: validated.error.message,
        });
        results.push({
          callId: call.callId,
          toolName: call.toolName,
          failed: true,
          parsed: {
            query: "",
            results: [],
            totalResults: 0,
            error: "Tool result validation failed",
          },
          links: [],
        });
        continue;
      }
      results.push({
        callId: call.callId,
        toolName: call.toolName,
        failed: false,
        parsed: validated.data,
        links: validated.data.results.map((r) => ({ title: r.title, url: r.url })),
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      logger.error("[AI Chat] Tool execution failed", {
        callId: call.callId,
        tool: call.toolName,
        error: detail,
      });
      results.push({
        callId: call.callId,
        toolName: call.toolName,
        failed: true,
        parsed: { query: "", results: [], totalResults: 0, error: `Execution error: ${detail}` },
        links: [],
      });
    }
  }
  return results;
}

/** Validate tool calls, separating valid calls from error responses for unknown/malformed calls */
function validateChatCompletionsToolCalls(
  toolCalls: Array<{ id: string; function: { name: string; arguments?: string } }>,
): {
  validCalls: Array<{ callId: string; toolName: string; rawArguments: string }>;
  errorMessages: OpenAiCompatibleChatMessage[];
} {
  const validCalls: Array<{ callId: string; toolName: string; rawArguments: string }> = [];
  const errorMessages: OpenAiCompatibleChatMessage[] = [];
  for (const toolCall of toolCalls) {
    if (!getToolByName(toolCall.function.name)) {
      logger.warn("[AI Chat] Received call for unknown tool", {
        toolName: toolCall.function.name,
        toolCallId: toolCall.id,
      });
      errorMessages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: JSON.stringify({ error: `Unknown tool "${toolCall.function.name}"` }),
      });
      continue;
    }
    if (!toolCall.function.arguments) {
      logger.warn("[AI Chat] Tool call received without arguments", { toolCallId: toolCall.id });
      errorMessages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: JSON.stringify({ error: "Tool call missing arguments" }),
      });
      continue;
    }
    validCalls.push({
      callId: toolCall.id,
      toolName: toolCall.function.name,
      rawArguments: toolCall.function.arguments,
    });
  }
  return { validCalls, errorMessages };
}

/** Dispatch Chat Completions tool calls by looking up each tool name in the registry */
export async function dispatchToolCallsByName(
  toolCalls: Array<{ id: string; function: { name: string; arguments?: string } }>,
): Promise<ToolDispatchResult> {
  const { validCalls, errorMessages } = validateChatCompletionsToolCalls(toolCalls);
  const responseMessages: OpenAiCompatibleChatMessage[] = [...errorMessages];
  const observedResults: Array<{ title: string; url: string }> = [];

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

/** Extract function_call items from Responses API output (any registered tool) */
export function extractToolCallsFromResponseOutput(
  responseOutput: unknown[],
): OpenAiCompatibleResponsesFunctionCall[] {
  const toolCalls: OpenAiCompatibleResponsesFunctionCall[] = [];
  for (const item of responseOutput) {
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
    if (!getToolByName(parsed.data.name)) {
      logger.warn("[AI Chat] Ignoring unrecognized tool in response output", {
        toolName: parsed.data.name,
      });
      continue;
    }
    toolCalls.push(parsed.data);
  }
  return toolCalls;
}

/** Dispatch Responses API tool calls by looking up each tool name in the registry */
export async function dispatchResponseToolCallsByName(
  toolCalls: OpenAiCompatibleResponsesFunctionCall[],
): Promise<{
  outputs: Array<{ type: "function_call_output"; call_id: string; output: string }>;
  observedResults: Array<{ title: string; url: string }>;
  failedCallIds: string[];
}> {
  const calls = toolCalls.map((tc) => ({
    callId: tc.call_id,
    toolName: tc.name,
    rawArguments: tc.arguments,
  }));
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
