import { and, eq, notInArray, sql } from "drizzle-orm";
import { BOOKMARKS_PER_PAGE } from "@/lib/constants";
import { calculateBookmarksChecksum } from "@/lib/bookmarks/utils";
import {
  mapUnifiedBookmarksToBookmarkInserts,
  mapUnifiedBookmarkToBookmarkInsert,
} from "@/lib/db/bookmark-record-mapper";
import { assertDatabaseWriteAllowed, db } from "@/lib/db/connection";
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

const buildBookmarkConflictUpdate = ({
  id: _id,
  ...updatableFields
}: BookmarkInsert): Omit<BookmarkInsert, "id"> => updatableFields;

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

export async function upsertBookmark(data: BookmarkInsert): Promise<void> {
  assertDatabaseWriteAllowed("upsertBookmark");

  await db
    .insert(bookmarks)
    .values(data)
    .onConflictDoUpdate({
      target: bookmarks.id,
      set: buildBookmarkConflictUpdate(data),
    });
}

async function upsertBookmarkWithRetry(data: BookmarkInsert): Promise<void> {
  let attempt = 0;
  while (attempt < UPSERT_MAX_RETRIES) {
    try {
      await upsertBookmark(data);
      return;
    } catch (error) {
      attempt += 1;
      const shouldRetry = attempt < UPSERT_MAX_RETRIES && isRetryableUpsertError(error);
      if (!shouldRetry) {
        throw error;
      }

      const delayMilliseconds = UPSERT_RETRY_DELAY_MS * attempt;
      console.warn(
        `[db/mutations/bookmarks] Upsert retry ${attempt}/${UPSERT_MAX_RETRIES - 1} for bookmark ${data.id} after transient connection error.`,
      );
      await sleep(delayMilliseconds);
    }
  }
}

export async function upsertUnifiedBookmark(bookmark: UnifiedBookmark): Promise<void> {
  await upsertBookmark(mapUnifiedBookmarkToBookmarkInsert(bookmark));
}

export async function upsertBookmarks(data: readonly BookmarkInsert[]): Promise<void> {
  if (data.length === 0) {
    return;
  }

  for (const bookmarkData of data) {
    await upsertBookmarkWithRetry(bookmarkData);
  }
}

export async function rebuildBookmarkTaxonomyState(
  bookmarksData: readonly UnifiedBookmark[],
  changeDetected: boolean = true,
): Promise<void> {
  assertDatabaseWriteAllowed("rebuildBookmarkTaxonomyState");

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

  await db.transaction(async (tx) => {
    if (tagDefinitionRows.length > 0) {
      await tx
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
      await tx.delete(bookmarkTags).where(eq(bookmarkTags.tagStatus, "primary"));
    } else {
      await tx
        .delete(bookmarkTags)
        .where(
          and(
            eq(bookmarkTags.tagStatus, "primary"),
            notInArray(bookmarkTags.tagSlug, incomingPrimaryTagSlugs),
          ),
        );
    }

    await tx.delete(bookmarkTagLinks);
    if (tagLinkRows.length > 0) {
      await tx.insert(bookmarkTagLinks).values(tagLinkRows);
    }

    await tx.delete(bookmarkTagIndexState);
    if (tagIndexRows.length > 0) {
      await tx.insert(bookmarkTagIndexState).values(tagIndexRows);
    }

    await tx
      .insert(bookmarkIndexState)
      .values(globalIndexRow)
      .onConflictDoUpdate({
        target: bookmarkIndexState.id,
        set: buildBookmarkIndexStateUpdate(globalIndexRow),
      });
  });
}

export async function upsertUnifiedBookmarks(
  bookmarksData: readonly UnifiedBookmark[],
): Promise<void> {
  const inserts = mapUnifiedBookmarksToBookmarkInserts(bookmarksData);
  await upsertBookmarks(inserts);
  await rebuildBookmarkTaxonomyState(bookmarksData, true);
}

export async function deleteBookmark(bookmarkId: string): Promise<void> {
  assertDatabaseWriteAllowed("deleteBookmark");
  await db.delete(bookmarks).where(eq(bookmarks.id, bookmarkId));
}
