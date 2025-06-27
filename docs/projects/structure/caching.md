# Caching Architecture

**Functionality:** `caching`

## Core Objective

High-performance multi-tiered caching with request coalescing, distributed locking, and memory-safe operations using Next.js 15's native 'use cache' directive and a simple Map-based server cache implementation.

## Architecture Diagram

See `caching.mmd` for visual flow and migration status.

## Caching Implementation Inventory

### Files Using Next.js 15 'use cache' Directive (9 files)

- `lib/search.ts` - Search functionality with tag-based caching
- `lib/bookmarks/bookmarks-data-access.server.ts` - Bookmarks data access
- `lib/data-access/github.ts` - GitHub API caching
- `lib/blog/mdx.ts` - Blog post caching
- `lib/data-access/images.server.ts` - Image data caching
- `app/api/search/route.ts` - Search API endpoint
- `app/api/blog/[slug]/route.ts` - Blog API endpoint
- `app/api/cache/bookmarks/route.ts` - Bookmarks cache management
- `app/blog/[slug]/page.tsx` - Blog page component

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

### 1. ServerCacheInstance (`lib/server-cache.ts`) - CURRENT

- Singleton Map-based cache with TTL and size management
- `useClones: false` - safe since buffers removed
- Max 100k keys with 10% batch eviction
- Rejects buffers >10MB automatically
- Stores only metadata for images

### 2. Next.js 15 'use cache' - NEW (EXPERIMENTAL)

- Native caching with automatic key generation
- Tag-based invalidation with `revalidateTag()`
- Configurable lifetimes: 'default', 'seconds', 'minutes', 'hours', 'days', 'weeks', 'max'
- Server-side only, requires async functions
- JSON-serializable data only

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

## Critical Security Issues

### 🔴 CRITICAL: Unauthenticated Cache Clear

**`/api/cache/clear`** - NO AUTHENTICATION!

- Enables DoS attacks via cache invalidation
- Exposes internal metrics on GET
- No rate limiting

**Fix Required:**
```typescript
const apiKey = request.headers.get('Authorization');
if (apiKey !== `Bearer ${process.env.CACHE_API_KEY}`) {
  return new Response('Unauthorized', { status: 401 });
}
```

## Integration Points

### Data Access Layer

- `lib/data-access/bookmarks.ts` - Distributed locking
- `lib/data-access/logos.ts` - Metadata caching only (images in S3)
- `lib/data-access/opengraph.ts` - Stale-while-revalidate

### API Routes  

- `/api/cache/bookmarks` - Authenticated operations
- `/api/cache/images` - Redirects to CDN URLs
- `/api/cache/clear` - ⚠️ NEEDS AUTH
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

## ✅ FIXED (2025-06)

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
