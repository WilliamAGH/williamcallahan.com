/**
 * Bookmarks Feature Component Props
 *
 * MINIMAL TYPE DEFINITIONS - Only what's actually used in the codebase.
 * Previous bloat: 431 lines → Now: ~150 lines
 *
 * Core principle: Bookmarks are simple - URL + title + description + tags.
 * Everything else is just UI variations that should use composition.
 */

import type { UnifiedBookmark, BookmarkTag, BookmarkContent } from "../bookmark";
import type { BaseComponentProps, BaseFilterableProps, BasePaginatedProps } from "../ui";

// =============================================================================
// ACTUALLY USED CLIENT COMPONENT PROPS
// =============================================================================

/**
 * Bookmark card client props - USED in bookmark-card.client.tsx
 *
 * This type combines UnifiedBookmark with additional UI props needed for the card component.
 * When bookmarks are passed to this component, they should maintain all content fields
 * including screenshotAssetId for proper fallback image rendering.
 */
export type BookmarkCardClientProps = UnifiedBookmark & {
  /**
   * Internal route to this bookmark detail page (e.g. "/bookmarks/github-com-google-gemini-gemini-cli").
   *
   * Behaviour contract:
   * 1. On list/grid views (bookmarks root, paginated pages, tag pages) **MUST** be supplied so that the
   *    bookmark image & title link to the internal page instead of the external URL.
   * 2. On the bookmark **detail** page itself the component still receives this value, however the
   *    component detects that `usePathname()` already equals this path and intentionally disables the
   *    internal link, making the image & title fall back to the original external `url`.
   *
   * This dual-behavior ensures we never confuse the two link targets while allowing one reusable
   * component to cover both contexts without prop explosions.
   *
   * NEVER pass an external URL here – it must always start with "/bookmarks/".
   */
  internalHref?: string;
  showDetails?: boolean;
  isInteractive?: boolean;
  onClick?: (bookmark: UnifiedBookmark) => void;
  className?: string;
};

/**
 * Tags list client props - USED in tags-list.client.tsx
 */
export type TagsListClientProps = BaseComponentProps & {
  tags: string[];
  baseUrl?: string;
  maxTags?: number;
  selectedTag: string | null;
  onTagSelectAction: (tag: string) => void;
};

/**
 * Bookmark share button props - USED in share-button.client.tsx
 */
export type BookmarkShareButtonProps = BaseComponentProps & {
  bookmark: Pick<UnifiedBookmark, "id" | "url">;
  shareUrl: string;
};

// Base type for all bookmark list variations
type BaseBookmarkListProps = {
  bookmarks: UnifiedBookmark[];
  searchAllBookmarks?: boolean;
  initialBookmarks?: UnifiedBookmark[];
  baseUrl?: string;
  tag?: string;
};

// Pagination-specific props
type BookmarkPaginationProps = {
  usePagination?: boolean;
  enableInfiniteScroll?: boolean;
  initialPage?: number;
} & import("../component-types").PaginationProps;

/**
 * Paginated bookmarks client props - USED in bookmarks-paginated.client.tsx
 */
export type BookmarksPaginatedClientProps = BaseBookmarkListProps &
  BasePaginatedProps &
  BaseFilterableProps &
  BookmarkPaginationProps & {
    forceClientFetch?: boolean;
    totalPages?: number;
    totalCount?: number;
    baseUrl?: string;
    initialTag?: string;
    tag?: string;
    readonly internalHrefs?: Readonly<Record<string, string>>;
  };

/**
 * Filter options for bookmarks
 */
export interface FilterOptions {
  tags: BookmarkTag[];
  domains?: string[];
}

/**
 * Bookmarks with options client props - USED in bookmarks-with-options.client.tsx
 */
export type BookmarksWithOptionsClientProps = BaseBookmarkListProps &
  BaseFilterableProps & {
    filterOptions?: FilterOptions;
    className?: string;
    readonly internalHrefs?: Readonly<Record<string, string>>;
  };

/**
 * Bookmarks with pagination client props - USED in bookmarks-with-pagination.client.tsx
 */
export type BookmarksWithPaginationClientProps = BaseBookmarkListProps &
  BaseFilterableProps &
  BookmarkPaginationProps & {
    totalPages?: number;
    totalCount?: number;
    baseUrl?: string;
    initialTag?: string;
    tag?: string;
    className?: string;
    readonly internalHrefs?: Readonly<Record<string, string>>;
  };

/**
 * Window client props extended - USED in bookmarks-window.client.tsx
 */
export type BookmarksWindowClientPropsExtended = import("../component-types").WindowProps<{
  bookmarks: UnifiedBookmark[];
}> &
  BaseFilterableProps & {
    pageTitle?: string;
    pageDescription?: string;
    forceClientFetch?: boolean;
    totalPages?: number;
    totalCount?: number;
  };

/**
 * Client with window props - USED in bookmarks-client-with-window.tsx
 */
export interface BookmarksClientWithWindowProps {
  bookmarks: SerializableBookmark[];
  title: string;
  description: string;
  forceClientFetch?: boolean;
  showFilterBar?: boolean;
  titleSlug?: string;
  initialPage?: number;
  totalPages?: number;
  totalCount?: number;
  baseUrl?: string;
  usePagination?: boolean;
  initialTag?: string;
  tag?: string;
  itemsPerPage?: number;
  enableInfiniteScroll?: boolean;
  searchAllBookmarks?: boolean;
  readonly internalHrefs?: Readonly<Record<string, string>>;
}

/**
 * Props for the dynamically imported BookmarksWindowContent component.
 */
export interface BookmarksWindowContentProps {
  children: React.ReactNode;
  windowState: string;
  onClose: () => void;
  onMinimize: () => void;
  onMaximize: () => void;
  titleSlug?: string;
  windowTitle?: string;
}

// =============================================================================
// SERVER COMPONENT PROPS (Only the one that's actually used)
// =============================================================================

/**
 * Server extended props - USED in bookmarks.server.tsx
 */
export interface BookmarksServerExtendedProps {
  bookmarks?: SerializableBookmark[];
  title?: string;
  description?: string;
  searchAllBookmarks?: boolean;
  showFilterBar?: boolean;
  titleSlug?: string;
  initialPage?: number;
  totalPages?: number;
  totalCount?: number;
  baseUrl?: string;
  usePagination?: boolean;
  initialTag?: string;
  tag?: string;
  includeImageData?: boolean;
  readonly internalHrefs?: Readonly<Record<string, string>>;
}

// =============================================================================
// SERIALIZATION TYPE (Critical for server/client boundary)
// =============================================================================

/**
 * Serializable bookmark - USED for server-to-client data passing
 * This ensures all date fields are strings for JSON serialization
 */
export interface SerializableBookmark {
  id: string;
  url: string;
  title: string;
  description: string;
  // REQUIRED: Embed slug for idempotent client navigation
  slug: string;
  tags: string[] | BookmarkTag[];
  ogImage?: string;
  ogImageExternal?: string;
  content?: BookmarkContent;
  dateBookmarked: string;
  dateCreated?: string;
  dateUpdated?: string;
  logoData?: {
    url: string;
    alt: string;
    width?: number;
    height?: number;
  } | null;
  isPrivate: boolean;
  isFavorite: boolean;
  readingTime?: number;
  wordCount?: number;
  ogTitle?: string | null;
  ogDescription?: string | null;
  domain?: string;
}

// =============================================================================
// HOOK TYPES
// =============================================================================

/**
 * Image selection options for bookmark helpers
 */
export interface ImageSelectionOptions {
  includeScreenshots?: boolean;
  returnUndefined?: boolean;
}

// All validated types are now derived from schemas in types/bookmark.ts
// Import them directly from there or through lib/schemas/bookmarks.ts re-exports
