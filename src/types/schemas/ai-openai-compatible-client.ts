import { z } from "zod/v4";

export const aiTokenResponseSchema = z.object({
  token: z.string().min(1),
  expiresAt: z.string().datetime(),
});

export type AiTokenResponse = z.infer<typeof aiTokenResponseSchema>;

export const aiChatResponseSchema = z.object({
  message: z.string(),
});

export type AiChatResponse = z.infer<typeof aiChatResponseSchema>;

export const aiChatQueuePositionSchema = z
  .object({
    position: z.number().int().nullable().optional(),
    running: z.number().int().nonnegative(),
    pending: z.number().int().nonnegative(),
    maxParallel: z.number().int().positive(),
    queueWaitMs: z.number().int().nonnegative().optional(),
  })
  .passthrough();

export type AiChatQueuePosition = z.infer<typeof aiChatQueuePositionSchema>;

export const aiChatStreamErrorSchema = z
  .object({
    error: z.string().min(1),
  })
  .passthrough();

export type AiChatStreamError = z.infer<typeof aiChatStreamErrorSchema>;

export const aiChatModelStreamStartSchema = z
  .object({
    id: z.string().min(1),
    model: z.string().min(1),
    apiMode: z.enum(["chat_completions", "responses"]),
  })
  .passthrough();

export type AiChatModelStreamStart = z.infer<typeof aiChatModelStreamStartSchema>;

export const aiChatModelStreamDeltaSchema = z
  .object({
    delta: z.string(),
  })
  .passthrough();

export type AiChatModelStreamDelta = z.infer<typeof aiChatModelStreamDeltaSchema>;

export const aiChatModelStreamDoneSchema = z
  .object({
    message: z.string(),
  })
  .passthrough();

export type AiChatModelStreamDone = z.infer<typeof aiChatModelStreamDoneSchema>;

export const aiChatQueueUpdateSchema = z.union([
  z.object({
    event: z.enum(["queued", "queue"]),
    position: z.number().int().nullable(),
    running: z.number().int().nonnegative(),
    pending: z.number().int().nonnegative(),
    maxParallel: z.number().int().positive(),
  }),
  z.object({
    event: z.literal("started"),
    running: z.number().int().nonnegative(),
    pending: z.number().int().nonnegative(),
    maxParallel: z.number().int().positive(),
    queueWaitMs: z.number().int().nonnegative(),
  }),
]);

export type AiChatQueueUpdate = z.infer<typeof aiChatQueueUpdateSchema>;

export const aiChatModelStreamUpdateSchema = z.union([
  z.object({
    event: z.literal("message_start"),
    data: aiChatModelStreamStartSchema,
  }),
  z.object({
    event: z.literal("message_delta"),
    data: aiChatModelStreamDeltaSchema,
  }),
  z.object({
    event: z.literal("message_done"),
    data: aiChatModelStreamDoneSchema,
  }),
]);

export type AiChatModelStreamUpdate = z.infer<typeof aiChatModelStreamUpdateSchema>;

/**
 * Schema for /api/ai/queue/[feature] response.
 * Lightweight validation for queue stats used in auto-trigger decisions.
 */
export const aiQueueStatsSchema = z.object({
  running: z.number().int().nonnegative(),
  pending: z.number().int().nonnegative(),
  maxParallel: z.number().int().positive(),
});

export type AiQueueStats = z.infer<typeof aiQueueStatsSchema>;
