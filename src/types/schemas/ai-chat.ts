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

/** Generic tool call arguments — all search tools share this shape */
export const searchToolArgsSchema = z.object({
  query: z.string().min(1),
  maxResults: z.number().int().min(1).max(10).optional(),
});

export type SearchToolArgs = z.infer<typeof searchToolArgsSchema>;

/** Generic tool call result — all search tools return this shape */
export const searchToolResultSchema = z.object({
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

export type SearchToolResult = z.infer<typeof searchToolResultSchema>;

/** @deprecated Use searchToolArgsSchema — kept for backward compatibility */
export const searchBookmarksToolArgsSchema = searchToolArgsSchema;
/** @deprecated Use SearchToolArgs — kept for backward compatibility */
export type SearchBookmarksToolArgs = SearchToolArgs;
/** @deprecated Use searchToolResultSchema — kept for backward compatibility */
export const searchBookmarksToolResultSchema = searchToolResultSchema;
/** @deprecated Use SearchToolResult — kept for backward compatibility */
export type SearchBookmarksToolResult = SearchToolResult;

// ─────────────────────────────────────────────────────────────────────────────
// AI Gate Token (auth boundary validation)
// ─────────────────────────────────────────────────────────────────────────────

export const aiGateTokenPayloadV1Schema = z.object({
  v: z.literal(1),
  exp: z.number().int().positive(),
  n: z.string().min(1),
  ip: z.string().min(1),
  ua: z.string().min(1),
});

export type AiGateTokenPayloadV1 = z.infer<typeof aiGateTokenPayloadV1Schema>;
