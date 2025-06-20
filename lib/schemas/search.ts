import { z } from "zod";

export const searchResultItemSchema = z.object({
  id: z.string(),
  type: z.enum(["bookmark", "blog-post", "project", "page"]),
  title: z.string(),
  description: z.string().optional(),
  url: z.string(),
  score: z.number(),
  highlights: z.array(z.string()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const searchResultsSchema = z.array(searchResultItemSchema);
