import { z } from "zod/v4";

export const aiFeatureIdentifierSchema = z.enum([
  "terminal_chat",
  "bookmark-analysis",
  "book-analysis",
  "project-analysis",
]);

export type AiFeatureIdentifier = z.infer<typeof aiFeatureIdentifierSchema>;
