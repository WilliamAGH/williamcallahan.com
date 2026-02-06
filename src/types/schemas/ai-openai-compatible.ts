import { z } from "zod/v4";

export const aiUpstreamApiModeSchema = z.enum(["chat_completions", "responses"]);
export type AiUpstreamApiMode = z.infer<typeof aiUpstreamApiModeSchema>;

const openAiCompatibleToolCallSchema = z.object({
  id: z.string().min(1),
  type: z.literal("function"),
  function: z.object({
    name: z.string().min(1),
    arguments: z.string().min(1),
  }),
});

const openAiCompatibleSystemOrUserMessageSchema = z.object({
  role: z.enum(["system", "user"]),
  content: z.string().min(1),
});

const openAiCompatibleRequestAssistantMessageSchema = z
  .object({
    role: z.literal("assistant"),
    content: z.string().optional(),
    tool_calls: z.array(openAiCompatibleToolCallSchema).optional(),
  })
  .refine((value) => typeof value.content === "string" || (value.tool_calls?.length ?? 0) > 0, {
    message: "Assistant message must include content or tool_calls",
  });

const openAiCompatibleResponseAssistantMessageSchema = z
  .object({
    role: z.literal("assistant"),
    content: z.string().nullable().optional(),
    tool_calls: z.array(openAiCompatibleToolCallSchema).optional(),
  })
  .refine((value) => typeof value.content === "string" || (value.tool_calls?.length ?? 0) > 0, {
    message: "Assistant message must include content or tool_calls",
  });

const openAiCompatibleToolMessageSchema = z.object({
  role: z.literal("tool"),
  content: z.string().min(1),
  tool_call_id: z.string().min(1),
});

export const openAiCompatibleChatRoleSchema = z.enum(["system", "user", "assistant", "tool"]);

export const openAiCompatibleChatMessageSchema = z.union([
  openAiCompatibleSystemOrUserMessageSchema,
  openAiCompatibleRequestAssistantMessageSchema,
  openAiCompatibleToolMessageSchema,
]);

export type OpenAiCompatibleChatMessage = z.infer<typeof openAiCompatibleChatMessageSchema>;

const openAiCompatibleFunctionToolSchema = z.object({
  type: z.literal("function"),
  function: z.object({
    name: z.string().min(1),
    description: z.string().optional(),
    parameters: z.record(z.string(), z.unknown()).optional(),
  }),
});

const openAiCompatibleToolChoiceSchema = z.union([
  z.enum(["none", "auto", "required"]),
  z.object({
    type: z.literal("function"),
    function: z.object({
      name: z.string().min(1),
    }),
  }),
]);

export const openAiCompatibleChatCompletionsRequestSchema = z.object({
  model: z.string().min(1),
  messages: z.array(openAiCompatibleChatMessageSchema).min(1),
  temperature: z.number().min(0).max(2).optional(),
  max_tokens: z.number().int().min(1).max(128000).optional(),
  tools: z.array(openAiCompatibleFunctionToolSchema).optional(),
  tool_choice: openAiCompatibleToolChoiceSchema.optional(),
});

export type OpenAiCompatibleChatCompletionsRequest = z.infer<
  typeof openAiCompatibleChatCompletionsRequestSchema
>;

const openAiCompatibleChatCompletionsChoiceSchema = z.object({
  message: openAiCompatibleResponseAssistantMessageSchema,
  finish_reason: z.string().optional(),
});

export const openAiCompatibleChatCompletionsResponseSchema = z.object({
  id: z.string().optional(),
  choices: z.array(openAiCompatibleChatCompletionsChoiceSchema).min(1),
});

export type OpenAiCompatibleChatCompletionsResponse = z.infer<
  typeof openAiCompatibleChatCompletionsResponseSchema
>;

const openAiCompatibleResponsesFunctionCallArgumentsSchema = z
  .union([z.string(), z.record(z.string(), z.unknown())])
  .transform((value) => (typeof value === "string" ? value : JSON.stringify(value)));

export const openAiCompatibleResponsesFunctionCallSchema = z.object({
  type: z.literal("function_call"),
  call_id: z.string().min(1),
  name: z.string().min(1),
  arguments: openAiCompatibleResponsesFunctionCallArgumentsSchema,
});

export type OpenAiCompatibleResponsesFunctionCall = z.infer<
  typeof openAiCompatibleResponsesFunctionCallSchema
>;

export const openAiCompatibleResponsesResponseSchema = z.object({
  id: z.string().min(1),
  output_text: z.string(),
  output: z.array(z.unknown()),
});

export type OpenAiCompatibleResponsesResponse = z.infer<
  typeof openAiCompatibleResponsesResponseSchema
>;
