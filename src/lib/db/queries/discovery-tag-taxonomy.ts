import { sql } from "drizzle-orm";

import { db } from "@/lib/db/connection";
import { BOOKMARK_TAG_ALIAS_CTE } from "@/lib/db/bookmark-tag-aliases.mjs";
import type { TagTaxonomyMaps } from "@/types/features/discovery";

export async function loadCanonicalTagMaps(): Promise<TagTaxonomyMaps> {
  const rows = await db.execute<{
    source_slug: string;
    canonical_slug: string;
    canonical_name: string;
  }>(sql`
    ${sql.raw(BOOKMARK_TAG_ALIAS_CTE)}
    SELECT tag.tag_slug AS source_slug,
           coalesce(mapping.target_tag_slug, tag.tag_slug) AS canonical_slug,
           canonical.tag_name AS canonical_name
    FROM bookmarks_tags AS tag
    LEFT JOIN canonical_tag_aliases AS mapping ON mapping.source_tag_slug = tag.tag_slug
    JOIN bookmarks_tags AS canonical
      ON canonical.tag_slug = coalesce(mapping.target_tag_slug, tag.tag_slug)
  `);
  return {
    primaryBySlug: new Map(rows.map((row) => [row.canonical_slug, row.canonical_name])),
    aliasToCanonical: new Map(
      rows
        .filter((row) => row.source_slug !== row.canonical_slug)
        .map((row) => [row.source_slug, row.canonical_slug]),
    ),
  };
}
