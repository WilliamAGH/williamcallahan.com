/**
 * Asynchronous UI Component Types
 *
 * SCOPE: Types for components dealing with asynchronous operations like infinite scroll.
 */

export interface InfiniteScrollSentinelProps {
  /** Callback when sentinel comes into view */
  onIntersect: () => void;
  /** Whether loading is in progress */
  loading?: boolean;
  /** Whether there are more items to load */
  hasMore?: boolean;
  /** Root margin for intersection observer */
  rootMargin?: string;
  /** Intersection threshold */
  threshold?: number;
  /** Optional children to render when not loading */
  children?: React.ReactNode;
}
