# Caching Architecture

**Functionality:** `caching`

## Core Objective

To provide a high-performance, multi-tiered caching system that significantly reduces latency, minimizes redundant computations and network requests, and coordinates cache operations across multiple instances. The system implements sophisticated patterns including request coalescing, distributed locking, and stale-while-revalidate strategies.

## Architecture Diagram

See `caching.mmd` for a visual diagram of the caching strategy.

## Core Concepts

1. **Singleton Instance (`ServerCacheInstance`)**: The entire server application shares a single instance of the cache (`lib/server-cache.ts`). Built on `node-cache` with custom extensions for request coalescing and distributed locking.

2. **Multi-Tiered Architecture**:
    - **Layer 1**: In-memory cache (`ServerCacheInstance`) - microsecond access
    - **Layer 2**: S3 persistent storage - millisecond access, survives restarts
    - **Layer 3**: External APIs - second+ access, rate-limited

3. **Strategic Caching Patterns**:
    - **Success Caching**: Valid data cached with long TTL (days)
    - **Failure Caching**: Failed requests cached with short TTL (hours) to prevent hammering
    - **Request Coalescing**: Multiple concurrent requests for same resource share single fetch
    - **Stale-While-Revalidate**: Serve stale data while refreshing in background

4. **Distributed Coordination**:
    - S3-based locking mechanism prevents multiple instances from refreshing same data
    - In-flight promise tracking prevents duplicate API calls within single instance

## Interaction with Other Systems

- **`json-handling`**: Caches the final, processed JSON objects for bookmarks and GitHub activity. This prevents expensive re-fetching and re-processing from the external APIs.
- **`image-handling`**: Caches multiple stages of the image pipeline, including fetch results (both positive and negative), analysis data (like brightness), and the final processed image data.
- **`s3-object-storage`**: The cache works in concert with S3. Data is fetched from S3 and stored in the cache for faster access on subsequent requests.

## Key Files & Responsibilities

### Core Cache Implementation

- **`lib/server-cache.ts`**: Primary cache implementation with `ServerCache` class
  - Request coalescing via `inFlightPromises` Map
  - Domain-specific methods for logos and bookmarks
  - Integration with S3 for persistent storage
  - Memory management (though currently lacks limits)

- **`lib/cache.ts`**: Legacy cache setup (currently unused, should be removed)

- **`lib/server-cache/index.ts`**: Barrel export for ServerCacheInstance

### Cache Management

- **`app/api/cache/clear/route.ts`**: ⚠️ **SECURITY RISK** - Unauthenticated endpoint for clearing cache
- **`middleware/cache-debug.ts`**: Development middleware adding cache stats to response headers
- **`lib/utils/revalidate-path.ts`**: Next.js cache invalidation wrapper

### Integration Points

- **`lib/data-access/bookmarks.ts`**: Implements distributed locking for bookmark refresh
- **`lib/data-access/logos.ts`**: Complex logo fetching with multi-stage caching
- **`app/api/cache/bookmarks/route.ts`**: Bookmark-specific cache operations
- **`app/api/cache/images/route.ts`**: Image processing with cache integration

## Logic Flow and Interactions

### Request Flow Example (Logo Fetch)

```
Request → Check Memory Cache → Hit? Return
          ↓ Miss
          Check S3 → Hit? Cache in Memory & Return
          ↓ Miss
          Check In-Flight? → Yes? Wait for Promise
          ↓ No
          Create Promise → Fetch from API → Process → Store S3 → Cache → Return
```

### Distributed Refresh Flow (Bookmarks)

```
Refresh Request → Check S3 Lock → Locked? Return "Already Refreshing"
                 ↓ Not Locked
                 Acquire Lock → Fetch Data → Process → Update S3 → Update Cache → Release Lock
```

## Critical Issues & Security Vulnerabilities

### 🚨 CRITICAL SECURITY VULNERABILITIES IN `/api/cache/clear`

#### 1. **Unauthenticated Cache Invalidation (DoS Attack Vector)**

- **Issue**: The `/api/cache/clear` endpoint has NO authentication while other cache endpoints (`/api/cache/bookmarks`) require API keys
- **Impact**: Attackers can repeatedly clear the cache, forcing expensive regeneration of all cached data:
  - Database queries re-executed
  - External API calls repeated (risk of rate limiting)
  - Server CPU/memory spike from regenerating content
  - Complete service degradation or downtime
- **Attack Scenario**: Simple curl loop can take down the service:
  ```bash
  while true; do curl -X POST https://site.com/api/cache/clear; done
  ```

#### 2. **Information Disclosure via GET Endpoint**

- **Issue**: GET `/api/cache/clear` exposes cache statistics without authentication
- **Impact**: Reveals internal metrics (hit rates, key count, memory usage) useful for attack planning

#### 3. **No Rate Limiting Protection**

- **Issue**: Even with authentication, no rate limiting exists
- **Impact**: Compromised API key or malicious insider can still cause DoS

### Required Fixes (Priority Order)

1. **Immediate: Add Authentication**
   ```typescript
   function isAuthenticated(request: NextRequest): boolean {
     const apiKey = request.headers.get('Authorization');
     return apiKey === `Bearer ${process.env.CACHE_API_KEY}`;
   }
   ```

2. **Add Rate Limiting**
   - Max 5 requests per minute per IP
   - Use Redis-backed rate limiter for production
   - Return 429 status when exceeded

3. **Restrict Methods**
   - POST only for cache clearing
   - GET for stats (still authenticated)

4. **Add Audit Logging**
   - Log all cache clear attempts with IP, timestamp
   - Alert on suspicious patterns

### Memory Management Risks

- **No memory limits**: Cache can grow unbounded, risking OOM errors
  - Image buffers can be 5-10MB each
  - No eviction policy when memory pressure occurs
- **Object mutation risk**: `useClones: false` allows cached objects to be modified
  - Can lead to cache corruption
  - Unpredictable behavior across requests
- **Raw buffer storage**: Image buffers stored without size limits
  - A malicious actor could trigger caching of large images
  - No validation of buffer sizes before caching

### Architectural Issues

- **Dual cache confusion**: Two cache instances exist but only one is used
- **Race conditions**: Global state anti-pattern with `globalThis.isBookmarkRefreshLocked`
- **Cache poisoning risks**:
  - Failed image processing results might be cached as successes
  - No validation of cached data integrity
  - Potential for serving corrupted data
- **Next.js integration gaps**: Custom cache updates don't trigger `revalidatePath`
- **Missing middleware protection**: While `/api/debug` routes are blocked in production, `/api/cache` routes are fully exposed

## Performance Optimizations

- **Request Coalescing**: Prevents duplicate API calls for same resource
- **Negative Caching**: Failed requests cached with shorter TTL
- **Background Refresh**: Stale data served while fresh data fetched
- **Multi-Stage Caching**: Different cache keys for different processing stages

## Testing Requirements

### Test Utilities

#### `lib/test-utils/cache-tester.ts`

- Standardized utility class for integration testing API endpoints with caching
- Test Utility Class with static methods
- **Key Methods:**
  - `verifyCacheHit(endpoint: string)`: Tests cache behavior by:
    1. Making initial fetch to endpoint
    2. Recording cache statistics
    3. Making second fetch to same endpoint
    4. Verifying data consistency
    5. Confirming cache hit count increased
  - `clearCacheFor(type: 'logo' | 'bookmarks' | 'github-activity')`: Type-safe cache clearing for test isolation

### Currently untested components that need coverage

- ServerCache class methods and TTL behavior
- Data access layer with mocked dependencies
- API route security and functionality
  - Authentication validation
  - Rate limiting behavior
  - Error handling paths
- Distributed locking mechanism
- Race condition scenarios
- DoS attack simulation
- Cache poisoning prevention

## Bugs and Improvements Log

### Critical Bugs

1. **BUG-001**: Unauthenticated cache clear endpoint enables DoS attacks
   - Severity: CRITICAL
   - File: `/app/api/cache/clear/route.ts`
   - Fix: Add authentication matching `/api/cache/bookmarks` pattern

2. **BUG-002**: Cache stats endpoint leaks operational metrics
   - Severity: HIGH
   - File: `/app/api/cache/clear/route.ts`
   - Fix: Require authentication for GET requests

3. **BUG-003**: No rate limiting on cache management endpoints
   - Severity: HIGH
   - Files: All `/app/api/cache/*` routes
   - Fix: Implement rate limiting middleware

### Improvements Needed

1. **IMP-001**: Implement structured logging for cache operations
   - Current: `console.error` with string messages
   - Needed: JSON structured logs with context

2. **IMP-002**: Add cache operation metrics
   - Track clear operations per hour
   - Monitor cache regeneration costs
   - Alert on anomalous patterns

3. **IMP-003**: Create cache management dashboard
   - Protected admin UI for cache operations
   - Visual representation of cache state
   - Audit log viewer

4. **IMP-004**: Implement cache warming strategy
   - Pre-populate critical paths after clear
   - Gradual cache rebuild to prevent thundering herd
