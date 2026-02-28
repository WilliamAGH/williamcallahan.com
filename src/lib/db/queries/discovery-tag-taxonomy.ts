import { eq } from "drizzle-orm";

import { db } from "@/lib/db/connection";
import { bookmarkTagAliasLinks, bookmarkTags } from "@/lib/db/schema/bookmark-taxonomy";
import type { TagTaxonomyMaps } from "@/types/features/discovery";

export type { TagTaxonomyMaps } from "@/types/features/discovery";

export async function loadCanonicalTagMaps(): Promise<TagTaxonomyMaps> {
  const [primaryRows, aliasRows] = await Promise.all([
    db
      .select({ tagSlug: bookmarkTags.tagSlug, tagName: bookmarkTags.tagName })
      .from(bookmarkTags)
      .where(eq(bookmarkTags.tagStatus, "primary")),
    db
      .select({
        sourceTagSlug: bookmarkTagAliasLinks.sourceTagSlug,
        targetTagSlug: bookmarkTagAliasLinks.targetTagSlug,
      })
      .from(bookmarkTagAliasLinks)
      .where(eq(bookmarkTagAliasLinks.linkType, "alias")),
  ]);

  return {
    primaryBySlug: new Map(primaryRows.map((row) => [row.tagSlug, row.tagName] as const)),
    aliasToCanonical: new Map(
      aliasRows.map((row) => [row.sourceTagSlug, row.targetTagSlug] as const),
    ),
  };
}
