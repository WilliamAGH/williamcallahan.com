# Caching Architecture

**Functionality:** `caching`

## Core Objective

High-performance multi-tiered caching with request coalescing, distributed locking, cache invalidation, and memory-safe operations using Next.js 15's native 'use cache' directive and a simple Map-based server cache implementation.

## Architecture Diagram

See `caching.mmd` for visual flow and migration status.

## Caching Implementation Inventory

### Files Using Next.js 15 'use cache' Directive (9 files)

- `lib/search.ts` - Search functionality with tag-based caching
- `lib/bookmarks/bookmarks-data-access.server.ts` - Bookmarks data access
- `lib/data-access/github-public-api.ts` - GitHub API caching
- `lib/blog/mdx.ts` - Blog post caching
- `lib/data-access/images.server.ts` - Image data caching
- `lib/data-access/opengraph.ts` - OpenGraph metadata caching
- `lib/image-handling/image-manifest-loader.ts` - Image manifest caching
- `lib/image-handling/cached-manifest-loader.ts` - Cached manifest operations
- `lib/s3-cache-utils.ts` - S3 cache utilities

### Files Using Next.js Cache Functions (7 files)

- `lib/search.ts` - revalidateTag for search cache
- `lib/bookmarks/bookmarks-data-access.server.ts` - revalidateTag for bookmarks
- `lib/data-access/github.ts` - revalidateTag for GitHub data
- `lib/blog/mdx.ts` - revalidateTag for blog posts
- `lib/data-access/images.server.ts` - revalidateTag for images
- `app/api/cache/bookmarks/route.ts` - revalidateTag endpoint
- `scripts/test-cache-invalidation.ts` - testing cache invalidation

### ServerCacheInstance Users (33 files)

**Data Access & Business Logic:**

- `lib/data-access/opengraph.ts`
- `lib/data-access/logos.ts`
- `lib/bookmarks/bookmarks.ts`
- `lib/logo.server.ts`
- `lib/logo-fetcher.ts`
- `lib/services/unified-image-service.ts`
- `lib/image-handling/image-s3-utils.ts`
- `lib/server-cache.ts`
- `lib/server-cache/index.ts`
- `lib/server-cache/jina-fetch-limiter.ts`

**API Routes:**

- `app/api/cache/bookmarks/route.ts`
- `app/api/cache/clear/route.ts`
- `app/api/cache/images/route.ts`
- `app/api/bookmarks/refresh/route.ts`
- `app/api/bookmarks/status/route.ts`
- `app/api/github-activity/debug/route.ts`
- `app/api/logo/invert/route.ts`
- `app/api/validate-logo/route.ts`

**Health & Monitoring:**

- `app/api/health/metrics/route.ts`
- `app/api/metrics/cache/route.ts`
- `lib/health/memory-health-monitor.ts`

**Test Files:**

- `lib/test-utils/cache-tester.ts`
- `lib/test-utils/cache-inspector.ts`
- `lib/test-utils/index.ts`
- `lib/constants.ts`
- `scripts/test-cache-invalidation.ts`

#### Map-Based Caching (10 files)

- `lib/server-cache.ts` - Core Map-based implementation with TTL
- `lib/image-memory-manager.ts` - Deprecated, returns false/null
- `lib/blog/mdx.ts` - Has both Next.js cache and Map-based cache
- `lib/rate-limit.ts` - Rate limiting with Map store
- `lib/utils/sanitize.ts` - Clean cache with Map
- `lib/utils/spam-filter.server.ts` - Pattern cache with Map
- `lib/opengraph/session.ts` - Session management with Map
- `lib/data-access/logos/session.ts` - Domain failure tracking with Map
- `lib/data-access/bookmarks/session.ts` - Lock management with Map
- `lib/bookmarks/session.ts` - Lock state with Map

#### S3/CDN Image System

- UnifiedImageService handles all image operations
- Direct S3 uploads without memory storage
- CDN URLs returned for all image requests
- No memory pressure from image operations

## Core Systems

### 1. ServerCacheInstance (`lib/server-cache.ts`) - LEGACY

- Singleton Map-based cache with TTL and size management
- `useClones: false` - safe since buffers removed
- Max 100k keys with 10% batch eviction
- Rejects buffers >10MB automatically
- Stores only metadata for images
- Used by 33 files (being migrated to Next.js cache)

### 2. Next.js 15 'use cache' - CURRENT

- Native caching with automatic key generation
- Tag-based invalidation with `revalidateTag()`
- Configurable lifetimes: 'default', 'seconds', 'minutes', 'hours', 'days', 'weeks', 'max'
- Server-side only, requires async functions
- JSON-serializable data only
- Used by 9 files and growing

**Implementation Pattern:**
```typescript
import { unstable_cacheLife as cacheLife, unstable_cacheTag as cacheTag, revalidateTag } from "next/cache";

export async function getCachedData() {
  'use cache'
  cacheLife('hours');
  cacheTag('data-type');
  
  // Expensive operation
  return await fetchData();
}

export function invalidateDataCache() {
  revalidateTag('data-type');
}
```

### 3. S3/CDN Image Delivery  

- All images stored in S3 bucket
- Direct CDN URL delivery (no buffers)
- No memory caching for images
- Automatic S3 persistence on fetch
- See `image-handling.md` for details

### 4. Multi-Tier Architecture

```
L1: Memory Cache (~1ms) → L2: S3 Storage (~50ms) → L3: External APIs (100ms-5s)
```

## Caching Patterns

### Success/Failure Strategy

- **Success**: Long TTL (7-30 days)
- **Failure**: Short TTL (1-2 hours)
- Prevents API hammering on errors

### Request Coalescing

```
Multiple requests for same resource → Share single fetch promise
                                    ↓
                                Return same result to all
```

### Distributed Locking (Bookmarks)

```
Request → Check S3 Lock → Locked? Wait
                      ↓ Available
                   Acquire → Fetch → Update → Release
```

## Cache Durations

```javascript
LOGO_CACHE: 30 days success / 1 day failure
BOOKMARKS_CACHE: 7 days success / 1 hour failure  
GITHUB_CACHE: 24 hours success / 1 hour failure
OPENGRAPH_CACHE: 7 days success / 2 hours failure
SEARCH_CACHE: 15 minutes success / 1 minute failure
```

## Next.js 15 Cache Configuration

### Required Configuration

```typescript
// next.config.ts
const nextConfig: NextConfig = {
  experimental: {
    dynamicIO: true, // Enables 'use cache' directive and cacheLife/cacheTag
    // OR
    useCache: true,  // Alternative flag for 'use cache' directive
  },
};
```

### Import Patterns

```typescript
// Always use unstable_ prefixed imports with aliases
import { 
  unstable_cacheLife as cacheLife, 
  unstable_cacheTag as cacheTag, 
  revalidateTag 
} from "next/cache";
```

### Cache Lifetime Profiles

- `'default'` - 5 min stale, 15 min revalidate, 1 year expire
- `'seconds'` - Near real-time updates
- `'minutes'` - Frequent updates within an hour  
- `'hours'` - Daily updates
- `'days'` - Weekly updates
- `'weeks'` - Monthly updates
- `'max'` - Very stable content

### Migration Pattern

```typescript
// Before: Using ServerCacheInstance
const cached = ServerCacheInstance.get('key');
if (!cached) {
  const data = await fetchData();
  ServerCacheInstance.set('key', data, TTL);
  return data;
}
return cached;

// After: Using Next.js 'use cache'
export async function getCachedData() {
  'use cache'
  cacheLife('hours');
  cacheTag('data-type');
  
  return await fetchData();
}
```

## Cache Invalidation Strategy

### Problem: Stale Data Despite Updates

Users may see stale data even after successful S3 updates due to multiple caching layers:

1. **Next.js Page-Level ISR Cache** (`app/bookmarks/page.tsx`): 30 min TTL
2. **Function-Level Cache** (`bookmarks-data-access.server.ts`): 1 hour TTL  
3. **In-Memory Runtime Cache** (`fullDatasetMemoryCache`): 5 min TTL
4. **Local File Cache** (`lib/data/bookmarks.json`): Fallback only

### Invalidation Implementation

#### Automated Revalidation Endpoint

**Location:** `app/api/revalidate/bookmarks/route.ts`

Provides authenticated cache invalidation triggered by the scheduler after successful data refresh:

```typescript
// Invalidates all bookmark-related paths and tags
POST /api/revalidate/bookmarks
Authorization: Bearer ${BOOKMARK_CRON_REFRESH_SECRET}

// Revalidates:
- /bookmarks (main page)
- /bookmarks/[slug] (individual pages)
- /bookmarks/page/[pageNumber] (pagination)
- /bookmarks/domain/[domainSlug] (domain filtering)
- /bookmarks/tags/[...slug] (tag filtering)
- revalidateTag('bookmarks') (all bookmark caches)
```

#### Programmatic Invalidation

```typescript
// In slug-manager.ts:151-157
import { revalidateTag } from "next/cache";

// Invalidate multiple tags
revalidateTag("bookmarks");
revalidateTag("bookmarks-slugs");
revalidateTag("search-index");
```

#### Safe Cache Functions

The codebase uses wrapper functions to handle cache operations gracefully in different contexts:

```typescript
// lib/bookmarks/bookmarks-data-access.server.ts:54-94
const safeCacheLife = (profile) => {
  if (typeof cacheLife === "function" && !isCliLikeContext()) {
    cacheLife(profile);
  }
};

const safeCacheTag = (...tags) => {
  if (typeof cacheTag === "function" && !isCliLikeContext()) {
    for (const tag of new Set(tags)) cacheTag(tag);
  }
};

const safeRevalidateTag = (...tags) => {
  if (typeof revalidateTag === "function" && !isCliLikeContext()) {
    for (const tag of new Set(tags)) revalidateTag(tag);
  }
};
```

### Cache Invalidation Patterns

#### 1. Webhook-Based Invalidation (Implemented)

After successful data refresh, the scheduler calls the revalidation endpoint:

```typescript
// In scheduler after successful refresh
await fetch(`${process.env.API_BASE_URL}/api/revalidate/bookmarks`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${process.env.BOOKMARK_CRON_REFRESH_SECRET}`
  }
});
```

#### 2. Tag-Based Invalidation Strategy

Different cache tags for granular control:

- `bookmarks` - All bookmark data
- `bookmarks-s3-full` - Full S3 dataset
- `bookmarks-page-${pageNumber}` - Specific page
- `bookmarks-tag-${tagSlug}` - Tag-filtered data
- `bookmarks-tag-${tagSlug}-page-${pageNumber}` - Tag page combination
- `bookmarks-index` - Index/count data
- `search-index` - Search functionality

#### 3. TTL-Based Freshness

Current cache durations ensure data freshness:

```javascript
// Function-level caching (bookmarks-data-access.server.ts)
FULL_DATASET: 1 hour (3600s) - Main bookmark data
PAGINATION: 1 day (86400s) - Rarely changes
TAG_PAGES: 1 hour (3600s) - Consistent with main cache
INDEX_DATA: 1 hour (3600s) - Fresh counts between scheduler runs
```

### Testing Cache Invalidation

```bash
# 1. Verify S3 has fresh data
bun scripts/check-s3-freshness.ts

# 2. Test local environment
curl http://localhost:3000/bookmarks

# 3. Trigger cache invalidation
curl -X POST http://localhost:3000/api/revalidate/bookmarks \
  -H "Authorization: Bearer ${BOOKMARK_CRON_REFRESH_SECRET}"

# 4. Verify cache was cleared
curl http://localhost:3000/api/cache/bookmarks
```

## Security

### ✅ FIXED: Cache Clear Authentication

**`/api/cache/clear`** - Now requires authentication (app/api/cache/clear/route.ts:22-31)

- Uses `x-api-key` header validation
- Requires `CACHE_API_KEY` environment variable
- Returns 401 Unauthorized for invalid requests
- Both GET and POST methods protected

```typescript
// Current implementation
function validateApiKey(request: NextRequest): boolean {
  const apiKey = process.env.CACHE_API_KEY;
  const providedKey = request.headers.get("x-api-key");
  return providedKey === apiKey;
}
```

### Authenticated Cache Invalidation Endpoints

- `/api/cache/clear` - Requires `x-api-key` header
- `/api/revalidate/bookmarks` - Requires Bearer token auth
- Both endpoints properly secured against DoS attacks

## Integration Points

### Data Access Layer

- `lib/data-access/bookmarks.ts` - Distributed locking
- `lib/data-access/logos.ts` - Metadata caching only (images in S3)
- `lib/data-access/opengraph.ts` - Stale-while-revalidate

### API Routes  

- `/api/cache/bookmarks` - Authenticated operations
- `/api/cache/images` - Redirects to CDN URLs
- `/api/cache/clear` - Authenticated with `x-api-key` header
- `/api/logo` - Always 301 redirect to CDN

### Memory Safety

- No image buffers in memory (S3/CDN only)
- ServerCache stores only lightweight metadata
- No memory pressure from images
- Max keys limit prevents unbounded growth

## Key Files

- `lib/server-cache.ts` - Core cache implementation
- `lib/server-cache/index.ts` - Type-safe methods
- `app/api/cache/*` - Cache management endpoints
- `types/cache.ts` - TypeScript definitions

## Performance Optimizations

1. **Negative Caching** - Failed requests cached
2. **Background Refresh** - Serve stale while fetching
3. **Request Coalescing** - Prevent duplicate calls
4. **Multi-Stage Keys** - Different keys for processing stages

## Testing Requirements

### Test Utility: `lib/test-utils/cache-tester.ts`

- `verifyCacheHit()` - Tests cache behavior
- `clearCacheFor()` - Type-safe cache clearing

### Coverage Needed

- Authentication validation
- Rate limiting behavior
- Distributed locking
- Race conditions
- DoS simulation

## Environment-Specific Considerations

### Development vs Production

**Development Environment:**

- Less aggressive caching for faster iteration
- Cache TTLs can be reduced for testing
- Direct S3 access for debugging

**Production Environment:**

- Balance between performance and freshness
- 1-hour cache for bookmarks data
- Automated invalidation via scheduler
- Consider S3 read costs when adjusting TTLs

### Long-Term Improvements

1. **Cache Versioning**: Include version/timestamp in cache keys to ensure updates
2. **Cache Metrics**: Monitor hit rates and effectiveness
3. **Edge Caching**: Consider CDN-level caching for static resources
4. **Selective Invalidation**: Invalidate only changed data rather than entire cache
5. **Event-Driven Updates**: Use webhooks to trigger immediate cache invalidation

## ✅ FIXED Issues

### 2025-08: Cache Invalidation

- Implemented `/api/revalidate/bookmarks` endpoint
- Added authentication for cache operations
- Fixed local cache corruption (test data detection)
- Automated cache clearing after data refresh

### 2025-06: Memory Management

- Memory limits implemented
- `useClones: true` → `false` (safe now)
- Buffer rejection >10MB
- Batch eviction at 100k keys
- Integration with memory management

## Cache Usage Summary

### Total Files by Cache Type

- **33 files** using ServerCacheInstance (Map-based in-memory cache)
- **10 files** using Map-based caching directly (specialized caching)
- **23 files** using ImageMemoryManager (deprecated - no actual caching)
- **9 files** using Next.js 'use cache' directive (modern standard)
- **7 files** using Next.js cache invalidation functions

## Domain Session Management

UnifiedImageService includes session-based domain tracking to prevent infinite loops and resource exhaustion. See `image-handling.md` for detailed implementation.

**Key Features:**

- 30-minute sessions with automatic reset
- Max 3 retries per domain per session
- Circuit breaker pattern for failing domains
- Used across logo fetching, OpenGraph, and batch operations

**Related Files:**

- `lib/services/unified-image-service.ts` - Core implementation (lines 48-55, 649-702)
- `lib/opengraph/fetch.ts` - Uses UnifiedImageService domain session
- `lib/data-access/opengraph.ts` - Uses UnifiedImageService domain session

## Key Considerations

1. **Serialization**: All cached data must be JSON-serializable
2. **Async Functions**: 'use cache' only works with async functions
3. **Server-Side Only**: Cannot use in Client Components or static exports
4. **Tag Strategy**: Use consistent tags for related data
5. **Invalidation**: Plan revalidateTag() calls carefully
6. **Request-time APIs**: Cannot use with cookies() or headers()
7. **Default Revalidation**: Server-side cache revalidates every 15 minutes by default
8. **Platform Support**: Node.js and Docker only (not static exports)
