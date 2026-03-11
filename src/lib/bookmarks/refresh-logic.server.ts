import { envLogger } from "@/lib/utils/env-logger";
import type { UnifiedBookmark, BookmarkSlugMapping } from "@/types/schemas/bookmark";
import type { RefreshBookmarksCallback } from "@/types/lib";
import { validateBookmarksDataset as validateBookmarkDataset } from "@/lib/validators/bookmarks";
import { calculateBookmarksChecksum } from "@/lib/bookmarks/utils";
import { saveSlugMapping, generateSlugMapping } from "@/lib/bookmarks/slug-manager";
import {
  isBookmarkServiceLoggingEnabled,
  LOG_PREFIX,
  BOOKMARK_SERVICE_LOG_CATEGORY,
  METADATA_REFRESH_MAX_ITEMS,
} from "@/lib/bookmarks/config";
import { processBookmarksInBatches } from "@/lib/bookmarks/enrich-opengraph";
import { writeBookmarkMasterFiles } from "@/lib/bookmarks/persistence.server";

function attachSlugsToBookmarks(
  bookmarks: UnifiedBookmark[],
  mapping: BookmarkSlugMapping,
  context: string,
): UnifiedBookmark[] {
  return bookmarks.map((bookmark) => {
    const entry = mapping.slugs[bookmark.id];
    if (!entry) {
      throw new Error(
        `${LOG_PREFIX} Missing slug mapping for bookmark id=${bookmark.id} (${context})`,
      );
    }
    return { ...bookmark, slug: entry.slug };
  });
}

const logBookmarkDataAccessEvent = (message: string, data?: Record<string, unknown>): void => {
  if (!isBookmarkServiceLoggingEnabled) return;
  envLogger.log(message, data, { category: BOOKMARK_SERVICE_LOG_CATEGORY });
};

let isRefreshLocked = false;
let inFlightRefreshPromise: Promise<UnifiedBookmark[] | null> | null = null;

let bookmarkQueryModulePromise: Promise<typeof import("@/lib/db/queries/bookmarks")> | null = null;
let bookmarkMutationModulePromise: Promise<typeof import("@/lib/db/mutations/bookmarks")> | null =
  null;
let refreshHelperModulePromise: Promise<typeof import("@/lib/bookmarks/refresh-helpers")> | null =
  null;

const loadBookmarkQueryModule = async (): Promise<typeof import("@/lib/db/queries/bookmarks")> => {
  bookmarkQueryModulePromise ??= import("@/lib/db/queries/bookmarks");
  return bookmarkQueryModulePromise;
};

const loadBookmarkMutationModule = async (): Promise<
  typeof import("@/lib/db/mutations/bookmarks")
> => {
  bookmarkMutationModulePromise ??= import("@/lib/db/mutations/bookmarks");
  return bookmarkMutationModulePromise;
};

const loadRefreshHelperModule = async (): Promise<
  typeof import("@/lib/bookmarks/refresh-helpers")
> => {
  refreshHelperModulePromise ??= import("@/lib/bookmarks/refresh-helpers");
  return refreshHelperModulePromise;
};

function computeDisplaySignature(bookmarks: UnifiedBookmark[]): string {
  let acc = "";
  for (const bookmark of bookmarks) {
    acc += `${bookmark.id}|${bookmark.title}|${bookmark.description ?? ""}|${bookmark.ogTitle ?? ""}|${bookmark.ogDescription ?? ""}||`;
  }
  return acc;
}

async function refreshMetadataIfNeeded(
  input: UnifiedBookmark[],
): Promise<{ changed: boolean; updated: UnifiedBookmark[] }> {
  const beforeSig = computeDisplaySignature(input);
  const updated = await processBookmarksInBatches(input, false, true, {
    metadataOnly: true,
    refreshMetadataEvenIfImagePresent: true,
    maxItems: METADATA_REFRESH_MAX_ITEMS,
  });
  const afterSig = computeDisplaySignature(updated);
  return { changed: beforeSig !== afterSig, updated };
}

async function hasBookmarksChanged(newBookmarks: UnifiedBookmark[]): Promise<boolean> {
  const { getBookmarksIndexFromDatabase } = await loadBookmarkQueryModule();
  const existingIndex = await getBookmarksIndexFromDatabase();

  if (existingIndex.count !== newBookmarks.length) {
    return true;
  }

  return calculateBookmarksChecksum(newBookmarks) !== existingIndex.checksum;
}

async function saveSlugMappingOrThrow(
  bookmarks: UnifiedBookmark[],
  logSuffix: string,
): Promise<void> {
  try {
    await saveSlugMapping(bookmarks, true);
    logBookmarkDataAccessEvent("Saved slug mapping", {
      context: logSuffix,
      bookmarkCount: bookmarks.length,
    });
  } catch (error) {
    const normalizedError = error instanceof Error ? error : new Error(String(error));
    console.error(
      `${LOG_PREFIX} CRITICAL: Failed to save slug mapping ${logSuffix}:`,
      normalizedError,
    );
    throw new Error(`Failed to save slug mapping: ${normalizedError.message}`, { cause: error });
  }
}

async function persistBookmarksWithSlugs(
  bookmarks: UnifiedBookmark[],
  context: string,
): Promise<UnifiedBookmark[]> {
  const mapping = generateSlugMapping(bookmarks);
  const bookmarksWithSlugs = attachSlugsToBookmarks(bookmarks, mapping, context);

  await saveSlugMappingOrThrow(bookmarksWithSlugs, context);
  await writeBookmarkMasterFiles(bookmarksWithSlugs);

  return bookmarksWithSlugs;
}

async function refreshWithoutStructuralChange(
  bookmarks: UnifiedBookmark[],
  context: string,
): Promise<UnifiedBookmark[]> {
  await saveSlugMappingOrThrow(bookmarks, `${context}: no-change path`);

  let metadataChanged = false;
  let refreshed = bookmarks;
  try {
    const metadataResult = await refreshMetadataIfNeeded(bookmarks);
    metadataChanged = metadataResult.changed;
    refreshed = metadataResult.updated;
  } catch (error) {
    console.warn(
      `${LOG_PREFIX} Metadata-only refresh failed (${context}), continuing with existing dataset:`,
      String(error),
    );
  }

  if (!metadataChanged) {
    const { rebuildBookmarkTaxonomyState } = await loadBookmarkMutationModule();
    await rebuildBookmarkTaxonomyState(bookmarks, false);
    return bookmarks;
  }

  return persistBookmarksWithSlugs(refreshed, `${context}: metadata-refresh`);
}

export const acquireRefreshLock = async (): Promise<boolean> => {
  if (isRefreshLocked) {
    return false;
  }
  isRefreshLocked = true;
  return true;
};

export const releaseRefreshLock = async (): Promise<void> => {
  isRefreshLocked = false;
};

let refreshBookmarksCallback: RefreshBookmarksCallback | null = null;
let isInitialized = false;

export const setRefreshBookmarksCallback = (callback: RefreshBookmarksCallback): void => {
  refreshBookmarksCallback = callback;
};

export function initializeBookmarksDataAccess(): void {
  if (isInitialized) return;
  isInitialized = true;
  if (!refreshBookmarksCallback) {
    import("@/lib/bookmarks/bookmarks")
      .then(({ refreshBookmarksData }) => setRefreshBookmarksCallback(refreshBookmarksData))
      .catch((error) =>
        console.error("[Bookmarks] Failed to initialize refresh callback:", String(error)),
      );
  }
}

export function cleanupBookmarksDataAccess(): void {
  if (isRefreshLocked) {
    releaseRefreshLock().catch((error) =>
      console.error("[Bookmarks] Failed to release lock on cleanup:", String(error)),
    );
  }
}

export async function selectiveRefreshAndPersistBookmarks(): Promise<UnifiedBookmark[] | null> {
  if (!refreshBookmarksCallback) {
    console.error(`${LOG_PREFIX} Refresh callback not set.`);
    return null;
  }

  try {
    const allIncomingBookmarks = await refreshBookmarksCallback();
    if (!allIncomingBookmarks) return null;

    const hasChanged = await hasBookmarksChanged(allIncomingBookmarks);
    if (!hasChanged) {
      logBookmarkDataAccessEvent("No structural changes detected in selective refresh");
      return refreshWithoutStructuralChange(allIncomingBookmarks, "selective");
    }

    logBookmarkDataAccessEvent("Changes detected, persisting bookmarks (selective)");
    return persistBookmarksWithSlugs(allIncomingBookmarks, "selective-change");
  } catch (error: unknown) {
    console.error(`${LOG_PREFIX} Error during selective refresh:`, String(error));
    throw error;
  }
}

export function refreshAndPersistBookmarks(force = false): Promise<UnifiedBookmark[] | null> {
  if (inFlightRefreshPromise) return inFlightRefreshPromise;

  const promise = (async () => {
    if (isRefreshLocked || !(await acquireRefreshLock())) {
      console.warn(`${LOG_PREFIX} Refresh skipped: lock already held by another caller`);
      return null;
    }

    try {
      const useSelectiveRefresh = process.env.SELECTIVE_OG_REFRESH === "true";
      if (useSelectiveRefresh) {
        return selectiveRefreshAndPersistBookmarks();
      }

      if (!refreshBookmarksCallback) {
        console.error(
          `${LOG_PREFIX} Refresh callback not set (initializeBookmarksDataAccess may not have completed)`,
        );
        return null;
      }

      const freshBookmarks = await refreshBookmarksCallback(force);
      if (freshBookmarks && freshBookmarks.length > 0) {
        const { isValid } = validateBookmarkDataset(freshBookmarks);
        if (!isValid) {
          console.warn(`${LOG_PREFIX} Freshly fetched bookmarks are invalid.`);
          return null;
        }

        const hasChanged = await hasBookmarksChanged(freshBookmarks);
        if (hasChanged || force) {
          logBookmarkDataAccessEvent(
            force
              ? "Force refresh enabled; persisting bookmarks to PostgreSQL"
              : "Changes detected; persisting bookmarks to PostgreSQL",
          );
          return persistBookmarksWithSlugs(freshBookmarks, force ? "force" : "change-detected");
        }

        logBookmarkDataAccessEvent(
          "No structural changes detected; refreshing metadata/index state",
        );
        return refreshWithoutStructuralChange(freshBookmarks, "non-selective");
      }

      console.warn(
        `${LOG_PREFIX} No bookmarks returned from refresh (likely missing API config), attempting PostgreSQL fallback`,
      );
      const { loadDatabaseFallback } = await loadRefreshHelperModule();
      return loadDatabaseFallback();
    } catch (error: unknown) {
      console.error(`${LOG_PREFIX} Failed to refresh bookmarks:`, String(error));
      throw error;
    } finally {
      await releaseRefreshLock();
    }
  })();

  inFlightRefreshPromise = promise;
  void promise.finally(() => {
    inFlightRefreshPromise = null;
  });

  return promise;
}
