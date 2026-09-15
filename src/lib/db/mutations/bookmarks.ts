import { and, eq, notInArray, sql, type SQL } from "drizzle-orm";
import type { PgColumn, PgUpdateSetSource } from "drizzle-orm/pg-core";
import { BOOKMARKS_PER_PAGE } from "@/lib/constants";
import { calculateBookmarksChecksum } from "@/lib/bookmarks/utils";
import {
  BOOKMARK_ENRICHMENT_FIELDS,
  mapUnifiedBookmarksToBookmarkInserts,
} from "@/lib/db/bookmark-record-mapper";
import { applySlugMapping, reconcileSlugMapping } from "@/lib/bookmarks/slug-manager";
import { assertDatabaseWriteAllowed, db } from "@/lib/db/connection";
import { getSlugMappingRowsFromDatabase } from "@/lib/db/queries/bookmarks";
import {
  bookmarkIndexState,
  bookmarkTags,
  bookmarkTagIndexState,
  bookmarkTagLinks,
} from "@/lib/db/schema/bookmark-taxonomy";
import { bookmarks } from "@/lib/db/schema/bookmarks";
import { tagToSlug } from "@/lib/utils/tag-utils";
import type { BookmarkInsert } from "@/types/db/bookmarks";
import type { UnifiedBookmark } from "@/types/schemas/bookmark";

const GLOBAL_BOOKMARK_INDEX_STATE_ID = "global";
const UPSERT_MAX_RETRIES = 3;
const UPSERT_RETRY_DELAY_MS = 500;

type BookmarkWriteExecutor = Pick<typeof db, "delete" | "insert">;

/**
 * Enrichment-owned columns ([BOOKMARK_ENRICHMENT_FIELDS]) are produced by
 * OpenGraph/logo/computed-field pipelines, not by the Karakeep source
 * payload. A refresh that carries no enrichment must not erase previously
 * persisted values, so on conflict these columns keep the stored value
 * whenever the incoming one is NULL.
 */
const preserveEnrichment = (column: PgColumn): SQL =>
  sql`coalesce(excluded.${sql.identifier(column.name)}, ${column})`;

export const buildBookmarkConflictUpdate = ({
  id: _id,
  ...updatableFields
}: BookmarkInsert): PgUpdateSetSource<typeof bookmarks> => {
  const set: PgUpdateSetSource<typeof bookmarks> = { ...updatableFields };
  for (const field of BOOKMARK_ENRICHMENT_FIELDS) {
    set[field] = preserveEnrichment(bookmarks[field]);
  }
  return set;
};

const buildBookmarkIndexStatePayload = (
  count: number,
  checksum: string,
  timestamp: number,
  lastModified: string,
  changeDetected: boolean,
) => ({
  count,
  totalPages: Math.ceil(count / BOOKMARKS_PER_PAGE),
  pageSize: BOOKMARKS_PER_PAGE,
  lastModified,
  lastFetchedAt: timestamp,
  lastAttemptedAt: timestamp,
  checksum,
  changeDetected,
});

const buildBookmarkIndexStateUpdate = ({
  id: _id,
  ...updatableStateFields
}: typeof bookmarkIndexState.$inferInsert): Omit<typeof bookmarkIndexState.$inferInsert, "id"> =>
  updatableStateFields;

const isRetryableUpsertError = (error: unknown): boolean => {
  if (!(error instanceof Error)) {
    return false;
  }

  return (
    error.message.includes("CONNECT_TIMEOUT") ||
    error.message.includes("ECONNRESET") ||
    error.message.includes("Connection terminated")
  );
};

const sleep = async (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

const resolveTagMetadata = (
  rawTag: unknown,
): {
  tagName: string;
  tagSlug: string;
} | null => {
  if (typeof rawTag === "string") {
    const tagName = rawTag.trim();
    const tagSlug = tagToSlug(tagName);
    if (!tagName || !tagSlug) {
      return null;
    }
    return { tagName, tagSlug };
  }

  if (rawTag && typeof rawTag === "object") {
    const nameValue = "name" in rawTag ? (rawTag.name as unknown) : null;
    const slugValue = "slug" in rawTag ? (rawTag.slug as unknown) : null;
    if (typeof nameValue !== "string") {
      return null;
    }

    const tagName = nameValue.trim();
    const tagSlug =
      typeof slugValue === "string" && slugValue.trim().length > 0
        ? tagToSlug(slugValue.trim())
        : tagToSlug(tagName);
    if (!tagName || !tagSlug) {
      return null;
    }
    return { tagName, tagSlug };
  }

  return null;
};

async function upsertBookmark(
  executor: Pick<typeof db, "insert">,
  data: BookmarkInsert,
): Promise<void> {
  await executor
    .insert(bookmarks)
    .values(data)
    .onConflictDoUpdate({
      target: bookmarks.id,
      set: buildBookmarkConflictUpdate(data),
    });
}

async function upsertBookmarks(
  executor: Pick<typeof db, "insert">,
  data: readonly BookmarkInsert[],
): Promise<void> {
  for (const bookmarkData of data) {
    await upsertBookmark(executor, bookmarkData);
  }
}

async function rebuildBookmarkTaxonomyStateInTransaction(
  executor: BookmarkWriteExecutor,
  bookmarksData: readonly UnifiedBookmark[],
  changeDetected: boolean,
): Promise<void> {
  const timestamp = Date.now();
  const lastModified = new Date(timestamp).toISOString();

  const tagLinkRows: Array<typeof bookmarkTagLinks.$inferInsert> = [];
  const tagsBySlug = new Map<
    string,
    {
      tagName: string;
      bookmarks: UnifiedBookmark[];
    }
  >();

  for (const bookmark of bookmarksData) {
    const bookmarkTags = Array.isArray(bookmark.tags) ? bookmark.tags : [];
    const seenSlugsForBookmark = new Set<string>();

    for (const rawTag of bookmarkTags) {
      const tagMetadata = resolveTagMetadata(rawTag);
      if (!tagMetadata || seenSlugsForBookmark.has(tagMetadata.tagSlug)) {
        continue;
      }
      seenSlugsForBookmark.add(tagMetadata.tagSlug);

      tagLinkRows.push({
        bookmarkId: bookmark.id,
        tagSlug: tagMetadata.tagSlug,
        tagName: tagMetadata.tagName,
        dateBookmarked: bookmark.dateBookmarked,
      });

      const existingBucket = tagsBySlug.get(tagMetadata.tagSlug);
      if (existingBucket) {
        existingBucket.bookmarks.push(bookmark);
      } else {
        tagsBySlug.set(tagMetadata.tagSlug, {
          tagName: tagMetadata.tagName,
          bookmarks: [bookmark],
        });
      }
    }
  }

  const tagIndexRows: Array<typeof bookmarkTagIndexState.$inferInsert> = [];
  const tagDefinitionRows: Array<typeof bookmarkTags.$inferInsert> = [];
  const incomingPrimaryTagSlugs: string[] = [];
  for (const [tagSlug, bucket] of tagsBySlug) {
    const count = bucket.bookmarks.length;
    incomingPrimaryTagSlugs.push(tagSlug);
    tagDefinitionRows.push({
      tagSlug,
      tagName: bucket.tagName,
      tagStatus: "primary",
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    tagIndexRows.push({
      tagSlug,
      tagName: bucket.tagName,
      ...buildBookmarkIndexStatePayload(
        count,
        calculateBookmarksChecksum(bucket.bookmarks),
        timestamp,
        lastModified,
        changeDetected,
      ),
    });
  }

  const globalCount = bookmarksData.length;
  const globalIndexRow: typeof bookmarkIndexState.$inferInsert = {
    id: GLOBAL_BOOKMARK_INDEX_STATE_ID,
    ...buildBookmarkIndexStatePayload(
      globalCount,
      calculateBookmarksChecksum([...bookmarksData]),
      timestamp,
      lastModified,
      changeDetected,
    ),
  };

  if (tagDefinitionRows.length > 0) {
    await executor
      .insert(bookmarkTags)
      .values(tagDefinitionRows)
      .onConflictDoUpdate({
        target: bookmarkTags.tagSlug,
        set: {
          tagName: sql`excluded.tag_name`,
          updatedAt: timestamp,
        },
      });
  }

  if (incomingPrimaryTagSlugs.length === 0) {
    await executor.delete(bookmarkTags).where(eq(bookmarkTags.tagStatus, "primary"));
  } else {
    await executor
      .delete(bookmarkTags)
      .where(
        and(
          eq(bookmarkTags.tagStatus, "primary"),
          notInArray(bookmarkTags.tagSlug, incomingPrimaryTagSlugs),
        ),
      );
  }

  await executor.delete(bookmarkTagLinks);
  if (tagLinkRows.length > 0) {
    await executor.insert(bookmarkTagLinks).values(tagLinkRows);
  }

  await executor.delete(bookmarkTagIndexState);
  if (tagIndexRows.length > 0) {
    await executor.insert(bookmarkTagIndexState).values(tagIndexRows);
  }

  await executor
    .insert(bookmarkIndexState)
    .values(globalIndexRow)
    .onConflictDoUpdate({
      target: bookmarkIndexState.id,
      set: buildBookmarkIndexStateUpdate(globalIndexRow),
    });
}

export async function rebuildBookmarkTaxonomyState(
  bookmarksData: readonly UnifiedBookmark[],
  changeDetected: boolean = true,
): Promise<void> {
  assertDatabaseWriteAllowed("rebuildBookmarkTaxonomyState");
  await db.transaction(async (tx) => {
    await tx.execute(sql`lock table bookmarks in share row exclusive mode`);
    await rebuildBookmarkTaxonomyStateInTransaction(tx, bookmarksData, changeDetected);
  });
}

async function writeUnifiedBookmarks(
  bookmarksData: readonly UnifiedBookmark[],
  rebuildTaxonomy: boolean,
): Promise<UnifiedBookmark[]> {
  let attempt = 0;
  while (true) {
    try {
      return await db.transaction(async (tx) => {
        await tx.execute(sql`lock table bookmarks in share row exclusive mode`);
        const persistedSlugs = await getSlugMappingRowsFromDatabase(tx);
        const mapping = reconcileSlugMapping(bookmarksData, persistedSlugs);
        const reconciledBookmarks = applySlugMapping(bookmarksData, mapping);
        const inserts = mapUnifiedBookmarksToBookmarkInserts(reconciledBookmarks);

        await upsertBookmarks(tx, inserts);
        if (rebuildTaxonomy) {
          await rebuildBookmarkTaxonomyStateInTransaction(tx, reconciledBookmarks, true);
        }
        return reconciledBookmarks;
      });
    } catch (error) {
      attempt += 1;
      if (attempt >= UPSERT_MAX_RETRIES || !isRetryableUpsertError(error)) {
        throw error;
      }

      const delayMilliseconds = UPSERT_RETRY_DELAY_MS * attempt;
      console.warn(
        `[db/mutations/bookmarks] Refresh transaction retry ${attempt}/${UPSERT_MAX_RETRIES - 1} after transient connection error.`,
      );
      await sleep(delayMilliseconds);
    }
  }
}

/**
 * Reconcile durable slug ownership and persist the bookmark dataset as one transaction.
 * The table lock serializes refreshes and legacy bookmark writers together.
 */
export async function upsertUnifiedBookmarks(
  bookmarksData: readonly UnifiedBookmark[],
): Promise<UnifiedBookmark[]> {
  assertDatabaseWriteAllowed("upsertUnifiedBookmarks");
  return writeUnifiedBookmarks(bookmarksData, true);
}

export async function upsertUnifiedBookmark(bookmark: UnifiedBookmark): Promise<void> {
  assertDatabaseWriteAllowed("upsertUnifiedBookmark");
  await writeUnifiedBookmarks([bookmark], false);
}

export async function deleteBookmark(bookmarkId: string): Promise<void> {
  assertDatabaseWriteAllowed("deleteBookmark");
  await db.transaction(async (tx) => {
    await tx.execute(sql`lock table bookmarks in share row exclusive mode`);
    await tx.delete(bookmarks).where(eq(bookmarks.id, bookmarkId));
  });
}
