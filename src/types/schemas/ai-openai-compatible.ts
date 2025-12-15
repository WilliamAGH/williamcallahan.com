import { z } from "zod/v4";

export const openAiCompatibleChatRoleSchema = z.enum(["system", "user", "assistant"]);

export const openAiCompatibleChatMessageSchema = z.object({
  role: openAiCompatibleChatRoleSchema,
  content: z.string().min(1),
});

export type OpenAiCompatibleChatMessage = z.infer<typeof openAiCompatibleChatMessageSchema>;

export const openAiCompatibleChatCompletionsRequestSchema = z.object({
  model: z.string().min(1),
  messages: z.array(openAiCompatibleChatMessageSchema).min(1),
  temperature: z.number().min(0).max(2).optional(),
});

export type OpenAiCompatibleChatCompletionsRequest = z.infer<typeof openAiCompatibleChatCompletionsRequestSchema>;

const openAiCompatibleChatCompletionsChoiceSchema = z.object({
  message: openAiCompatibleChatMessageSchema,
});

export const openAiCompatibleChatCompletionsResponseSchema = z.object({
  id: z.string().optional(),
  choices: z.array(openAiCompatibleChatCompletionsChoiceSchema).min(1),
});

export type OpenAiCompatibleChatCompletionsResponse = z.infer<typeof openAiCompatibleChatCompletionsResponseSchema>;
