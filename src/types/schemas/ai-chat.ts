import { z } from "zod/v4";

export const requestBodySchema = z
  .object({
    userText: z.string().min(1).optional(),
    system: z.string().min(1).optional(),
    temperature: z.number().min(0).max(2).optional(),
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
  });

export type ParsedRequestBody = z.infer<typeof requestBodySchema>;
