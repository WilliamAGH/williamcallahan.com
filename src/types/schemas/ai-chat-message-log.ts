/**
 * AI Chat Message Log Schema
 *
 * Defines the structure for logging every chat message processed
 * through the central chat/completions endpoint.
 *
 * @module types/schemas/ai-chat-message-log
 */

import { z } from "zod/v4";

/**
 * Source categories for chat messages
 */
export const aiChatSourceSchema = z.enum(["terminal_chat", "bookmark-analysis", "unknown"]);

export type AiChatSource = z.infer<typeof aiChatSourceSchema>;

/**
 * Individual message role
 */
export const aiChatMessageRoleSchema = z.enum(["system", "user", "assistant"]);

/**
 * Metrics captured for each chat interaction
 */
export const aiChatMetricsSchema = z.object({
  /** Total request duration in milliseconds */
  durationMs: z.number().int().nonnegative(),
  /** Time spent waiting in the request queue */
  queueWaitMs: z.number().int().nonnegative(),
  /** Number of messages in the request (input context) */
  inputMessageCount: z.number().int().nonnegative(),
  /** Approximate character count of input */
  inputCharCount: z.number().int().nonnegative(),
  /** Approximate character count of response */
  outputCharCount: z.number().int().nonnegative(),
  /** Model used for completion */
  model: z.string(),
  /** HTTP status code of response */
  statusCode: z.number().int(),
  /** Request priority (-100 to 100) */
  priority: z.number().int(),
});

export type AiChatMetrics = z.infer<typeof aiChatMetricsSchema>;

/**
 * Bookmark-specific context when source is bookmark-analysis
 */
export const aiChatBookmarkContextSchema = z
  .object({
    /** The bookmark URL being analyzed */
    bookmarkUrl: z.string().url().optional(),
    /** The bookmark title if available */
    bookmarkTitle: z.string().optional(),
  })
  .optional();

export type AiChatBookmarkContext = z.infer<typeof aiChatBookmarkContextSchema>;

/**
 * Complete log entry for a chat message interaction
 */
export const aiChatMessageLogSchema = z.object({
  /** Unique identifier for this specific log entry */
  messageId: z.string().uuid(),

  /** Conversation identifier grouping related messages */
  conversationId: z.string().uuid().optional(),

  /** ISO 8601 timestamp when the message was processed */
  timestamp: z.string().datetime(),

  /** Source/feature that initiated the chat request */
  source: aiChatSourceSchema,

  /** Client IP address */
  clientIp: z.string(),

  /** User agent string (may be truncated for privacy) */
  userAgent: z.string().optional(),

  /** Origin hostname of the request */
  originHost: z.string().optional(),

  /** Page path the user was on when making the request */
  pagePath: z.string().optional(),

  /** The user's input message (last user message in the array) */
  userMessage: z.string().optional(),

  /** The assistant's response message */
  assistantMessage: z.string().optional(),

  /** Performance and usage metrics */
  metrics: aiChatMetricsSchema,

  /** Bookmark-specific context (when source is bookmark-analysis) */
  bookmarkContext: aiChatBookmarkContextSchema,

  /** Whether the request completed successfully */
  success: z.boolean(),

  /** Error message if the request failed */
  errorMessage: z.string().optional(),
});

export type AiChatMessageLog = z.infer<typeof aiChatMessageLogSchema>;

/**
 * Input for creating a chat message log entry
 * (messageId and timestamp are auto-generated)
 */
export const aiChatMessageLogInputSchema = aiChatMessageLogSchema.omit({
  messageId: true,
  timestamp: true,
});

export type AiChatMessageLogInput = z.infer<typeof aiChatMessageLogInputSchema>;

/**
 * Schema for metrics passed to the logger function
 * (subset of full metrics - some are computed during logging)
 */
export const logChatMessageMetricsSchema = z.object({
  durationMs: z.number().int().nonnegative(),
  queueWaitMs: z.number().int().nonnegative(),
  model: z.string(),
  statusCode: z.number().int(),
  priority: z.number().int(),
});

/**
 * Schema for chat message in the logger input
 */
export const logChatMessageInputMessageSchema = z.object({
  role: z.string(),
  content: z.string(),
});

/**
 * Input parameters for the logChatMessage function
 */
export const logChatMessageParamsSchema = z.object({
  feature: z.string(),
  conversationId: z.string().uuid().optional(),
  clientIp: z.string(),
  userAgent: z.string().optional(),
  originHost: z.string().optional(),
  pagePath: z.string().optional(),
  messages: z.array(logChatMessageInputMessageSchema),
  assistantMessage: z.string().optional(),
  metrics: logChatMessageMetricsSchema,
  success: z.boolean(),
  errorMessage: z.string().optional(),
});

export type LogChatMessageParams = z.infer<typeof logChatMessageParamsSchema>;
