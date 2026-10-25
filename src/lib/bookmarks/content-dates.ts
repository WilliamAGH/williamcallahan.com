import type { BookmarkSelect } from "@/types/db/bookmarks";
import type { UnifiedBookmark } from "@/types/schemas/bookmark";
import { getSafeDate, getLatestDate } from "@/lib/utils/date-format";

type BookmarkContentDates =
  | Pick<UnifiedBookmark, "modifiedAt" | "dateCreated" | "dateBookmarked">
  | Pick<BookmarkSelect, "modifiedAt" | "dateCreated" | "dateBookmarked">;

/** sourceUpdatedAt and index fetch/attempt timestamps are operational, not content dates. */
export const resolveBookmarkLastModified = (bookmark: BookmarkContentDates): Date | undefined =>
  getLatestDate(
    getSafeDate(bookmark.modifiedAt),
    getSafeDate(bookmark.dateCreated),
    getSafeDate(bookmark.dateBookmarked),
  );

export const getLatestBookmarkLastModified = (
  bookmarks: readonly BookmarkContentDates[],
): string | null => {
  let latest: Date | undefined;
  for (const bookmark of bookmarks) {
    latest = getLatestDate(latest, resolveBookmarkLastModified(bookmark));
  }
  return latest?.toISOString() ?? null;
};
