/**
 * Bookmark Data Validation Schemas
 * @module lib/schemas/bookmarks
 * @description
 * Re-exports bookmark schemas from types/bookmark.ts for backward compatibility.
 * All schemas are now centralized in types/bookmark.ts as the single source of truth.
 */

// Re-export all bookmark schemas from the centralized location
export {
  bookmarkTagSchema,
  logoDataSchema,
  rawBookmarkSchema,
  clientBookmarkSchema,
  bookmarkPaginationSchema,
  bookmarkListResponseSchema,
  bookmarksIndexSchema as BookmarksIndexSchema,
  type BookmarkTag,
  type RawBookmark,
  type ClientBookmark,
  type BookmarkPagination,
  type BookmarkListResponse,
  type BookmarksIndex,
} from "@/types/bookmark";

// Re-export LogoData separately to avoid circular dependency issues
export type { LogoData } from "@/types/logo";
