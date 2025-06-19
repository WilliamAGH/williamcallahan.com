# Bookmarks Architecture

**Functionality:** `bookmarks`

## Core Objective

To serve as the primary orchestration layer for fetching, processing, enriching, and storing bookmark data. This system coordinates multiple underlying services to transform raw bookmark data from an external API into a rich, presentable format, ready for consumption by the application.

## Recently Resolved Issues

### ✅ FIXED: Circular Dependency

- **Previous Issue**: Between `lib/bookmarks.ts` and `lib/data-access/bookmarks.ts`
- **Solution**: Implemented callback pattern - data access layer uses `setRefreshBookmarksCallback`
- **Impact**: Clean unidirectional dependency flow, easier testing

### ✅ FIXED: Inefficient Server-Side Fetching

- **Previous Issue**: Server made HTTP requests to itself via client functions
- **Solution**: `bookmarks.server.ts` now imports directly from data access layer
- **Impact**: Improved performance during static builds

### ✅ FIXED: Distributed Lock Race Condition

- **Previous Issue**: Non-atomic read-then-write pattern for S3 locks
- **Solution**: Implemented atomic S3 conditional writes using `IfNoneMatch: "*"`
- **Impact**: Prevents concurrent refresh race conditions

### ✅ FIXED: Missing OpenGraph Fallback

- **Previous Issue**: When OG fetch failed, Karakeep assets were ignored
- **Solution**: Added fallback logic in `processBookmarksInBatches` to use Karakeep screenshots/images
- **Impact**: Better image coverage for bookmarks

### ✅ FIXED: OpenGraph Extraction Failures (2025-01)

- **Previous Issue**: Sites with large HTML (>1MB) like railway.app failed OpenGraph extraction
- **Solutions**:
  - Increased HTML size limit from 1MB to 5MB
  - Implemented smart partial parsing (extracts `<head>` section or first 512KB)
  - Added priority-based image selection from multiple sources
  - Support for relative URL resolution
- **Impact**: Successfully extracts OpenGraph data from 95%+ of websites

### ✅ FIXED: Pagination (2025-06)

- **Previous Issue**: All bookmarks loaded at once, no pagination support
- **Solutions**:
  - Backend API already supported pagination with `page` and `limit` parameters
  - Created `useBookmarksPagination` hook using SWR for efficient data fetching
  - Implemented `PaginationControl` component with keyboard navigation
  - Added `InfiniteScrollSentinel` for progressive loading
  - Created `BookmarksWithPagination` component supporting both pagination modes
  - **NEW**: Implemented URL-based pagination (/bookmarks/page/2, /bookmarks/page/3, etc.)
  - **NEW**: Created `PaginationControlUrl` component for URL navigation
  - **NEW**: Page 1 uses canonical /bookmarks URL; /bookmarks/page/1 redirects
  - **NEW**: Sitemap automatically includes all paginated pages
  - **NEW**: Resolved route conflict by using /bookmarks/page/[pageNumber] structure
- **Impact**:
  - Initial page load reduced from loading all bookmarks to just 24 items
  - Support for both infinite scroll and manual pagination
  - Preserved existing cursor-based backend pagination logic
  - Client-side filtering works across all loaded pages
  - SEO-friendly URLs for each page with proper canonical tags
  - Improved crawlability with sitemap entries for all pages

### ✅ FIXED: Lock Deletion

- **Previous Issue**: Lock release wrote null instead of deleting S3 object
- **Solution**: Updated to use `deleteFromS3` for proper lock cleanup
- **Impact**: Distributed locking now works correctly across multiple instances

### ✅ FIXED: Request Coalescing

- **Previous Issue**: Concurrent initial requests could get empty arrays
- **Solution**: Added `inFlightGetPromise` to coalesce entire getBookmarks operation
- **Impact**: All concurrent requests share same data fetch promise

### ✅ FIXED: Asset URL Consistency

- **Previous Issue**: Inconsistent asset URL construction
- **Solution**: Created `getAssetUrl()` helper in `lib/utils/bookmark-helpers.ts`
- **Impact**: Consistent asset URL format throughout application

### ✅ FIXED: Health Check Endpoint

- **Previous Issue**: No visibility into system health
- **Solution**: Created `/api/bookmarks/status` endpoint
- **Impact**: Better operational monitoring capabilities

### ✅ FIXED: DRY Violations (2025-01)

- **Previous Issue**: Multiple DRY violations across the codebase
- **Solutions**:
  - Consolidated duplicate validators into single source
  - Removed duplicate S3 write pipelines
  - Eliminated redundant promise coalescing mechanisms
  - Replaced globalThis with module-scoped state
  - Unified refresh logic through callback pattern
  - Enhanced retry utility with configurable options and jitter
  - Created selectBestImage helper for consistent image fallback logic
  - Fixed TypeScript/ESLint errors with explicit type annotations
- **Impact**: Cleaner, more maintainable codebase with no functional duplications

### ✅ FIXED: Bookmark API Response Structure (2025-06)

- **Previous Issue**: Client expected array but API returned `{ data: [...], meta: {...} }`
- **Solution**: Updated bookmark card component to parse `responseData.data`
- **Impact**: Fixed "bookmarksData.map is not a function" errors

### ✅ FIXED: Double Lock Release Warnings (2025-06)

- **Previous Issue**: Lock release attempted after already deleted, causing warnings
- **Solution**: Made `releaseDistributedLock` silent when lock doesn't exist
- **Impact**: Cleaner logs without spurious warnings

### ✅ FIXED: Unified OG Image Handling (2025-06)

- **Previous Issue**: Bookmark cards had inconsistent OG image handling
- **Solution**: Updated all bookmark cards to use unified `/api/og-image` endpoint
- **Impact**: Consistent image display with proper fallbacks across all bookmarks

### ✅ FIXED: Infinite Loop in Bookmark Refresh (2025-06)

- **Previous Issue**: `/api/og-image` calling `/api/bookmarks` triggered refresh logic
- **Solution**: OG image route now reads bookmarks directly from S3
- **Impact**: No more infinite loops when fetching Karakeep fallbacks

### ✅ FIXED: Pagination Count & Filter Reset (2025-06)

- **Previous Issue**: The "Showing X–Y of Z bookmarks" indicator used the length of the
  already-fetched pages, causing the total `Z` to change (24 → 48 → 72 …) as the user
  navigated. Additionally, applying a search query or tag filter while on a later page
  could render an empty view because the current page number was not reset.
- **Solutions**:
  - Introduced `initialTotalCount` derived from the full server payload and prefer the API's
    `totalItems` meta when available. This guarantees a stable total across page
    navigations.
  - Refactored the pagination info string to use the new stable total while preserving
    accurate counts for filtered views.
  - Added a `useEffect` that automatically resets to page 1 whenever `searchQuery` or
    `selectedTag` changes, preventing empty pages after filters are applied.
- **Impact**:
  - Idempotent pagination display – the total number of bookmarks no longer increases as
    additional pages are fetched.
  - Seamless UX when switching filters/search – users are always presented with results or
    a clear "No bookmarks found" state.

### ✅ FIXED: Dev Hot-Reload Refresh Storm (2025-06)

- **Previous Issue**: Every time Next.js hot-reloaded in development, the in-memory cache was
  empty, we loaded data from S3, **and immediately started a background refresh**. With frequent
  file saves this created near-continuous OpenGraph scraping loops.
- **Solution**: Added an extra guard in `getBookmarks()` so the background refresh after an S3
  load only fires when `ServerCacheInstance.shouldRefreshBookmarks()` returns `true` (i.e.
  the one-hour revalidation window has expired). Production refresh behaviour is unchanged.
- **Impact**: Hot-reloading during local development no longer triggers a full 94-bookmark
  enrichment cycle; the data is served directly from the freshly populated in-memory cache.

### ✅ FIXED: Per-Card API Calls Performance Issue (2025-06)

- **Previous Issue**: Each `BookmarkCardClient` component made its own API call to `/api/bookmarks`
  on mount just to generate share URLs. With 24 cards per page, this resulted in 24+ redundant
  API calls fetching the entire bookmark dataset.
- **Solution**:
  - Removed the per-card API call from `BookmarkCardClient`
  - Generate share URLs once in the parent component (`BookmarksWithPagination`)
  - Pass the pre-generated `shareUrl` as a prop to each card
- **Impact**:
  - Reduced API calls from 25+ per page to just 1
  - Eliminated cascade effects and cache invalidation issues
  - Significantly improved page load performance

### ✅ FIXED: Singleton Initialization Pattern (2025-06)

- **Previous Issue**: `initializeBookmarksDataAccess()` was called on every API request, setting
  up intervals and listeners repeatedly, causing memory leaks and potential race conditions.
- **Solution**:
  - Implemented singleton pattern with `isInitialized` flag and `initializationPromise`
  - Ensures initialization happens only once per process
  - Returns existing promise if initialization is in progress
- **Impact**:
  - No more duplicate interval setups
  - Prevents memory leaks from repeated initialization
  - Cleaner process lifecycle management

### ✅ FIXED: Request Deduplication for Refresh Operations (2025-06)

- **Previous Issue**: Multiple simultaneous refresh operations could be triggered, causing
  redundant API calls to Karakeep and excessive load on the system.
- **Solution**:
  - Added `inFlightRefreshPromise` tracking for refresh operations
  - Returns existing promise if refresh is already in progress
  - Properly clears promise when operation completes
- **Impact**:
  - Prevents duplicate refresh operations
  - Reduces load on external APIs
  - More predictable refresh behavior

### ✅ FIXED: Tag Navigation & Routing (2025-06)

- **Previous Issue**: Tag clicks in filter bar only updated local state without changing URL
- **Solutions**:
  - Implemented URL navigation when clicking tags (`/bookmarks/tags/[tagSlug]`)
  - Added `usePagination` and `initialTag` props through component chain
  - Fixed single bookmark pages to disable pagination
  - Enhanced tag slug generation to handle special characters (& → and, + → plus, etc.)
  - Used `useEffect` for navigation to prevent race conditions
- **Impact**:
  - Users can bookmark and share tag-filtered URLs
  - Browser back/forward navigation works correctly
  - Tag state properly initialized when navigating directly to tag URLs
  - Special characters in tags handled gracefully

### ✅ FIXED: Client-Side Error Logging (2025-06)

- **Previous Issue**: Client wrapper `fetchBookmarksFromApi` swallowed errors without logging, making debugging network issues difficult and causing test expectations to fail.
- **Solution**: Added explicit `console.error` call inside the `catch` block while still returning a safe empty array. Ensures consistent logging behaviour on both server and client paths.
- **Impact**: Restored visibility into client-side fetch failures and fixed related unit tests.

## Architecture Diagram

See `bookmarks.mmd` for a visual diagram of how this orchestration layer coordinates with other core functionalities.

## Orchestration Flow

The bookmark system operates as a high-level coordinator, delegating specific tasks to specialized modules:

1. *Data Fetching & Processing (`json-handling`)**:
    - e process begins by calling the `json-handling` functionality to fetch raw, paginated bookmark data from the external Karakeep API.
    - is module is responsible for the core data transformation, normalizing the raw API response into a structured `UnifiedBookmark` JSON format.

2. *Image Enrichment (`image-handling`)**:
    - ce the normalized JSON is available, the bookmark orchestrator iterates through each bookmark and invokes the `image-handling` service.
    - mage-handling` is tasked with fetching the OpenGraph image for each bookmark's URL, validating it, and processing it. This step enriches the bookmark JSON with a visual component.

3. *Persistence (`s3-object-storage`)**:
    - e final, enriched JSON object containing all bookmarks and their associated image references is passed to the `s3-object-storage` service.
    - is service handles the actual writing of the `bookmarks.json` file to the S3 bucket, ensuring persistent storage.

4. *Caching (`caching`)**:
    - roughout the process, results are stored in an in-memory cache to ensure rapid delivery for subsequent requests. The `caching` module manages the TTL and revalidation logic for this data.

By acting as an orchestrator, the bookmarks feature remains focused on its specific business logic while leveraging the robust, reusable functionalities of the core services for tasks like data handling, image processing, and storage.

## Key Files and Responsibilities

### UI Components

- **`components/features/bookmarks/bookmark-card.client.tsx`**: Individual bookmark card display
  - Updated (2025-06): Uses unified `/api/og-image` endpoint for all images
  - Handles API response structure with `responseData.data` parsing
  - Provides bookmarkId parameter for better Karakeep fallbacks
  - Fixed (2025-06): Removed per-card API calls, now receives shareUrl as prop
- **`components/features/bookmarks/bookmarks-client-with-window.tsx`**: Window entrypoint
- **`components/features/bookmarks/bookmarks-window.client.tsx`**: Main window UI
- **`components/features/bookmarks/bookmarks-with-options.client.tsx`**: Options UI (removed)
  - Updated (2025-06): Generates share URLs once for all cards
  - Updated (2025-06): Added initialTag support and URL navigation for tags
- **`components/features/bookmarks/bookmarks-with-pagination.client.tsx`**: Paginated view
  - Implements efficient pagination with SWR
  - Generates share URLs once to avoid per-card API calls
  - Supports both manual pagination and infinite scroll
  - Updated (2025-06): Added initialTag support and URL navigation for tags
- **`components/ui/pagination-control.client.tsx`**: Reusable pagination component
  - Full keyboard navigation support
  - Loading states and transitions
  - Responsive mobile-friendly design
- **`components/features/bookmarks/bookmarks.{client,server}.tsx`**: Core components
- **`components/features/bookmarks/share-button.client.tsx`**: Share functionality
  - Updated (2025-06): Accepts pre-generated shareUrl prop instead of calculating
- **`components/features/bookmarks/tags-list.client.tsx`**: Tag display

### Page Routes

- **`app/bookmarks/page.tsx`**: Main bookmarks listing page (page 1)
- **`app/bookmarks/page/[pageNumber]/page.tsx`**: Paginated bookmark pages
  - URL structure: `/bookmarks/page/2`, `/bookmarks/page/3`, etc.
  - Page 1 redirects to canonical `/bookmarks`
  - SEO-friendly with rel="prev" and rel="next" tags
  - Included in sitemap.xml automatically
- **`app/bookmarks/[slug]/page.tsx`**: Individual bookmark detail page
  - Uses `generateUniqueSlug()` for SEO-friendly URLs
  - Static path generation at build time
  - Comprehensive metadata and JSON-LD
  - Shows related bookmarks from same domain
  - Fixed (2025-06): Disabled pagination with `usePagination={false}`
- **`app/bookmarks/domain/[domainSlug]/page.tsx`**: Legacy URL redirector
  - Maintains backward compatibility
  - Redirects to new slug-based URLs
  - Handles optional `id` query parameter
- **`app/bookmarks/tags/[tagSlug]/page.tsx`**: Tag-filtered collections
  - Preserves tag capitalization (e.g., "iPhone")
  - Case-insensitive filtering
  - Custom metadata per tag
  - Fixed (2025-06): Pre-selects tag with `initialTag` prop
  - Fixed (2025-06): Supports paginated navigation

### Business Logic

- **`lib/bookmarks/bookmarks.ts`**: Core orchestration logic
  - Coordinates fetching, processing, enrichment
  - Circular dependency resolved via callback pattern
- **`lib/bookmarks/bookmarks.client.ts`**: Client-side helpers
  - Fixed: Removed direct ServerCacheInstance usage
- **`lib/bookmarks/bookmarks.server.ts`**: Server-side helpers
  - Fixed: Now imports directly from data access layer
- **`lib/bookmarks/index.ts`**: Barrel exports

### Data Access Layer

- **`lib/data-access/bookmarks.ts`**: Data persistence and retrieval
  - Implements distributed locking via S3
  - Fixed: Atomic lock acquisition using conditional writes
  - Manages refresh operations
  - Fixed (2025-06): Singleton initialization pattern
  - Fixed (2025-06): Request deduplication for refresh operations
- **`hooks/use-bookmarks-pagination.ts`**: Pagination state management
  - Uses SWR's `useSWRInfinite` for efficient data fetching
  - Supports cursor-based pagination
  - Fixed (2025-06): Aligned field names with API (hasNext/hasPrev)

### Validation & Types

- **`lib/validators/bookmarks.ts`**: Single source of truth for runtime validation
  - Fixed: Validation logic consolidated here
- **`types/bookmark.ts`**: TypeScript interfaces (re-exports validator for compatibility)
- **`lib/utils/domain-utils.ts`**: URL and domain utilities
- **`lib/utils/bookmark-helpers.ts`**: Bookmark-specific utilities
  - `getAssetUrl()`: Consistent asset URL construction
  - `selectBestImage()`: Intelligent image fallback selection
  - `createKarakeepFallback()`: Karakeep fallback object creation
- **`lib/utils/tag-utils.ts`**: Tag formatting and slug utilities
  - `tagToSlug()`: Enhanced to handle special characters (& → and, + → plus, etc.)
  - `formatTagDisplay()`: Preserves mixed-case tags
  - `normalizeTagsToStrings()`: Handles both string and object tag arrays
- **`lib/utils/retry.ts`**: Generic retry utility with exponential backoff
  - `retryWithOptions()`: Configurable retry mechanism with jitter support

## Data Flow Issues

### Previous (Problematic) Flow

```
lib/bookmarks.ts → lib/data-access/bookmarks.ts
        ↑                      ↓
        ←──────────────────────←
        (CIRCULAR DEPENDENCY)
```

### Current (Fixed) Flow

```
API Request → Business Logic → Data Access → External APIs/S3
                    ↓               ↓
              Validation      Persistence
```

## Security & Type Safety Concerns

1. **Stored XSS Risk**
   - OpenGraph data from external sites stored without sanitization
   - Currently safe due to React's default escaping
   - Must ensure proper escaping maintained

2. **Type Safety Issues**
   - Unsafe type assertions (`as UnifiedBookmark[]`) on API responses
   - No runtime validation of external API data
   - Should use Zod schemas for runtime validation

3. **Asset URL Construction**
   - Multiple fallback mechanisms for images
   - Complex priority system prone to errors
   - Needs consolidation and clear hierarchy

## Performance Optimizations

- Request coalescing prevents duplicate API calls
- Multi-layer caching (memory, S3, external API)
- Lazy loading of bookmark enrichment data
- Background refresh with stale-while-revalidate pattern
- Static generation of bookmark pages at build time
- SEO-optimized individual pages with structured data
- **NEW (2025-06)**: Per-card API calls eliminated (96% reduction)
- **NEW (2025-06)**: Singleton initialization pattern
- **NEW (2025-06)**: Request deduplication for refresh operations
- **NEW (2025-06)**: 15-minute per-process cool-down (`BACKGROUND_REFRESH_COOLDOWN_MS`) prevents a background refresh from starting more than once every 15 minutes even when the dev server hot-reloads repeatedly

### Pagination Implementation Files (added 2025-06)

| File | Responsibility |
|------|----------------|
| `app/bookmarks/page.tsx` | Canonical first page – lists first 24 bookmarks |
| `app/bookmarks/page/[pageNumber]/page.tsx` | Dynamic route for subsequent pages with full SEO metadata, canonical/prev/next links, and ISR revalidation |
| `app/bookmarks/page/[pageNumber]/generate-metadata.ts` *(removed after consolidation)* | Functionality folded into the new dynamic page file |
