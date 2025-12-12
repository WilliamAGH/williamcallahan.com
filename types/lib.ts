/**
 * Library and Utility Types
 *
 * SCOPE: Generic utility types, library function types, and shared patterns
 *
 * This file contains ONLY generic, reusable type definitions that support
 * the application's infrastructure layer (lib/, hooks/, utils/).
 *
 * === CLEAR INCLUSION RULES ===
 * ✅ DO ADD:
 *   - Generic utility function return types (e.g., RetryResult<T>)
 *   - Shared configuration types (e.g., CacheOptions, RetryOptions)
 *   - Infrastructure types (async operations, job queues, rate limiting)
 *   - Hook return/config types that are domain-agnostic
 *   - Generic response/result wrapper types
 *   - Cross-cutting concern types (validation, middleware, scheduling)
 *
 * === CLEAR EXCLUSION RULES ===
 * ❌ DO NOT ADD:
 *   - Component props (→ types/ui.ts or types/features/*)
 *   - Domain entities (→ types/bookmark.ts, types/blog.ts, etc.)
 *   - API request/response types (→ types/api.ts)
 *   - Domain-specific business logic types
 *   - Types that are only used in ONE specific domain
 *
 * === ORGANIZATION PRINCIPLES ===
 * 1. Group related types together in clear sections
 * 2. Use consistent naming: *Config, *Options, *Result, *Response
 * 3. Prefer generic types over domain-specific ones
 * 4. Document the PURPOSE of each type, not just its structure
 * 5. Keep types as minimal as possible - avoid optional properties unless necessary
 *
 * @see types/ui.ts for UI component props
 * @see types/features/ for domain-specific component props
 * @see types/api.ts for API request/response types
 * @see types/component-types.ts for architectural patterns
 */

import type { CacheStats } from "./cache";

// Safe Zod import for types directory only
import { z } from "zod";

// =============================================================================
// CORE UTILITY TYPES - Foundation types used across multiple domains
// =============================================================================

/** Generic result type with discriminated union */
export type Result<T, E = Error> =
  | { success: true; data: T; error?: never }
  | { success: false; data?: never; error: E };

/** Result with metadata */
export type ResultWithMeta<T, M = Record<string, unknown>, E = Error> = Result<T, E> & { meta?: M };

/** Async operation states */
export type AsyncStatus = "idle" | "pending" | "success" | "error" | "cancelled";

/** Make all Date fields strings (for serialization) */
export type Serializable<T> = T extends Date ? string : T extends object ? { [K in keyof T]: Serializable<T[K]> } : T;

/** Add className to any type */
export type WithClassName<T = object> = T & { className?: string };

/** Standard operation status for any async operation */
export type OperationStatus = AsyncStatus;

/** EventEmitter static interface to avoid direct node:events reference in Edge runtime */
export interface EventEmitterStatic {
  defaultMaxListeners: number;
}

/** Generic result wrapper for operations that can succeed or fail */
export interface OperationResult<T = unknown, E = Error> {
  /** Whether operation succeeded */
  success: boolean;
  /** Result data if successful */
  data?: T;
  /** Error if operation failed */
  error?: E;
  /** Operation duration in milliseconds */
  duration: number;
}

/** Generic configuration interface for operations with retry logic */
export interface RetryConfig {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number;
  /** Base delay in milliseconds for exponential backoff (default: 1000) */
  baseDelay?: number;
  /** Maximum backoff time in milliseconds (default: 30000) */
  maxBackoff?: number;
  /** Whether to add jitter to prevent thundering herd (default: false) */
  jitter?: boolean;
  /** Custom function to determine if an error is retryable */
  isRetryable?: (error: unknown) => boolean;
  /** Callback for each retry attempt */
  onRetry?: (error: unknown, attempt: number) => void;
  /** Whether to log debug messages */
  debug?: boolean;
}

/** Extended result that includes retry information */
export interface RetryResult<T> extends OperationResult<T> {
  /** Number of attempts made */
  attempts: number;
}

// =============================================================================
// REQUEST CONTEXT - Infrastructure for request tracking and logging
// =============================================================================

/** Request context for structured logging and tracing */
export interface RequestContext {
  requestId: string;
  operation?: string;
  userId?: string;
  metadata?: Record<string, unknown>;
}

// =============================================================================
// ASYNC OPERATIONS & JOB QUEUE - Infrastructure for background processing
// =============================================================================

/** A function that can be executed as a job in the async queue */
export type Job = () => Promise<void> | void;

/**
 * S3-based distributed lock for coordinating refreshes across multiple instances.
 */
export interface DistributedLockEntry {
  instanceId: string;
  acquiredAt: number;
  ttlMs: number;
}

/**
 * Configuration options for the distributed lock
 */
export interface LockConfig {
  /** S3 key where the lock will be stored */
  lockKey: string;
  /** Unique identifier for this instance */
  instanceId: string;
  /** Time-to-live for the lock in milliseconds */
  ttlMs: number;
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number;
  /** Category for logging (default: "DistributedLock") */
  logCategory?: string;
}

/**
 * Result of a lock acquisition attempt
 */
export interface LockResult {
  /** Whether the lock was successfully acquired */
  success: boolean;
  /** The lock entry if acquired */
  lockEntry?: DistributedLockEntry;
  /** Reason for failure if not successful */
  reason?: string;
}

/**
 * Type for the distributed lock instance
 */
export type DistributedLock = {
  instanceId: string;
  acquire(): Promise<boolean>;
  release(force?: boolean): Promise<void>;
  cleanup(): Promise<void>;
};

/** Lock entry shape used by S3-based distributed lock */
export interface LockEntry {
  instanceId: string;
  acquiredAt: number;
  operation: string;
}

/**
 * Abstraction for distributed lock persistence.
 * Default implementation is S3-backed; tests may inject an in-memory store.
 */
export interface LockStore {
  read(key: string): Promise<LockEntry | null>;
  createIfAbsent(key: string, value: LockEntry): Promise<boolean>;
  delete(key: string): Promise<void>;
  list(prefix: string): Promise<string[]>;
}

/**
 * Callback function type for refreshing bookmarks data.
 */
export type RefreshBookmarksCallback = (force?: boolean) => Promise<import("./bookmark").UnifiedBookmark[] | null>;

export type AsyncJobType = "opengraph" | "image" | "data-fetch" | "cache-cleanup";

/** Job definition for async task processing */
export interface AsyncJob {
  id: string;
  type: AsyncJobType;
  payload: Record<string, unknown>;
  priority?: number;
  retryCount?: number;
  maxRetries?: number;
  createdAt?: Date;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
}

/** Real-time tracking of async operations */
export interface AsyncOperation {
  id: string;
  status: OperationStatus;
  startTime: number;
  endTime?: number;
  error?: string;
  progress?: number;
  metadata?: Record<string, unknown>;
}

/** Monitored async operation for the operations monitor */
export interface MonitoredAsyncOperation {
  name: string;
  startTime: number;
  endTime?: number;
  status: "pending" | "completed" | "failed" | "timeout";
  error?: string;
  metadata?: Record<string, unknown>;
}

// =============================================================================
// CACHING SYSTEM - Generic caching infrastructure
// =============================================================================

/** Cache entry wrapper with metadata */
export interface CacheEntry<T = unknown> {
  data: T;
  expiresAt: number;
  createdAt: number;
  accessCount?: number;
  lastAccessedAt?: number;
  key: string;
}

/** Configuration for cache behavior */
export interface CacheConfig {
  /** Time to live in milliseconds */
  ttl?: number;
  /** Whether to refresh TTL on access */
  refreshTtlOnAccess?: boolean;
  /** Maximum cache size */
  maxSize?: number;
  /** Cache eviction strategy */
  evictionStrategy?: "lru" | "lfu" | "fifo";
}

// =============================================================================
// RATE LIMITING - Traffic control infrastructure
// =============================================================================

/** Rate limiter configuration */
export interface RateLimiterConfig {
  maxRequests: number;
  windowMs: number;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
}

/** Rate limit tracking record for internal store */
export interface RateLimitRecord {
  count: number;
  resetAt: number;
}

/** Current rate limit status */
export interface RateLimitInfo {
  totalHits: number;
  remainingPoints: number;
  msBeforeNext: number;
  isBlocked: boolean;
}

/** Circuit breaker state for rate limiter */
export interface CircuitBreakerState {
  failures: number;
  lastFailureTime: number;
  state: "closed" | "open" | "half-open";
}

/** Circuit breaker configuration */
export interface CircuitBreakerConfig {
  /** Number of failures before opening circuit */
  failureThreshold?: number;
  /** Time in ms before attempting to close circuit */
  resetTimeout?: number;
  /** Number of requests allowed in half-open state */
  halfOpenRequests?: number;
}

// =============================================================================
// SEARCH SYSTEM - Generic search infrastructure
// =============================================================================

export type SearchScope =
  | "all"
  | "bookmarks"
  | "blog"
  | "projects"
  | "investments"
  | "experience"
  | "education"
  | "posts";
export type SearchResultType = "bookmark" | "blog-post" | "project" | "page" | "tag";

/** Search query specification */
export interface SearchQuery {
  query: string;
  scope?: SearchScope;
  limit?: number;
  offset?: number;
  includeHighlights?: boolean;
}

/** Individual search result */
export interface SearchResult {
  id: string;
  type: SearchResultType;
  title: string;
  description?: string;
  url: string;
  score: number;
  highlights?: string[];
  metadata?: Record<string, unknown>;
}

/** Search result with relevance score wrapper (used by searchContent) */
export type ScoredResult<T> = { item: T; score: number };

/** Search operation response */
export interface SearchResponse {
  results: SearchResult[];
  total: number;
  duration: number;
  query: SearchQuery;
}

// =============================================================================
// VALIDATION SYSTEM - Generic validation infrastructure
// =============================================================================

/** Single validation rule definition */
export interface ValidationRule<T = unknown> {
  name: string;
  validate: (value: T) => boolean | Promise<boolean>;
  message: string;
  required?: boolean;
}

// Common validation schemas - safe to define here as simple coercion schema
export const PageNumberSchema = z.coerce.number().int().min(1);

/** Complete validation schema */
export interface ValidationSchema<T = Record<string, unknown>> {
  name: string;
  rules: Record<keyof T, ValidationRule[]>;
  customValidation?: (data: T) => ValidationResult;
}

/** Validation operation result */
export interface ValidationResult {
  isValid: boolean;
  errors: Record<string, string[]>;
  warnings?: Record<string, string[]>;
  data?: unknown;
}

// =============================================================================
// WINDOW MANAGEMENT - UI state management for windowed interfaces
// =============================================================================

export type WindowStateStatus = "maximized" | "minimized" | "normal" | "fullscreen";

/** Window state representation */
export interface WindowState {
  id: string;
  type: string;
  state: WindowStateStatus;
  isActive: boolean;
  position?: { x: number; y: number };
  dimensions?: { width: number; height: number };
  zIndex?: number;
  metadata?: Record<string, unknown>;
}

/** Window management interface */
export interface WindowStateManager {
  getState: (windowId: string) => WindowState | undefined;
  setState: (windowId: string, state: Partial<WindowState>) => void;
  registerWindow: (window: WindowState) => void;
  unregisterWindow: (windowId: string) => void;
  getAllWindows: () => WindowState[];
  focusWindow: (windowId: string) => void;
}

// =============================================================================
// GLOBAL CONTEXT TYPES - Application-wide state management
// =============================================================================

/** Global window registry state */
export interface GlobalWindowRegistryState {
  windows: Map<string, WindowState>;
  activeWindowId?: string;
  nextZIndex: number;
}

/** Generic dropdown state management */
export interface DropdownState {
  isOpen: boolean;
  id: string;
  toggle: () => void;
  open: () => void;
  close: () => void;
}

// =============================================================================
// HOOK TYPES - Custom hook interfaces and return types
// =============================================================================

/** Window size hook result */
export interface UseWindowSizeResult {
  /** Current window width (undefined during SSR) */
  width: number | undefined;
  /** Current window height (undefined during SSR) */
  height: number | undefined;
}

/** SVG transform fix hook result */
export interface UseFixSvgTransformsResult {
  isFixed: boolean;
  applyFixes: (element: HTMLElement | null) => void;
}

// Type aliases for pagination
export type PaginationMeta = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
};

export type PaginatedResponse<T> = {
  data: T[];
  meta: { pagination: PaginationMeta };
};

// =============================================================================
// DATA FETCHING - Generic data access patterns
// =============================================================================

/** Configuration for data fetch operations */
export interface DataFetchOptions {
  useCache?: boolean;
  cacheTtl?: number;
  background?: boolean;
  timeout?: number;
  retry?: RetryConfig;
}

/** Data fetch operation result */
export interface DataFetchResult<T> extends OperationResult<T> {
  fromCache: boolean;
  statusCode?: number;
}

/**
 * Result of attempting to read and parse a JSON object by key.
 */
export interface ReadJsonResult<T = unknown> {
  key: string;
  /** Whether the key exists in the backing store */
  exists: boolean;
  /** Whether the read/parse operation was successful */
  ok: boolean;
  /** Optional diagnostic details */
  details?: unknown;
  /** Error message if the operation failed */
  error?: string;
  /** Parsed value, or null when explicitly present-but-null */
  parsed?: T | null;
}

/** Data fetch manager interface */
export interface DataFetchManager {
  fetch: <T>(key: string, fetcher: () => Promise<T>, options?: DataFetchOptions) => Promise<DataFetchResult<T>>;
  invalidate: (key: string) => void;
  clearCache: () => void;
  getCacheStats: () => CacheStats;
}

/**
 * Configuration for the data fetch manager
 */
export interface DataFetchConfig {
  bookmarks?: boolean;
  githubActivity?: boolean;
  logos?: boolean;
  searchIndexes?: boolean;
  forceRefresh?: boolean;
  testLimit?: number;
  immediate?: boolean; // For new bookmark logo processing
}

/**
 * Result summary of a data fetch operation set.
 */
export interface DataFetchOperationSummary {
  success: boolean;
  operation: string;
  itemsProcessed?: number;
  error?: string;
  duration?: number;
  // Optional standardized fields for bookmarks refresh parity
  changeDetected?: boolean;
  lastFetchedAt?: number;
}

// =============================================================================
// CLI FLAGS - Command-line interface types
// =============================================================================

/**
 * Valid CLI flag values for data updater operations
 * Used by scheduler, data-updater, and data-fetch-manager
 */
export type DataUpdaterFlag =
  | "--bookmarks"
  | "--github"
  | "--logos"
  | "--search-indexes"
  | "--force"
  | "--metadata-only"
  | "--metadata-limit"
  | "--testLimit="
  | "--help"
  | "-h"
  | "--allow-build-writes";

// =============================================================================
// SCHEDULING SYSTEM - Task scheduling infrastructure
// =============================================================================

/** Scheduled task definition */
export interface ScheduledTask {
  id: string;
  name: string;
  schedule: string;
  handler: () => Promise<void>;
  enabled: boolean;
  lastRun?: Date;
  nextRun?: Date;
  metadata?: Record<string, unknown>;
}

/** Scheduler configuration */
export interface SchedulerConfig {
  enabled: boolean;
  timezone?: string;
  maxConcurrentTasks?: number;
}

/** Task execution result */
export interface TaskExecutionResult {
  taskId: string;
  success: boolean;
  duration: number;
  error?: Error;
  executedAt: Date;
}

// =============================================================================
// IMAGE PROCESSING - Generic image utilities
// =============================================================================

/** Image analysis result */
export interface ImageAnalysisResult {
  dimensions?: { width: number; height: number };
  colors?: string[];
  format?: string;
  fileSize?: number;
  isValid: boolean;
  error?: string;
}

/** Image comparison result */
export interface ImageCompareResult {
  similarity: number;
  isSimilar: boolean;
  method: string;
  metadata?: Record<string, unknown>;
}

/** Image processing configuration */
export interface ImageProcessingOptions {
  width?: number;
  height?: number;
  quality?: number;
  format?: "jpeg" | "png" | "webp";
  maintainAspectRatio?: boolean;
}

// =============================================================================
// UTILITY PROCESSING - Text and data processing options
// =============================================================================

/** Text sanitization configuration */
export interface SanitizationOptions {
  stripHtml?: boolean;
  encodeHtml?: boolean;
  trim?: boolean;
  maxLength?: number;
  allowedTags?: string[];
}

/** Tag processing configuration */
export interface TagProcessingOptions {
  normalize?: boolean;
  lowercase?: boolean;
  removeDuplicates?: boolean;
  maxTags?: number;
  separator?: string;
}

/** URL processing configuration */
export interface UrlProcessingOptions {
  normalize?: boolean;
  validate?: boolean;
  resolveRedirects?: boolean;
  timeout?: number;
}

// =============================================================================
// REQUEST LOGGING - Server-side request tracking
// =============================================================================

/** Server-side request log entry */
export interface RequestLog {
  timestamp: string;
  type: "server_pageview";
  data: {
    path: string;
    fullPath: string;
    method: string;
    clientIp: string;
    userAgent: string;
    referer: string;
  };
}

// =============================================================================
// SCRIPT UTILITIES - Types for build/maintenance scripts
// =============================================================================

/** Repository reference for script operations */
export interface RepoToUpdate {
  owner: string;
  name: string;
}

/** Sitemap submission result */
export interface SitemapSubmissionResult {
  success: boolean;
  message: string;
  url?: string;
  error?: string;
}

/** S3 storage paths for bookmarks configuration */
export interface BookmarksS3Paths {
  /** S3 directory for bookmark files */
  DIR: string;
  /** Full S3 path to bookmarks data file */
  FILE: string;
  /** Directory containing per-bookmark JSON files */
  BY_ID_DIR: string;
  /** Full S3 path to refresh lock file */
  LOCK: string;
  /** S3 path to lightweight bookmark index */
  INDEX: string;
  /** S3 path prefix for paginated bookmark files */
  PAGE_PREFIX: string;
  /** S3 path prefix for tag-filtered bookmark files */
  TAG_PREFIX: string;
  /** S3 path prefix for tag index files */
  TAG_INDEX_PREFIX: string;
  /** Heartbeat file for operational checks */
  HEARTBEAT: string;
  /** S3 path to bookmark slug mapping */
  SLUG_MAPPING: string;
  /** Directory containing slug shard JSON files */
  SLUG_SHARDS_DIR: string;
  /** Prefix used to build individual slug shard paths */
  SLUG_SHARD_PREFIX: string;
}

/** URL validation result */
export interface UrlValidationResult {
  url: string;
  isValid: boolean;
  statusCode?: number;
  error?: string;
  redirectUrl?: string;
}

/** Google Indexing API notification metadata */
export interface GoogleIndexingUrlNotificationMetadata {
  /** The URL that was queried */
  url: string;
  /** Latest update information if available */
  latestUpdate?: {
    /** The URL that was updated */
    url: string;
    /** Type of notification sent */
    type: "URL_UPDATED" | "URL_DELETED";
    /** ISO timestamp when the notification was sent */
    notifyTime: string;
  };
}
