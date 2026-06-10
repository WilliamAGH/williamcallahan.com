/**
 * Enrichment hydration for the bookmark refresh pipeline.
 *
 * Raw Karakeep payloads carry no enrichment (OpenGraph fields, logos,
 * computed fields). Before re-enrichment, prior persisted values are merged
 * in so unchanged bookmarks skip image work and partial refreshes can never
 * regress previously enriched rows. Binds the canonical
 * BOOKMARK_ENRICHMENT_FIELDS contract; do not restate the field list.
 *
 * @module lib/bookmarks/enrichment-hydration
 */

import { BOOKMARK_ENRICHMENT_FIELDS } from "@/lib/db/bookmark-record-mapper";
import type { UnifiedBookmark } from "@/types/schemas/bookmark";

const mergeField = <K extends (typeof BOOKMARK_ENRICHMENT_FIELDS)[number]>(
  target: UnifiedBookmark,
  prior: UnifiedBookmark,
  field: K,
): void => {
  target[field] ??= prior[field];
};

/** Merge prior persisted enrichment into freshly normalized bookmarks (in place). */
export function hydrateEnrichment(
  bookmarks: UnifiedBookmark[],
  existing: readonly UnifiedBookmark[],
): UnifiedBookmark[] {
  const priorById = new Map(existing.map((bookmark) => [bookmark.id, bookmark]));
  for (const bookmark of bookmarks) {
    const prior = priorById.get(bookmark.id);
    if (!prior) continue;
    for (const field of BOOKMARK_ENRICHMENT_FIELDS) {
      mergeField(bookmark, prior, field);
    }
  }
  return bookmarks;
}

/** Hydrate enrichment from the persisted PostgreSQL dataset. */
export async function hydrateEnrichmentFromDatabase(
  bookmarks: UnifiedBookmark[],
): Promise<UnifiedBookmark[]> {
  try {
    const { getAllBookmarks } = await import("@/lib/db/queries/bookmarks");
    return hydrateEnrichment(bookmarks, await getAllBookmarks());
  } catch (error) {
    console.warn(
      "[refreshBookmarksData] Prior enrichment unavailable; continuing with raw dataset:",
      String(error),
    );
    return bookmarks;
  }
}

/**
 * A bookmark still needs the data updater to move its Karakeep asset into S3
 * when it has an asset but its ogImage is missing or still a proxy URL.
 */
export function needsKarakeepImageUpgrade(bookmark: UnifiedBookmark): boolean {
  const hasKarakeepAsset = Boolean(
    bookmark.content?.imageAssetId || bookmark.content?.screenshotAssetId,
  );
  if (!hasKarakeepAsset) return false;
  const isContentImageFallback =
    bookmark.content?.imageUrl !== undefined && bookmark.ogImage === bookmark.content.imageUrl;
  return !bookmark.ogImage || bookmark.ogImage.startsWith("/api/assets/") || isContentImageFallback;
}
