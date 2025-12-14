import { z } from "zod";

/**
 * Pagination and query parameters for bookmark search API
 */
export const BookmarkSearchParamsSchema = z.object({
  q: z.string().min(1).max(100),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(24),
});

export type BookmarkSearchParams = z.infer<typeof BookmarkSearchParamsSchema>;
