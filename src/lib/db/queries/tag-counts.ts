/**
 * Tag counts per content type, aggregated in PostgreSQL.
 *
 * One GROUP BY over the stored tag/genre columns replaces loading every
 * bookmark, post, project, and book into memory to count tags per search.
 *
 * @module db/queries/tag-counts
 */

import { sql } from "drizzle-orm";
import { db } from "@/lib/db/connection";
import { TAG_URL, tagToSlug } from "@/lib/utils/tag-utils";
import type { AggregatedTag } from "@/types/schemas/search";

/** Every tag and book genre with its usage count, most used first. */
export async function listTagCounts(): Promise<AggregatedTag[]> {
  const rows = await db.execute<{
    name: string;
    content_type: AggregatedTag["contentType"];
    count: number;
  }>(sql`
    SELECT name, content_type, count(*)::int AS count
    FROM (
      SELECT lower(CASE WHEN jsonb_typeof(t) = 'string' THEN t #>> '{}' ELSE t ->> 'name' END) AS name,
             'bookmarks' AS content_type
      FROM bookmarks, jsonb_array_elements(tags) AS t
      WHERE jsonb_typeof(tags) = 'array'
      UNION ALL
      SELECT lower(t), 'blog' FROM blog_posts, jsonb_array_elements_text(tags) AS t
      WHERE draft = false AND jsonb_typeof(tags) = 'array'
      UNION ALL
      SELECT lower(t), 'projects' FROM projects, jsonb_array_elements_text(tags) AS t
      WHERE jsonb_typeof(tags) = 'array'
      UNION ALL
      SELECT lower(t), 'books' FROM books, jsonb_array_elements_text(genres) AS t
      WHERE jsonb_typeof(genres) = 'array'
    ) tagged
    WHERE name IS NOT NULL AND name <> ''
    GROUP BY name, content_type
    ORDER BY count DESC, name
  `);

  return rows.map((row) => {
    const slug = tagToSlug(row.name);
    return {
      name: row.name,
      slug,
      contentType: row.content_type,
      count: Number(row.count),
      url: TAG_URL[row.content_type](row.name),
    };
  });
}
