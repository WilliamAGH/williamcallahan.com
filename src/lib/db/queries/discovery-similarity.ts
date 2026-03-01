import { sql } from "drizzle-orm";

import { db } from "@/lib/db/connection";

export async function findSimilarBookmarkIds(
  anchorId: string,
  excludeIds: ReadonlySet<string>,
  limit: number,
): Promise<string[]> {
  const rows = await db.execute<{ entity_id: string }>(sql`
    SELECT e2.entity_id
    FROM embeddings e1, embeddings e2
    WHERE e1.domain = 'bookmark' AND e1.entity_id = ${anchorId}
      AND e2.domain = 'bookmark'
      AND e2.entity_id != e1.entity_id
      AND e2.qwen_4b_fp16_embedding IS NOT NULL
    ORDER BY e2.qwen_4b_fp16_embedding <=> e1.qwen_4b_fp16_embedding
    LIMIT ${limit + excludeIds.size}
  `);

  return rows
    .map((row) => row.entity_id)
    .filter((bookmarkId) => !excludeIds.has(bookmarkId))
    .slice(0, limit);
}
