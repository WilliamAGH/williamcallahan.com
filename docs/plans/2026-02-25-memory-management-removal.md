# Memory Management Removal — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove all custom memory management, caching, and memory pressure infrastructure from the codebase and replace with idiomatic Next.js 16 patterns only.

**Architecture:** Nuclear delete of ~15 primary memory management files followed by compile-error-driven migration of ~35 consumer files. The custom `ServerCache` (Map-based singleton with TTL/eviction/circuit-breaker) is replaced by `unstable_cache()` for data-access functions and `React.cache()` for per-request deduplication. Memory pressure middleware, health monitors, and schedulers are deleted entirely — the platform (Railway) handles OOM kills and restarts. Domain-specific in-memory Map caches (bookmarks, blog, books) are replaced by `unstable_cache()` wrappers with appropriate TTLs and tags.

**Tech Stack:** Next.js 16.1.6, `unstable_cache` (next/cache), `React.cache()`, `cacheTag`/`revalidateTag`, TypeScript, Vitest

**Key Principle:** After this plan, zero files in the repo should reference `process.memoryUsage()`, `MEMORY_THRESHOLDS`, `ServerCacheInstance`, `MemoryHealthMonitor`, `MemoryAwareRequestScheduler`, cgroup paths, or any custom cache eviction logic.

---

## Phase 1: Delete Core Memory Infrastructure (4 files)

Delete the foundational memory management modules. Everything else depends on these, so removing them first surfaces all downstream compile errors.

### Task 1.1: Delete memory pressure middleware

**Files:**

- Delete: `src/lib/middleware/memory-pressure.ts` (239 lines)
- Delete: `src/lib/middleware/health-check-paths.ts` (30 lines)

**Step 1: Delete the files**

```bash
rm src/lib/middleware/memory-pressure.ts
rm src/lib/middleware/health-check-paths.ts
```

**Step 2: Verify deletions**
Run: `ls src/lib/middleware/memory-pressure.ts src/lib/middleware/health-check-paths.ts 2>&1`
Expected: "No such file or directory" for both

### Task 1.2: Delete memory health monitor

**Files:**

- Delete: `src/lib/health/memory-health-monitor.ts` (502 lines)

**Step 1: Delete the file**

```bash
rm src/lib/health/memory-health-monitor.ts
```

### Task 1.3: Delete memory-aware scheduler

**Files:**

- Delete: `src/lib/services/memory-aware-scheduler.ts` (359 lines)

**Step 1: Delete the file**

```bash
rm src/lib/services/memory-aware-scheduler.ts
```

### Task 1.4: Remove MEMORY_THRESHOLDS from constants.ts

**Files:**

- Modify: `src/lib/constants.ts` — remove lines 440-511 (the `MEMORY_THRESHOLDS` block and `detectCgroupMemoryLimitBytes()`)

**Step 1: Remove memory threshold code**

Delete everything from `MEMORY_CHECK_INTERVAL` constant through the `MEMORY_THRESHOLDS` export (lines ~439-511). Keep `S3_SIZE_LIMITS` (lines 516-526) — those are S3 size guards, not memory management. Also keep `S3_BUCKET` (line 514).

The `S3_SIZE_LIMITS` block needs to stay — it defines max read sizes for S3 operations (legitimate I/O bounds, not memory management). Move `S3_SIZE_LIMITS` and `S3_BUCKET` up to fill the gap left by the memory block.

**Step 2: Remove the associated env var reads**

The following env vars become dead: `TOTAL_PROCESS_MEMORY_BUDGET_BYTES`, `IMAGE_RAM_BUDGET_BYTES`, `SERVER_CACHE_BUDGET_BYTES`, `MEMORY_WARNING_THRESHOLD`, `MEMORY_CRITICAL_THRESHOLD`, `IMAGE_STREAM_THRESHOLD_BYTES`.

### Task 1.5: Pause and verify — type-check

**Step 1: Run type-check to surface all broken imports**
Run: `bun run type-check 2>&1 | head -100`
Expected: Many "Cannot find module" and "has no exported member" errors. These are the roadmap for Phase 2-4.

**Step 2: Save the error list for reference**
Run: `bun run type-check 2>&1 | grep "error TS" | sort -u > /tmp/memory-removal-errors-phase1.txt`

**Step 3: Commit Phase 1**

```bash
git add -A && git commit -m "refactor: delete core memory management infrastructure (Phase 1)

Remove memory-pressure middleware, health monitor, scheduler, and
MEMORY_THRESHOLDS from constants. These custom memory management layers
added complexity without benefit — the platform handles OOM restarts."
```

---

## Phase 2: Delete ServerCache + Domain Helpers (9 files)

### Task 2.1: Delete ServerCache singleton

**Files:**

- Delete: `src/lib/server-cache.ts` (484 lines)

**Step 1: Delete**

```bash
rm src/lib/server-cache.ts
```

### Task 2.2: Delete all server-cache domain helpers

**Files:**

- Delete: `src/lib/server-cache/bookmarks.ts`
- Delete: `src/lib/server-cache/github.ts`
- Delete: `src/lib/server-cache/logo.ts`
- Delete: `src/lib/server-cache/opengraph.ts`
- Delete: `src/lib/server-cache/search.ts`
- Delete: `src/lib/server-cache/aggregated-content.ts`
- Delete: `src/lib/server-cache/jina-fetch-limiter.ts`

**Step 1: Delete the entire directory**

```bash
rm -rf src/lib/server-cache/
```

### Task 2.3: Delete ServerCache type declaration

**Files:**

- Delete: `src/types/server-cache.d.ts`

**Step 1: Delete**

```bash
rm src/types/server-cache.d.ts
```

### Task 2.4: Delete cache debug middleware

**Files:**

- Delete: `src/lib/middleware/cache-debug.ts`

**Step 1: Delete**

```bash
rm src/lib/middleware/cache-debug.ts
```

### Task 2.5: Delete cache tester utility

**Files:**

- Delete: `src/lib/test-utils/cache-tester.ts`

**Step 1: Delete**

```bash
rm src/lib/test-utils/cache-tester.ts
```

### Task 2.6: Pause and verify

**Step 1: Run type-check, save updated error list**
Run: `bun run type-check 2>&1 | grep "error TS" | sort -u > /tmp/memory-removal-errors-phase2.txt`

**Step 2: Commit Phase 2**

```bash
git add -A && git commit -m "refactor: delete ServerCache singleton and domain helpers (Phase 2)

Remove the 484-line custom Map-based cache with TTL/eviction/circuit-breaker
and all 7 domain helper modules. Consumers will be migrated to
unstable_cache() and React.cache() in Phase 4."
```

---

## Phase 3: Fix Proxy + Middleware Consumers (~8 files)

These are the direct consumers of the memory pressure middleware and health monitor that need surgical edits.

### Task 3.1: Remove memory pressure from proxy.ts

**Files:**

- Modify: `src/proxy.ts`

**Changes:**

1. Remove line 20: `import { memoryPressureMiddleware } from "@/lib/middleware/memory-pressure";`
2. Remove lines 200-203: the `memoryPressureMiddleware` call and `systemStatus` extraction
3. Remove line 231: `if (systemStatus) response.headers.set("X-System-Status", systemStatus);`

The proxy should go straight from rate limiting to security checks. No memory pressure check needed.

### Task 3.2: Remove memory pressure from chat-helpers.ts

**Files:**

- Modify: `src/app/api/ai/chat/[feature]/chat-helpers.ts`

**Changes:**

1. Remove line 27: `import { memoryPressureMiddleware } from "@/lib/middleware/memory-pressure";`
2. Remove line 87: `const memoryResponse = await memoryPressureMiddleware(request);`
3. Remove any conditional return based on `memoryResponse`

### Task 3.3: Simplify search api-guards.ts — remove memory functions

**Files:**

- Modify: `src/lib/search/api-guards.ts`

**Changes:**

1. Remove `getCriticalThreshold()` function (lines 38-70)
2. Remove `isMemoryCritical()` function (lines 76-86)
3. Remove `checkMemoryPressure()` function (lines 131-141)
4. Remove `import os from "node:os";` (line 17)
5. Simplify `applySearchGuards()` to only do rate limiting (remove memory pressure check, lines 157-158)

Keep: `getClientIp`, `withNoStoreHeaders`, `SEARCH_RATE_LIMIT`, `checkSearchRateLimit`, `createSearchErrorResponse`, `applySearchGuards` (rate-limit-only version).

### Task 3.4: Simplify health route — remove custom memory checks

**Files:**

- Rewrite: `src/app/api/health/route.ts`

**New implementation:** Simple health check that returns 200 with basic process info. No memory pressure detection, no `MemoryHealthMonitor`, no `MEMORY_THRESHOLDS`.

```typescript
import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json(
    { status: "healthy", timestamp: new Date().toISOString() },
    { headers: { "Cache-Control": "no-cache, no-store, must-revalidate" } },
  );
}
```

### Task 3.5: Simplify health metrics route

**Files:**

- Rewrite: `src/app/api/health/metrics/route.ts`

**New implementation:** Return basic process metrics (RSS, heap) without custom monitors, ServerCache stats, or allocator diagnostics. Keep the auth check.

```typescript
import { NextResponse, type NextRequest } from "next/server";
import {
  preventCaching,
  validateAuthSecret,
  createErrorResponse,
  NO_STORE_HEADERS,
} from "@/lib/utils/api-utils";
import { getSystemMetrics } from "@/lib/health/status-monitor.server";

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (process.env.NEXT_PHASE === "phase-production-build") {
    return NextResponse.json(
      { status: "skipped", timestamp: new Date().toISOString() },
      { status: 200, headers: NO_STORE_HEADERS },
    );
  }
  preventCaching();
  const expectedToken =
    process.env.GITHUB_REFRESH_SECRET || process.env.BOOKMARK_CRON_REFRESH_SECRET;
  if (!validateAuthSecret(request, expectedToken)) {
    return createErrorResponse("Unauthorized", 401);
  }
  const memUsage = process.memoryUsage();
  const systemMetrics = await getSystemMetrics();
  return NextResponse.json(
    {
      status: "healthy",
      timestamp: new Date().toISOString(),
      memory: {
        rss: Math.round(memUsage.rss / 1024 / 1024),
        heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
        heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
        external: Math.round(memUsage.external / 1024 / 1024),
      },
      system: systemMetrics,
    },
    { headers: NO_STORE_HEADERS },
  );
}
```

### Task 3.6: Remove memory monitoring from instrumentation-node.ts

**Files:**

- Modify: `src/instrumentation-node.ts`

**Changes:**
Remove lines 47-75 — the entire `if (process.memoryUsage)` block that runs a 30-second interval checking RSS and forcing GC. Keep everything else (Sentry init, image manifest warmup, Jina rate-limit load, bookmark preload).

### Task 3.7: Remove memory check from search dynamic-content loader

**Files:**

- Modify: `src/lib/search/loaders/dynamic-content.ts`

**Changes:**
Remove lines 86-95 — the dynamic import of `getMemoryHealthMonitor()` and the memory guard that throws when `shouldAcceptNewRequests()` is false.

### Task 3.8: Simplify batch-processing — remove memory awareness

**Files:**

- Rewrite: `src/lib/batch-processing/index.ts`

**Changes:**

1. Remove imports: `MemoryHealthMonitor`, `MemoryAwareRequestScheduler`, `RequestPriority`
2. Remove `scheduler` and `memoryMonitor` fields from `BatchProcessor`
3. Remove `health.status === "unhealthy"` check in `processBatch()`
4. Remove `processItem()` method that routes through scheduler — call `this.processor(item)` directly
5. Remove `getStatus()` method (or simplify to not reference memory)
6. Remove `memoryPressureEvents` counter from results
7. Keep: `BatchProcessor`, `ImageBatchProcessor`, `createS3BatchProcessor`, `BatchProgressReporter` — these are useful for batching/retries independent of memory

### Task 3.9: Remove memory from image pipeline consumers

**Files:**

- Modify: `src/lib/services/unified-image-service.ts` — remove `wipeBuffer` import and `getMemoryHealthMonitor().shouldAllowImageOperations()` guard
- Modify: `src/lib/services/image/image-fetcher.ts` — remove `getMemoryHealthMonitor` import and memory checks
- Modify: `src/lib/services/image/session-manager.ts` — remove `getMemoryHealthMonitor` import and memory checks
- Modify: `src/lib/services/image/s3-operations.ts` — remove `getMemoryHealthMonitor` import and "Insufficient memory headroom" error detection
- Modify: `src/lib/services/image/logo-persistence.ts` — remove `buildMemoryPressureResult()` function

### Task 3.10: Remove memory from cache invalidation

**Files:**

- Modify: `src/lib/cache/invalidation.ts` — remove `ServerCacheInstance` import and any `ServerCacheInstance.del()` calls

### Task 3.11: Remove memory from metrics cache route

**Files:**

- Delete: `src/app/api/metrics/cache/route.ts` (63 lines) — this entire route only reports memory/cache metrics that no longer exist
- OR rewrite to report only basic process info if the endpoint is still needed

### Task 3.12: Remove memory from scripts

**Files:**

- Modify: `scripts/audit-s3-paths.ts` — remove `getMemoryHealthMonitor` import

### Task 3.13: Pause and verify

**Step 1: Run type-check**
Run: `bun run type-check 2>&1 | grep "error TS" | sort -u > /tmp/memory-removal-errors-phase3.txt`
Expected: Remaining errors should only be `ServerCacheInstance` usage in data-access/search/component files.

**Step 2: Commit Phase 3**

```bash
git add -A && git commit -m "refactor: remove memory pressure from proxy, health, search, image pipeline (Phase 3)

Strip memory pressure middleware from request pipeline, simplify health
endpoints, remove memory monitoring from instrumentation, and clean up
all memory-aware guards from image and search subsystems."
```

---

## Phase 4: Migrate ServerCache Consumers (~25 files)

This is the bulk of the work. Each file that used `ServerCacheInstance.get()`/`.set()` needs to adopt idiomatic Next.js patterns.

**Pattern guide:**

| Old Pattern                                                           | New Pattern                                                    | When to Use                        |
| --------------------------------------------------------------------- | -------------------------------------------------------------- | ---------------------------------- |
| `ServerCacheInstance.get(key)` / `.set(key, val, ttl)` in data-access | `unstable_cache(fn, [keys], { revalidate, tags })`             | Server-side data fetching with TTL |
| `ServerCacheInstance` in React server component                       | `React.cache(fn)` for dedup + `unstable_cache` for persistence | Component-level data access        |
| Module-level `Map` with TTL                                           | `unstable_cache()` wrapper                                     | Bookmarks, books, slug caches      |
| `ServerCacheInstance` in search                                       | `unstable_cache()` with search-specific tags                   | Search index caching               |

### Task 4.1: Migrate data-access files

**Files to modify (remove `ServerCacheInstance` import and rewrite cache logic):**

- `src/lib/data-access/opengraph.ts` — wrap OG fetch in `unstable_cache` with `revalidate: 86400` (24h), tag `['opengraph']`
- `src/lib/data-access/opengraph-refresh.ts` — remove cache clear; use `revalidateTag('opengraph')` instead
- `src/lib/data-access/github-public-api.ts` — wrap GitHub API call in `unstable_cache` with `revalidate: 3600` (1h), tag `['github']`
- `src/lib/data-access/logos.ts` — wrap logo lookup in `unstable_cache` with `revalidate: 2592000` (30d), tag `['logos']`

**Implementation pattern for each:**

```typescript
import { unstable_cache } from "next/cache";

// Replace:
//   const cached = ServerCacheInstance.get<T>(key);
//   if (cached) return cached;
//   const data = await fetchData();
//   ServerCacheInstance.set(key, data, ttl);
//   return data;
//
// With:
const getCachedData = unstable_cache(
  async (param: string) => {
    return await fetchData(param);
  },
  ["data-namespace"],
  { revalidate: TTL_SECONDS, tags: ["domain-tag"] },
);
```

### Task 4.2: Migrate search files

**Files to modify:**

- `src/lib/search/loaders/static-content.ts` — remove `ServerCacheInstance`, use `unstable_cache` for static search index
- `src/lib/search/loaders/dynamic-content.ts` — remove `ServerCacheInstance`, use `unstable_cache` for dynamic index
- `src/lib/search/searchers/dynamic-searchers.ts` — remove `ServerCacheInstance` usage
- `src/lib/search/searchers/ai-analysis-searcher.ts` — remove `ServerCacheInstance` usage
- `src/lib/search/searchers/tag-search.ts` — remove `ServerCacheInstance` usage
- `src/lib/search/search-factory.ts` — remove `ServerCacheInstance` usage

### Task 4.3: Migrate content/component files

**Files to modify:**

- `src/lib/content-similarity/aggregator.ts` — use `unstable_cache` with `revalidate: 86400`, tag `['aggregated-content']`
- `src/components/features/related-content/related-content.server.tsx` — use `React.cache()` for per-request dedup + `unstable_cache` for persistence
- `src/app/api/related-content/route.ts` — remove `ServerCacheInstance`

### Task 4.4: Migrate AI/RAG files

**Files to modify:**

- `src/lib/ai/rag/inventory-pagination.ts` — remove `ServerCacheInstance`
- `src/lib/ai/rag/inventory-context.ts` — remove `ServerCacheInstance`

### Task 4.5: Migrate image service files

**Files to modify:**

- `src/lib/services/unified-image-service.ts` — remove `ServerCacheInstance` import
- `src/lib/services/image/logo-fetcher.ts` — remove `ServerCacheInstance`, use `unstable_cache` for logo lookups
- `src/lib/services/image/logo-validators.ts` — remove `ServerCacheInstance`
- `src/lib/services/image/logo-persistence.ts` — remove `ServerCacheInstance`

### Task 4.6: Migrate blog server search

**Files to modify:**

- `src/lib/blog/server-search.ts` — remove `ServerCacheInstance`, use `unstable_cache` for blog search index

### Task 4.7: Migrate bookmarks cache route

**Files to modify:**

- `src/app/api/cache/bookmarks/route.ts` — remove `ServerCacheInstance`; this route may need to call `revalidateTag('bookmarks')` instead of clearing cache directly

### Task 4.8: Remove domain-specific in-memory caches

**Files to modify:**

- `src/lib/bookmarks/cache-management.server.ts` — remove `fullDatasetMemoryCache`, `bookmarkByIdCache`, `lightweightBookmarkByIdCache` Maps. Replace with `unstable_cache` wrappers using tag `['bookmarks']`, `revalidate: 300` (5 min)
- `src/lib/bookmarks/slug-helpers.ts` — remove `cachedMapping` and `cachedReverseMap` module-level Maps. Replace with `unstable_cache`
- `src/lib/bookmarks/config.ts` — remove `FULL_DATASET_MEMORY_CACHE_TTL_MS`, `BOOKMARK_BY_ID_CACHE_TTL_MS`, `BOOKMARK_BY_ID_CACHE_LIMIT` constants
- `src/lib/blog.ts` — remove `notFoundSlugUntilMs` negative cache Map. Either replace with `unstable_cache` or simply remove (negative caching for blog slugs is a micro-optimization)
- `src/lib/books/audiobookshelf.server.ts` — remove `lastBooksSnapshot` module-level cache. Replace with `unstable_cache` with `revalidate: 21600` (6h), tag `['books']`
- `src/lib/books/books-data-access.server.ts` — remove module-level cache. Replace with `unstable_cache` with `revalidate: 3600` (1h), tag `['books']`

### Task 4.9: Clean up vitest setup

**Files to modify:**

- `config/vitest/setup.ts` — remove `ServerCacheInstance` import (line 15) and any cache clearing in test setup

### Task 4.10: Pause and verify

**Step 1: Run type-check**
Run: `bun run type-check`
Expected: 0 errors (or only pre-existing non-memory errors)

**Step 2: Run validate**
Run: `bun run validate`
Expected: Pass

**Step 3: Run tests**
Run: `bun run test`
Expected: Many test failures from deleted mocks — these are addressed in Phase 5

**Step 4: Commit Phase 4**

```bash
git add -A && git commit -m "refactor: migrate all ServerCache consumers to unstable_cache (Phase 4)

Replace custom Map-based caching with Next.js 16 unstable_cache() for
server-side data fetching and React.cache() for per-request dedup.
Remove all domain-specific in-memory Map caches from bookmarks, blog,
and books modules."
```

---

## Phase 5: Delete Types, Tests, Docs, Env Vars (~20 files)

### Task 5.1: Clean up type files

**Files to modify:**

- `src/types/middleware.ts` — remove `MemoryPressureLevel`, `MemoryPressureStatus`, `MemoryPressureOverrides` (lines 11-25). Keep: `RateLimitConfig`, `RateLimitProfile`, `RateLimitProfileName`, `ProxyRequestClass`, `SitewideRateLimitOptions`, `ProxyFunction`
- `src/types/health.ts` — remove `MemoryStatus`, `HealthCheckResult`, `MiddlewareRequest`, `MiddlewareResponse`, `MiddlewareNextFunction`, `MemoryMetrics`, `HealthMetricsResponseSchema`, `HealthMetrics` (lines 23-99). Keep: `DeepCheckResult`, `DeploymentReadinessCheckResult`
- `src/types/cache.ts` — remove `Cache` interface, `CacheStats`, `CacheValue`, `StorableCacheValue`, `ServerCacheMapEntry` (lines 75-151). Keep: `ImageCacheEntry`, `LogoValidationResult`, `LogoFetchResult`, `LogoResultBuilder`, `InvertedLogoEntry`, `GitHubActivityCacheEntry`, `BookmarksCacheEntry`, `SearchCacheEntry`, `CachedSlugMapping` — these are domain types used outside cache context
- `src/types/image.ts` — remove `ImageMemoryMetrics` type (lines 72-79 per audit). Keep all other image types.
- `src/types/services.ts` — remove `SchedulerMetrics` and `ScheduledRequest` types. Remove `RequestPriority` enum. Keep any non-memory service types.
- `src/types/batch-processing.ts` — remove `memoryThreshold` from `BatchProcessorOptions` (line 21), remove `memoryPressureEvents` from `BatchResult` (line 35)

### Task 5.2: Delete memory-specific test files

**Files to delete:**

- `__tests__/lib/memory-management.test.ts`
- `__tests__/lib/memory-health-monitor.test.ts`
- `__tests__/lib/memory-pressure-middleware.test.ts`
- `__tests__/lib/middleware/memory-pressure.test.ts`
- `__tests__/api/search-memory.test.ts`
- `__tests__/lib/caching/server-cache-simple.test.ts`
- `__tests__/lib/caching/server-cache-search.test.ts`
- `__tests__/lib/caching/server-cache-opengraph.test.ts`
- `__tests__/lib/caching/server-cache-logos.test.ts`
- `__tests__/lib/caching/server-cache-core.test.ts`
- `__tests__/lib/caching/server-cache-init.test.ts`

### Task 5.3: Fix remaining test files

**Files to modify:**

- `__tests__/api/ai/chat-rag-helpers.test.ts` — remove `memoryPressureMiddleware` mock/import
- `__tests__/lib/search/api-guards.test.ts` — remove `checkMemoryPressure`, `getCriticalThreshold`, `isMemoryCritical` imports and tests
- `__tests__/lib/search/bookmarks-s3-fallback.test.ts` — remove `ServerCacheInstance` mock
- `__tests__/lib/search/search-books.test.ts` — remove `ServerCacheInstance` mock
- `__tests__/lib/bookmarks/bookmarks.test.ts` — remove `ServerCacheInstance` mock
- `__tests__/lib/search/search.test.ts` — remove `ServerCacheInstance` mock

### Task 5.4: Update documentation

**Files to modify/delete:**

- Delete: `docs/architecture/memory-management.md` (434 lines)
- Modify: `docs/architecture/README.md` — remove references to memory-pressure shedding
- Modify: `docs/architecture/security-rate-limiting.md` — remove memory shedding section
- Modify: `docs/architecture/ai-services.md` — remove memory pressure shedding section
- Modify: `docs/file-map.md` — remove memory-pressure file entries, remove server-cache entries
- Modify: `docs/features/bookmarks.md` — remove references to in-memory cache if present

### Task 5.5: Clean up env vars

**Files to modify:**

- `.env-example` — remove all memory-related env vars:
  - `TOTAL_PROCESS_MEMORY_BUDGET_BYTES`
  - `IMAGE_RAM_BUDGET_BYTES`
  - `SERVER_CACHE_BUDGET_BYTES`
  - `MEMORY_WARNING_THRESHOLD`
  - `MEMORY_CRITICAL_THRESHOLD`
  - `IMAGE_STREAM_THRESHOLD_BYTES`
  - `MAX_IMAGE_SIZE_BYTES`
  - `IMAGE_RSS_THRESHOLD`
  - `IMAGE_HEAP_THRESHOLD`
  - `MEMORY_PRESSURE_CRITICAL`
  - `MEMORY_PRESSURE_WARNING`
  - `MEMORY_CRITICAL_BYTES`
  - `MEMORY_CRITICAL_PERCENT`

### Task 5.6: Clean up next.config.ts comments

**Files to modify:**

- `next.config.ts` — remove comments referencing memory:
  - Line 329: `productionBrowserSourceMaps: false, // Disable to save memory during builds` — keep the setting, remove the memory comment
  - Line 347: `serverSourceMaps: false, // Disable server source maps to save memory` — keep the setting, remove the memory comment
  - Lines 351-353: comments about memory-related features
  - Line 376: `// Enable experimental memory-efficient image optimization` comment

### Task 5.7: Update status page consumer

**Files to modify:**

- `src/app/status/page.tsx` — remove `HealthMetricsResponseSchema` import and update to match simplified health metrics format

### Task 5.8: Pause and verify

**Step 1: Run full validate**
Run: `bun run validate`
Expected: 0 errors, 0 warnings

**Step 2: Run tests**
Run: `bun run test`
Expected: All tests pass (memory tests deleted, remaining tests fixed)

**Step 3: Commit Phase 5**

```bash
git add -A && git commit -m "refactor: delete memory types, tests, docs, and env vars (Phase 5)

Remove all memory-specific type definitions, 11 test files testing
deleted infrastructure, stale documentation, and unused environment
variables. Update remaining test files to remove ServerCache mocks."
```

---

## Phase 6: Final Verification

### Task 6.1: Full build

Run: `bun run build`
Expected: Build succeeds with no memory-related warnings

### Task 6.2: Full validation suite

Run: `bun run validate`
Expected: 0 errors, 0 warnings

### Task 6.3: Full test suite

Run: `bun run test`
Expected: All tests pass

### Task 6.4: Grep for remnants

Run the following searches to confirm zero memory management code remains:

```bash
# Should all return 0 results (in src/ only, excluding node_modules)
grep -r "ServerCacheInstance" src/ --include="*.ts" --include="*.tsx"
grep -r "MEMORY_THRESHOLDS" src/ --include="*.ts" --include="*.tsx"
grep -r "MemoryHealthMonitor" src/ --include="*.ts" --include="*.tsx"
grep -r "memoryPressureMiddleware" src/ --include="*.ts" --include="*.tsx"
grep -r "MemoryAwareRequestScheduler" src/ --include="*.ts" --include="*.tsx"
grep -r "process\.memoryUsage" src/ --include="*.ts" --include="*.tsx"
grep -r "cgroup" src/ --include="*.ts" --include="*.tsx"
grep -r "memory-health-monitor" src/ --include="*.ts" --include="*.tsx"
grep -r "server-cache" src/ --include="*.ts" --include="*.tsx"
grep -r "proactiveEviction" src/ --include="*.ts" --include="*.tsx"
```

### Task 6.5: Dev server smoke test

Run: `bun run dev`
Expected: No cgroup errors, no memory pressure warnings in console

### Task 6.6: File size check

Run: `bun run check:file-size`
Expected: No new violations (deletions should only reduce file sizes)

### Task 6.7: Final commit

```bash
git add -A && git commit -m "refactor: complete memory management removal — verify clean

All custom memory management, caching, and memory pressure
infrastructure removed. Replaced with idiomatic Next.js 16 patterns:
unstable_cache() for data persistence, React.cache() for per-request
dedup, revalidateTag() for cache invalidation."
```

---

## Summary of Deleted Files (~20 files)

| File                                         | Lines      | Purpose                                       |
| -------------------------------------------- | ---------- | --------------------------------------------- |
| `src/lib/middleware/memory-pressure.ts`      | 239        | Memory pressure middleware                    |
| `src/lib/middleware/health-check-paths.ts`   | 30         | Health check path exemptions                  |
| `src/lib/health/memory-health-monitor.ts`    | 502        | Singleton health monitor                      |
| `src/lib/services/memory-aware-scheduler.ts` | 359        | Memory-aware request scheduler                |
| `src/lib/server-cache.ts`                    | 484        | Custom Map-based cache                        |
| `src/lib/server-cache/bookmarks.ts`          | ~60        | Bookmark cache helpers                        |
| `src/lib/server-cache/github.ts`             | ~50        | GitHub cache helpers                          |
| `src/lib/server-cache/logo.ts`               | ~80        | Logo cache helpers                            |
| `src/lib/server-cache/opengraph.ts`          | ~50        | OG cache helpers                              |
| `src/lib/server-cache/search.ts`             | ~50        | Search cache helpers                          |
| `src/lib/server-cache/aggregated-content.ts` | ~40        | Aggregated content helpers                    |
| `src/lib/server-cache/jina-fetch-limiter.ts` | ~40        | Jina rate limit cache                         |
| `src/lib/middleware/cache-debug.ts`          | ~30        | Cache debug middleware                        |
| `src/lib/test-utils/cache-tester.ts`         | ~30        | Test cache utility                            |
| `src/types/server-cache.d.ts`                | ~30        | Type declarations                             |
| `docs/architecture/memory-management.md`     | 434        | Architecture doc                              |
| 11 test files                                | ~800       | Tests for deleted code                        |
| **Total**                                    | **~3,300** | **Lines of custom memory management removed** |

## Summary of Modified Files (~35 files)

All modifications are deletions of imports and cache interaction code, replaced with `unstable_cache()` / `React.cache()` / `revalidateTag()` calls.
