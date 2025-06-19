# Caching Architecture

**Functionality:** `caching`

## Core Objective

High-performance multi-tiered caching with request coalescing, distributed locking, and memory-safe operations. Reduces latency and prevents redundant API calls.

## Architecture Diagram

See `caching.mmd` for visual flow.

## Core Systems

### 1. ServerCacheInstance (`lib/server-cache.ts`)

- Singleton NodeCache instance
- `useClones: false` - safe since buffers removed
- Max 100k keys with 10% batch eviction
- Rejects buffers >10MB automatically
- Stores only metadata for images

### 2. ImageMemoryManager (`lib/image-memory-manager.ts`)  

- Dedicated LRU cache for image buffers
- 512MB budget, 50MB per-image limit
- Size-aware eviction with TTL
- Request coalescing built-in
- See `memory-mgmt.md` for details

### 3. Multi-Tier Architecture

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
- `lib/data-access/logos.ts` - Multi-stage caching
- `lib/data-access/opengraph.ts` - Stale-while-revalidate

### API Routes  

- `/api/cache/bookmarks` - Authenticated operations
- `/api/cache/images` - Image processing
- `/api/cache/clear` - ⚠️ NEEDS AUTH

### Memory Safety

- All image buffers through ImageMemoryManager
- ServerCache stores only lightweight metadata
- Emergency cleanup via MemoryHealthMonitor
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
