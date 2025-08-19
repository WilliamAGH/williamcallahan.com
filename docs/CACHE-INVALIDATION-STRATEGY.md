# Cache Invalidation Strategy for Bookmarks

## Problem Summary

Users are seeing stale bookmark data (days old) despite the scheduler successfully refreshing data in S3. Multiple caching layers prevent fresh data from reaching users.

## Current Caching Layers

### 1. Next.js Page-Level ISR Cache
- **Location**: `app/bookmarks/page.tsx` and related pages
- **TTL**: 30 minutes (`export const revalidate = 1800`)
- **Issue**: Pages are cached for 30 minutes regardless of data updates

### 2. Function-Level Cache  
- **Location**: `bookmarks-data-access.server.ts`
- **TTL**: 1 hour (`safeCacheLife({ revalidate: 3600 })`)
- **Issue**: Function results cached for 1 hour

### 3. In-Memory Runtime Cache
- **Location**: `fullDatasetMemoryCache` in memory
- **TTL**: 5 minutes
- **Issue**: Holds stale data in memory

### 4. Local File Cache (CORRUPTED)
- **Location**: `lib/data/bookmarks.json`
- **Issue**: Contains only 1 test bookmark instead of 299 real bookmarks
- **Status**: FIXED - Added check for test data

## Immediate Fixes Applied

1. **Local Cache Corruption Fixed**
   - Updated test data detection to check for ID "test" (not just "test-1")
   - Deleted corrupted `lib/data/bookmarks.json` file
   - System now falls back to S3 properly

## Recommended Solution

### Option 1: Force Cache Invalidation on Refresh (Recommended)

Add a cache revalidation API that the scheduler calls after successful refresh:

```typescript
// app/api/revalidate/bookmarks/route.ts
import { revalidatePath, revalidateTag } from 'next/cache';

export async function POST(request: Request) {
  // Verify authorization
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.BOOKMARK_CRON_REFRESH_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  // Revalidate all bookmark-related paths
  revalidatePath('/bookmarks');
  revalidatePath('/bookmarks/[slug]', 'page');
  revalidatePath('/bookmarks/page/[pageNumber]', 'page');
  revalidatePath('/bookmarks/domain/[domainSlug]', 'page');
  revalidateTag('bookmarks');

  return new Response('Cache invalidated', { status: 200 });
}
```

Then update scheduler to call this after refresh:

```typescript
// In scheduler.ts after successful refresh
await fetch(`${process.env.API_BASE_URL}/api/revalidate/bookmarks`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${process.env.BOOKMARK_CRON_REFRESH_SECRET}`
  }
});
```

### Option 2: Reduce Cache TTLs

Reduce aggressive caching to allow fresher data:

```typescript
// In bookmark pages
export const revalidate = 300; // 5 minutes instead of 30

// In data access functions
safeCacheLife({ revalidate: 300 }) // 5 minutes instead of 1 hour
```

### Option 3: Add Cache Bypass Headers

Add a way to bypass cache for fresh data:

```typescript
// Check for cache bypass header
const shouldBypassCache = request.headers.get('x-bypass-cache') === 'true';

if (shouldBypassCache) {
  // Skip all caches and fetch directly from S3
  return fetchDirectFromS3();
}
```

## Testing Strategy

1. **Verify S3 has fresh data**: Run `bun scripts/check-s3-freshness.ts`
2. **Check local environment**: Load http://localhost:3000/bookmarks
3. **Test cache invalidation**: Trigger refresh and verify new bookmarks appear
4. **Monitor production**: Check if https://williamcallahan.com/bookmarks updates

## Long-term Improvements

1. **Implement webhook-based invalidation**: When bookmarks are updated, trigger immediate cache invalidation
2. **Add cache versioning**: Include version/timestamp in cache keys
3. **Monitor cache hit rates**: Add metrics to understand cache effectiveness
4. **Consider edge caching strategy**: Use Cloudflare or similar for smarter caching

## Environment-Specific Considerations

- **Development**: Less aggressive caching for faster iteration
- **Production**: Balance between performance and freshness
- **S3 costs**: Consider read costs when reducing cache TTLs