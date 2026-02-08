import { z } from "zod/v4";

/**
 * Zod Schema for Terminal Search API Validation
 * Terminal search returns SelectionItem format, not the general SearchResult format
 */
export const terminalSearchResultSchema = z.object({
  id: z.string().min(1),
  label: z.string(),
  description: z.string(),
  path: z.string(),
});

/** Schema for parsing potentially incomplete data from APIs */
const partialTerminalSearchResultSchema = z.object({
  id: z.string().optional(),
  label: z.string().optional(),
  description: z.string().optional(),
  path: z.string().optional(),
});

export const terminalSearchApiResponseSchema = z.union([
  z.array(partialTerminalSearchResultSchema),
  z.object({ results: z.array(partialTerminalSearchResultSchema) }),
]);
