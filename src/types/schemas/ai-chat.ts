import { z } from "zod/v4";
import {
  aiUpstreamApiModeSchema,
  openAiCompatibleResponseFormatSchema,
  reasoningEffortSchema,
} from "@/types/schemas/ai-openai-compatible";

export const aiFeatureIdentifierSchema = z
  .string()
  .min(1)
  .max(50)
  .regex(/^[a-z0-9_-]+$/);

export const requestBodySchema = z
  .object({
    userText: z.string().min(1).optional(),
    system: z.string().min(1).optional(),
    temperature: z.number().min(0).max(2).optional(),
    top_p: z.number().min(0).max(1).optional(),
    reasoning_effort: reasoningEffortSchema.nullable().optional(),
    response_format: openAiCompatibleResponseFormatSchema.optional(),
    apiMode: aiUpstreamApiModeSchema.optional(),
    conversationId: z.string().uuid().optional(),
    priority: z.number().int().min(-100).max(100).optional(),
    messages: z
      .array(
        z.object({
          role: z.enum(["system", "user", "assistant"]),
          content: z.string().min(1),
        }),
      )
      .min(1)
      .optional(),
  })
  .refine((value) => Boolean(value.messages) || Boolean(value.userText), {
    message: "Provide either messages or userText",
  })
  .refine((value) => value.apiMode !== "responses" || value.response_format === undefined, {
    message: "response_format is only supported in chat_completions mode",
    path: ["response_format"],
  });

export type ParsedRequestBody = z.infer<typeof requestBodySchema>;

export const searchBookmarksToolArgsSchema = z.object({
  query: z.string().min(1),
  maxResults: z.number().int().min(1).max(10).optional(),
});

export type SearchBookmarksToolArgs = z.infer<typeof searchBookmarksToolArgsSchema>;

export const searchBookmarksToolResultSchema = z.object({
  query: z.string(),
  results: z.array(
    z.object({
      title: z.string(),
      url: z.string(),
      description: z.string().optional(),
    }),
  ),
  totalResults: z.number().int().min(0),
  error: z.string().optional(),
});

export type SearchBookmarksToolResult = z.infer<typeof searchBookmarksToolResultSchema>;
