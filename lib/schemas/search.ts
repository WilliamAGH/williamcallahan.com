import { z } from "zod";

export const searchResultItemSchema = z.object({
  label: z.string(),
  description: z.string(),
  path: z.string(),
});

export const searchResultsSchema = z.array(searchResultItemSchema);
