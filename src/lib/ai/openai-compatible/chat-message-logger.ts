/**
 * AI Chat Message Logger
 *
 * Logs every chat message processed through the central chat/completions endpoint.
 * Captures source, user identification, metrics, and message content for analytics.
 *
 * @module lib/ai/openai-compatible/chat-message-logger
 */

import "server-only";

import logger from "@/lib/utils/logger";
import type {
  AiChatMessageLog,
  AiChatSource,
  AiChatBookmarkContext,
  LogChatMessageParams,
} from "@/types/schemas/ai-chat-message-log";

/**
 * Categorizes the feature string into a known source type
 */
function categorizeSource(feature: string): AiChatSource {
  switch (feature) {
    case "terminal_chat":
      return "terminal_chat";
    case "bookmark-analysis":
      return "bookmark-analysis";
    case "book-analysis":
      return "book-analysis";
    case "project-analysis":
      return "project-analysis";
    default:
      return "unknown";
  }
}

/**
 * Extracts the last user message from an array of messages
 */
function extractLastUserMessage(
  messages: Array<{ role: string; content: string }>,
): string | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg?.role === "user") {
      return msg.content;
    }
  }
  return undefined;
}

/**
 * Calculates total character count of input messages
 */
function calculateInputCharCount(messages: Array<{ role: string; content: string }>): number {
  return messages.reduce((sum, msg) => sum + (msg.content?.length ?? 0), 0);
}

/**
 * Truncates user agent for privacy (keeps first 200 chars)
 */
function truncateUserAgent(userAgent: string): string {
  const maxLength = 200;
  if (userAgent.length <= maxLength) return userAgent;
  return `${userAgent.slice(0, maxLength)}...`;
}

/**
 * Extracts bookmark context from system prompt if present
 * Looks for URL patterns in the system message for bookmark-analysis requests
 */
function extractBookmarkContext(
  messages: Array<{ role: string; content: string }>,
  source: AiChatSource,
): AiChatBookmarkContext {
  if (source !== "bookmark-analysis") return undefined;

  const systemMessage = messages.find((m) => m.role === "system");
  if (!systemMessage?.content) return undefined;

  // Try to extract URL from system prompt
  const urlMatch = systemMessage.content.match(/https?:\/\/[^\s"'<>]+/);
  const url = urlMatch?.[0];

  // Try to extract title (often appears after "Title:" or similar patterns)
  const titleMatch = systemMessage.content.match(/(?:title|name|page):\s*["']?([^"'\n]+)["']?/i);
  const title = titleMatch?.[1]?.trim();

  if (!url && !title) return undefined;

  return {
    bookmarkUrl: url,
    bookmarkTitle: title,
  };
}

/**
 * Logs a chat message interaction with full context and metrics.
 * Generates a unique messageId and timestamp for each log entry.
 */
export function logChatMessage(params: LogChatMessageParams): AiChatMessageLog {
  const source = categorizeSource(params.feature);
  const userMessage = extractLastUserMessage(params.messages);
  const inputCharCount = calculateInputCharCount(params.messages);
  const outputCharCount = params.assistantMessage?.length ?? 0;

  const logEntry: AiChatMessageLog = {
    messageId: crypto.randomUUID(),
    conversationId: params.conversationId,
    timestamp: new Date().toISOString(),
    source,
    clientIp: params.clientIp,
    userAgent: params.userAgent ? truncateUserAgent(params.userAgent) : undefined,
    originHost: params.originHost,
    pagePath: params.pagePath,
    userMessage,
    assistantMessage: params.assistantMessage,
    metrics: {
      durationMs: params.metrics.durationMs,
      queueWaitMs: params.metrics.queueWaitMs,
      inputMessageCount: params.messages.length,
      inputCharCount,
      outputCharCount,
      model: params.metrics.model,
      statusCode: params.metrics.statusCode,
      priority: params.metrics.priority,
    },
    bookmarkContext: extractBookmarkContext(params.messages, source),
    success: params.success,
    errorMessage: params.errorMessage,
  };

  // Structured log output
  const logLine = formatLogLine(logEntry);
  if (params.success) {
    logger.info(logLine);
  } else {
    logger.error(logLine);
  }

  // Also log the full structured entry for machine parsing (debug level)
  logger.debug("[AI Chat Log] Structured entry:", JSON.stringify(logEntry));

  return logEntry;
}

/**
 * Formats a log entry into a human-readable log line
 */
function formatLogLine(entry: AiChatMessageLog): string {
  const parts = [
    `[AI Chat Message]`,
    `msgId=${entry.messageId}`,
    `source=${entry.source}`,
    `ip=${entry.clientIp}`,
    `status=${entry.metrics.statusCode}`,
    `model=${entry.metrics.model}`,
    `durationMs=${entry.metrics.durationMs}`,
    `queueMs=${entry.metrics.queueWaitMs}`,
    `inputMsgs=${entry.metrics.inputMessageCount}`,
    `inputChars=${entry.metrics.inputCharCount}`,
    `outputChars=${entry.metrics.outputCharCount}`,
    `priority=${entry.metrics.priority}`,
  ];

  if (entry.conversationId) {
    parts.push(`convId=${entry.conversationId}`);
  }

  if (entry.originHost) {
    parts.push(`origin=${entry.originHost}`);
  }

  if (entry.pagePath) {
    parts.push(`page=${entry.pagePath}`);
  }

  if (entry.bookmarkContext?.bookmarkUrl) {
    parts.push(`bookmarkUrl=${entry.bookmarkContext.bookmarkUrl}`);
  }

  if (!entry.success && entry.errorMessage) {
    parts.push(`error="${entry.errorMessage}"`);
  }

  return parts.join(" ");
}
