import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/lib/db/connection";
import {
  bookmarkTagAliasLinks,
  bookmarkTagLinks,
  bookmarkTags,
} from "@/lib/db/schema/bookmark-taxonomy";
import { preventCaching } from "@/lib/utils/api-utils";

const CATEGORY_LIMIT = 12;

export async function GET(): Promise<NextResponse> {
  preventCaching();

  try {
    const rows = await db.execute<{ name: string; count: number }>(sql`
      WITH canonicalized AS (
        SELECT
          coalesce(alias_link.target_tag_slug, tag_link.tag_slug) AS canonical_slug,
          tag_link.bookmark_id
        FROM ${bookmarkTagLinks} AS tag_link
        LEFT JOIN ${bookmarkTagAliasLinks} AS alias_link
          ON alias_link.source_tag_slug = tag_link.tag_slug
          AND alias_link.link_type = 'alias'
      ),
      deduplicated AS (
        SELECT
          canonical_slug,
          bookmark_id
        FROM canonicalized
        GROUP BY canonical_slug, bookmark_id
      )
      SELECT
        tags.tag_name AS name,
        count(*)::int AS count
      FROM deduplicated
      INNER JOIN ${bookmarkTags} AS tags
        ON tags.tag_slug = deduplicated.canonical_slug
      WHERE tags.tag_status = 'primary'
      GROUP BY tags.tag_name
      ORDER BY count(*) DESC, tags.tag_name ASC
      LIMIT ${CATEGORY_LIMIT}
    `);

    return NextResponse.json({
      categories: rows.map((row) => ({ name: row.name, count: row.count })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[API Bookmarks Categories] Failed to load tag topics:", message);
    return NextResponse.json({ error: "Failed to load bookmark tags" }, { status: 500 });
  }
}
