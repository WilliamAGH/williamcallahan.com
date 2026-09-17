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
import { tagToSlug } from "@/lib/utils/tag-utils";
import type { AggregatedTag } from "@/types/schemas/search";

const TAG_URL: Record<AggregatedTag["contentType"], (slug: string) => string> = {
  blog: (slug) => `/blog/tags/${slug}`,
  bookmarks: (slug) => `/bookmarks/tags/${slug}`,
  projects: (slug) => `/projects?tag=${slug}`,
  books: (slug) => `/books?genre=${slug}`,
};

/**
 * ponytail: seed-blog-posts/seed-projects wrote tags as a JSON *string* holding
 * an array (`"[\"a\"]"`), so decode that shape as well as a real array.
 * Drop this once the seeds store arrays and the rows are re-seeded.
 */
const JSON_ARRAY = (column: string) =>
  sql.raw(
    `CASE WHEN jsonb_typeof(${column}) = 'string' THEN (${column} #>> '{}')::jsonb ELSE ${column} END`,
  );

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
      SELECT lower(t), 'blog' FROM blog_posts, jsonb_array_elements_text(${JSON_ARRAY("tags")}) AS t
      WHERE draft = false AND tags IS NOT NULL
      UNION ALL
      SELECT lower(t), 'projects' FROM projects, jsonb_array_elements_text(${JSON_ARRAY("tags")}) AS t
      WHERE tags IS NOT NULL
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
      url: TAG_URL[row.content_type](slug),
    };
  });
}
