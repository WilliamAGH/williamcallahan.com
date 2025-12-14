/**
 * UI Component Types Index
 *
 * SCOPE: Re-exports all generic UI component props from their modular files.
 * USAGE: Central export point for all generic UI component types.
 *
 * This index provides a single import point for all generic UI component props
 * while maintaining clear separation of concerns in their own files.
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

export * from "./async";
export * from "./boundaries";
export * from "./code-block";
export * from "./data-display";
export * from "./forms";
export * from "./image";
export * from "./interactive";
export * from "./layout";
export * from "./pagination";
export * from "./social";
export * from "./table";
export * from "./tabs";
export type {
  TerminalProps,
  CommandInputProps,
  TerminalContextValue,
  TerminalContextType,
  TerminalHeaderProps,
  SelectionViewProps,
  HistoryProps,
  SectionKey,
  TerminalWindowStateContextType,
  TerminalWindowStateProviderProps,
} from "./terminal";
export * from "./window";
