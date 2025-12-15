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
    running: z.number().int(),
    pending: z.number().int(),
    maxParallel: z.number().int(),
    queueWaitMs: z.number().int().optional(),
  })
  .passthrough();

export type AiChatQueuePosition = z.infer<typeof aiChatQueuePositionSchema>;

export const aiChatStreamErrorSchema = z
  .object({
    error: z.string().min(1),
  })
  .passthrough();

export type AiChatStreamError = z.infer<typeof aiChatStreamErrorSchema>;

export const aiChatQueueUpdateSchema = z.union([
  z.object({
    event: z.enum(["queued", "queue"]),
    position: z.number().int().nullable(),
    running: z.number().int(),
    pending: z.number().int(),
    maxParallel: z.number().int(),
  }),
  z.object({
    event: z.literal("started"),
    running: z.number().int(),
    pending: z.number().int(),
    maxParallel: z.number().int(),
    queueWaitMs: z.number().int(),
  }),
]);

export type AiChatQueueUpdate = z.infer<typeof aiChatQueueUpdateSchema>;
