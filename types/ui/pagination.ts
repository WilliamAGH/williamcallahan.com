/**
 * Pagination Component Types
 *
 * SCOPE: Types for pagination controls.
 */

/**
 * Comprehensive pagination control props with loading states and customization options
 */
export interface PaginationControlProps {
  /** Current page number (1-indexed) */
  currentPage?: number;
  /** Total number of pages */
  totalPages?: number;
  /** Total number of items across all pages */
  totalItems?: number;
  /** Number of items per page */
  itemsPerPage?: number;
  /** Callback when page changes */
  onPageChange?: (page: number) => void;
  /** Whether pagination is currently loading */
  isLoading?: boolean;
  /** Whether pagination is disabled */
  disabled?: boolean;
  /** Whether to show first/last page buttons */
  showFirstLast?: boolean;
  /** Whether to show page information text */
  showPageInfo?: boolean;
  /** Maximum number of visible page buttons */
  maxVisiblePages?: number;
  /** Custom CSS classes */
  className?: string;
}

export interface PaginationControlUrlProps extends PaginationControlProps {
  /** Base URL for page links */
  baseUrl?: string;
  /** URL parameter name for page number */
  pageParam?: string;
}
