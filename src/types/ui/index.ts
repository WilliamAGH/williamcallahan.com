/**
 * UI Base Component Types
 *
 * SCOPE: Shared base interfaces used across UI and feature type modules.
 */

// Base interfaces for common UI patterns
export interface BaseComponentProps {
  /** Optional CSS classes */
  className?: string;
}

export interface BasePaginatedProps extends BaseComponentProps {
  /** Items per page */
  itemsPerPage?: number;
  /** Current page */
  currentPage?: number;
  /** Total pages */
  totalPages?: number;
}

export interface BaseFilterableProps extends BaseComponentProps {
  /** Whether to show filter bar */
  showFilterBar?: boolean;
  /** Initial filter tag */
  initialTag?: string;
  /** Whether to search all bookmarks via API */
  searchAllBookmarks?: boolean;
}
