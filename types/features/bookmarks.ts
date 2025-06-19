/**
 * Bookmark Feature Component Props
 *
 * SCOPE: Bookmark-specific component props and interfaces
 * USAGE: Use for bookmark cards, lists, filtering, and related UI components
 * OVERLAP PREVENTION: Do NOT add generic UI props (use types/ui.ts)
 * DO NOT add other feature domains (use separate feature files)
 *
 * DRY PRINCIPLE: When creating component props, prefer extending/reusing types from
 * the core domain model (types/bookmark.ts) rather than recreating similar structures.
 * Example: Use `bookmark: Bookmark` instead of redefining bookmark properties inline.
 *
 * @see types/bookmark.ts for bookmark domain models and data types
 * @see types/ui.ts for generic UI component props
 */

import type { JSX, ReactNode } from "react";
import type { Bookmark, UnifiedBookmark } from "../bookmark";
import type { z } from "zod";
import type {
  bookmarkListResponseSchema,
  bookmarkPaginationSchema,
  bookmarkTagSchema,
  clientBookmarkSchema,
  logoDataSchema,
  rawBookmarkSchema,
} from "@/lib/schemas/bookmarks";

/**
 * Options for fetching bookmarks, controlling cache behavior and external API calls.
 * @usage Used in the primary `fetchBookmarks` service function.
 */
export interface FetchBookmarksOptions {
  /**
   * Fetching mode:
   * - 'immediate': Block and wait for fresh data if cache is stale
   * - 'stale-while-revalidate': Return stale data immediately and refresh in background
   */
  mode?: "immediate" | "stale-while-revalidate";

  /**
   * Skip external API fetch entirely (useful for build time)
   */
  skipExternalFetch?: boolean;
}

/**
 * Options for image selection behavior in bookmarks.
 * @usage Used in `selectBestImage` helper to determine image priority.
 */
export interface ImageSelectionOptions {
  /** Prefer OpenGraph images over Karakeep images (default: true) */
  preferOpenGraph?: boolean;
  /** Include screenshot assets as fallback (default: true) */
  includeScreenshots?: boolean;
  /** Return undefined instead of null for no image (default: false) */
  returnUndefined?: boolean;
}

/**
 * Represents a bookmark with a rendered preview element.
 * This is a UI-specific type used for client-side rendering.
 */
export interface BookmarkWithPreview extends Bookmark {
  preview: JSX.Element;
}

/**
 * Bookmark card component props
 * @usage - Individual bookmark display cards
 */
export interface BookmarkCardProps {
  /** Bookmark data to display */
  bookmark: Bookmark;
  /** Whether to show full details */
  showDetails?: boolean;
  /** Click callback */
  onClick?: (bookmark: Bookmark) => void;
  /** Optional CSS classes */
  className?: string;
}

/**
 * Paginated bookmarks component props
 * @usage - Bookmark lists with client-side pagination
 */
export interface BookmarksPaginatedProps {
  /** Initial bookmarks data */
  initialBookmarks: Bookmark[];
  /** Items per page */
  itemsPerPage?: number;
  /** Optional CSS classes */
  className?: string;
}

/**
 * Bookmarks paginated client component props
 * @usage - Client-side paginated bookmark display with additional client features
 */
export interface BookmarksPaginatedClientProps extends Omit<BookmarksPaginatedProps, "initialBookmarks"> {
  /** Bookmarks array for client-side rendering */
  bookmarks: UnifiedBookmark[];
  /** Force client-side fetching */
  forceClientFetch?: boolean;
  /** Show filter bar */
  showFilterBar?: boolean;
  /** Use pagination controls */
  usePagination?: boolean;
  /** Enable infinite scroll */
  enableInfiniteScroll?: boolean;
  /** Initial page number */
  initialPage?: number;
  /** Current page number */
  currentPage?: number;
  /** Total number of pages */
  totalPages?: number;
  /** Base URL for pagination */
  baseUrl?: string;
  /** Initial tag filter */
  initialTag?: string;
  /** Current tag filter */
  tag?: string;
}

/**
 * Bookmarks window component props
 * @usage - Bookmarks displayed in window-like UI
 */
export interface BookmarksWindowProps {
  /** Bookmarks to display */
  bookmarks: Bookmark[];
  /** Window title */
  title?: string;
  /** Whether window is active */
  isActive?: boolean;
  /** Optional CSS classes */
  className?: string;
}

/**
 * Bookmarks with filtering options component props
 * @usage - Bookmark lists with advanced filtering capabilities
 */
export interface BookmarksWithOptionsProps {
  /** Initial bookmarks */
  initialBookmarks: Bookmark[];
  /** Available filter options */
  filterOptions?: {
    tags: string[];
    domains: string[];
  };
  /** Optional CSS classes */
  className?: string;
}

/**
 * Bookmarks with options client component props
 * @usage - Client-side bookmarks with filtering and search options
 */
export interface BookmarksWithOptionsClientProps extends Omit<BookmarksWithOptionsProps, "initialBookmarks"> {
  /** Bookmarks array for client-side rendering */
  bookmarks: UnifiedBookmark[];
  /** Show filter bar */
  showFilterBar?: boolean;
  /** Search all bookmarks */
  searchAllBookmarks?: boolean;
  /** Initial tag filter */
  initialTag?: string;
}

/**
 * Bookmarks with pagination component props
 * @usage - Server-side paginated bookmark lists
 */
export interface BookmarksWithPaginationProps {
  /** Initial bookmarks */
  initialBookmarks: Bookmark[];
  /** Total number of bookmarks */
  totalCount?: number;
  /** Current page */
  currentPage?: number;
  /** Items per page */
  itemsPerPage: number;
  /** Optional CSS classes */
  className?: string;
}

/**
 * Bookmarks with pagination client component props
 * @usage - Client-side paginated bookmarks with additional features
 */
export interface BookmarksWithPaginationClientProps extends Omit<BookmarksWithPaginationProps, "initialBookmarks"> {
  /** Initial bookmarks for client-side rendering */
  initialBookmarks?: UnifiedBookmark[];
  /** Show filter bar */
  showFilterBar?: boolean;
  /** Search all bookmarks */
  searchAllBookmarks?: boolean;
  /** Enable infinite scroll */
  enableInfiniteScroll?: boolean;
  /** Initial page number */
  initialPage?: number;
  /** Base URL for pagination */
  baseUrl?: string;
  /** Initial tag filter */
  initialTag?: string;
  /** Current tag filter */
  tag?: string;
}

/**
 * Client-side bookmarks component props
 * @usage - Interactive bookmark components with search/filtering
 */
export interface BookmarksClientProps {
  /** Initial bookmarks data */
  initialBookmarks: Bookmark[];
  /** Whether search is enabled */
  enableSearch?: boolean;
  /** Optional CSS classes */
  className?: string;
}

/**
 * Server-side bookmarks component props
 * @usage - Server-rendered bookmark components with pagination
 */
export interface BookmarksServerProps {
  /** Server-side bookmarks data */
  bookmarks: Bookmark[];
  /** Server-side pagination info */
  pagination?: {
    currentPage: number;
    totalPages: number;
    totalCount: number;
  };
  /** Optional CSS classes */
  className?: string;
}

/**
 * Bookmark-specific share button props
 * @usage - Sharing a specific bookmark
 */
export interface BookmarkShareButtonProps {
  /** Bookmark data with id and url */
  bookmark: Pick<Bookmark, "id" | "url">;
  /** Specific share URL for this bookmark */
  shareUrl: string;
  /** Optional CSS classes */
  className?: string;
}

/**
 * Tags list component props
 * @usage - Displaying bookmark tags with optional linking
 */
export interface TagsListProps {
  /** Array of tags */
  tags: string[];
  /** Base URL for tag links */
  baseUrl?: string;
  /** Maximum tags to show */
  maxTags?: number;
  /** Optional CSS classes */
  className?: string;
}

/**
 * Tags list client component props
 * @usage - Interactive tag list with selection functionality
 */
export interface TagsListClientProps extends TagsListProps {
  /** Currently selected tag */
  selectedTag: string | null;
  /** Callback when tag is selected */
  onTagSelectAction: (tag: string) => void;
}

/**
 * Bookmark card client component props
 * @usage - Client-side bookmark cards with additional functionality
 */
export interface BookmarkCardClientProps extends UnifiedBookmark {
  /** Pre-generated share URL to avoid per-card API calls */
  shareUrl?: string;
}

/**
 * Extended bookmarks client props for compatibility
 * @usage - Backward compatibility with UnifiedBookmark structure
 */
export interface BookmarksClientExtendedProps extends BookmarksClientProps {
  bookmarks: UnifiedBookmark[];
  forceClientFetch?: boolean;
  showFilterBar?: boolean;
}

/**
 * @description
 * Props for the server-side {@link BookmarksServer} component.
 *
 * It intentionally aligns with many of the props from {@link BookmarksClientWithWindowProps},
 * as its primary role is to fetch data and pass it to the client counterpart.
 *
 * The key difference is that `bookmarks` are optional, as the server component
 * can fetch them if not provided.
 */
export interface BookmarksServerExtendedProps {
  /**
   * Optional array of bookmarks to render. If not provided, they will be fetched.
   * @see BookmarksServer
   */
  bookmarks?: UnifiedBookmark[];

  /** The main title for the bookmarks section. */
  title: string;

  /** A description to display below the title. */
  description: string;

  /** Whether to display the filter bar. Defaults to `true`. */
  showFilterBar?: boolean;

  /** A URL-friendly slug for the title, used for deep linking. */
  titleSlug?: string;

  /** The initial page number for pagination. */
  initialPage?: number;

  /** The base URL for constructing pagination links. */
  baseUrl?: string;

  /** Whether to use pagination controls. Defaults to `true`. */
  usePagination?: boolean;

  /** An initial tag to filter bookmarks by. */
  initialTag?: string;

  /** The currently active tag for filtering. */
  tag?: string;
}

/**
 * Bookmarks window client props
 * @usage - Client-side bookmarks in window UI
 */
export interface BookmarksWindowClientProps {
  children: ReactNode;
  bookmarks: import("../bookmark").UnifiedBookmark[];
  title?: string;
  isActive?: boolean;
  className?: string;
}

/**
 * Bookmarks client with window component props
 * @usage - Client-side bookmarks with window UI and additional features
 */
export interface BookmarksClientWithWindowProps {
  /** Serializable bookmark data from server */
  bookmarks: SerializableBookmark[];
  /** Required window title */
  title: string;
  /** Window description */
  description: string;
  /** Force client-side fetching */
  forceClientFetch?: boolean;
  /** Show filter bar */
  showFilterBar?: boolean;
  /** Title slug for URL routing */
  titleSlug?: string;
  /** Initial page number */
  initialPage?: number;
  /** Base URL for pagination */
  baseUrl?: string;
  /** Use pagination controls */
  usePagination?: boolean;
  /** Initial tag filter */
  initialTag?: string;
  /** Current tag filter */
  tag?: string;
}

/**
 * Extended bookmarks window client component props
 * @usage - Extended bookmarks window with additional configuration options
 */
export interface BookmarksWindowClientPropsExtended extends BookmarksWindowClientProps {
  /** Optional slug to display in the title bar */
  titleSlug?: string;
  /** Optional custom window title to display instead of the default */
  windowTitle?: string;
  /** Optional window ID. If not provided, uses the default 'bookmarks-window' */
  windowId?: string;
}

export interface UseBookmarksPaginationOptions {
  limit?: number;
  initialData?: UnifiedBookmark[];
  initialPage?: number;
  tag?: string;
}

export interface UseBookmarksPaginationReturn {
  bookmarks: UnifiedBookmark[];
  currentPage: number;
  totalPages: number;
  totalItems: number;
  isLoading: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  error?: Error;
  loadMore: () => void;
  goToPage: (page: number) => void;
  mutate: () => void;
}

/**
 * Serializable bookmark data for server-to-client communication
 * Contains only JSON-serializable types to prevent Next.js serialization errors
 * @usage - Props passed from Server Components to Client Components
 */
export interface SerializableBookmark {
  id: string;
  url: string;
  title: string;
  description: string | null;
  tags: Array<{
    id: string;
    name: string;
    slug: string;
    color?: string;
  }>;
  dateBookmarked: string; // ISO string, not Date object
  dateCreated?: string;
  dateUpdated?: string;
  logoData?: {
    url: string;
    alt: string | null | undefined;
    width?: number;
    height?: number;
  } | null;
  isPrivate: boolean;
  isFavorite: boolean;
  readingTime?: number;
  wordCount?: number;
  ogTitle?: string | null;
  ogDescription?: string | null;
  ogImage?: string | null;
  domain?: string;
}

/**
 * Serializable props for BookmarksServerExtended component
 * Ensures all props can be safely serialized by Next.js
 */
export interface BookmarksServerExtendedSerializableProps {
  bookmarks?: SerializableBookmark[];
  title: string;
  description: string;
  showFilterBar?: boolean;
  titleSlug?: string;
  initialPage?: number;
  baseUrl?: string;
  usePagination?: boolean;
  initialTag?: string;
  tag?: string;
}

export type ValidatedBookmarkTag = z.infer<typeof bookmarkTagSchema>;
export type ValidatedLogoData = z.infer<typeof logoDataSchema>;
export type ValidatedRawBookmark = z.infer<typeof rawBookmarkSchema>;
export type ValidatedClientBookmark = z.infer<typeof clientBookmarkSchema>;
export type ValidatedBookmarkPagination = z.infer<typeof bookmarkPaginationSchema>;
export type ValidatedBookmarkListResponse = z.infer<typeof bookmarkListResponseSchema>;
