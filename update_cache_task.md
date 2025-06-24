# ZERO TEMPERATURE & Next.js 15 'use cache' Migration Compliance Checklist

> **No code changes may proceed unless every checklist item is checked and validated with zero errors/warnings.**

## Migration Preparation

- [ ] **Inventory all usages of ImageMemoryManager and ServerCache**
  - [ ] List all files/functions using these caches
  - [ ] Map all cache keys and TTLs
- [ ] **Stabilize Sharp concurrency and native memory monitoring**
  - [ ] Limit Sharp concurrency
  - [ ] Add native memory monitoring to instrumentation
  - [ ] Set memory budget constants

## Next.js 15 'use cache' Migration

- [ ] **Enable experimental 'use cache' or dynamicIO in next.config.ts**
- [ ] **Wrap all direct SDK/DB calls in 'use cache' async functions**
- [ ] **Remove all unstable_cache imports and usages**
- [ ] **'use cache' is the first line in all cacheable async functions**
- [ ] **Validate all arguments/return values of cacheable functions are JSON-serializable and type-safe**
- [ ] **Add Zod validation to all fallback logic for external data**
- [ ] **Use only string cache profiles ('hours', 'days', 'weeks') unless custom config is required**
- [ ] **Call cacheTag() once per tag, not with multiple arguments**
- [ ] **Tag names in cacheTag() are string literals or deterministic strings from arguments**
- [ ] **Test cache invalidation for every cacheTag() and revalidateTag() usage**
- [ ] **Document all cacheTag and revalidateTag usages in architecture/feature docs**
- [ ] **Test all cacheTag and revalidateTag usages (manual or automated)**
- [ ] **All cache keys are deterministic and do not include non-serializable values**
- [ ] **Do not use 'use cache' in Edge or Client runtime code (Node.js/server only)**
- [ ] **Obtain explicit, repeated, clear user consent before creating any new file**
- [ ] **Update all references to removed legacy cache utilities**

## Validation & Documentation

- [ ] **Run 'bun run validate' before and after every change**
- [ ] **Run 'bun run validate' after toggling feature flags**
- [ ] **Run 'bun run validate' after removing legacy code**
- [ ] **Update all relevant documentation after migration**
  - [ ] Architecture entrypoint
  - [ ] File overview map
  - [ ] Caching docs
  - [ ] Onboarding/training docs
- [ ] **Communicate migration and new cache invalidation patterns to all developers**

## Monitoring & Success Criteria

- [ ] **Monitor cache hit/miss ratios, memory usage, and error rates for at least 1 week post-migration**
- [ ] **Validate memory and performance targets are met**
- [ ] **Test rollback procedures (feature flag, git revert, full rollback)**
- [ ] **All fallback logic is type-safe and validated**
- [ ] **Changing function arguments or their order creates a new cache entry; argument types and order are carefully managed**

---

## Explicit User Consent for New Files

> **NO NEW FILES WITHOUT EXPLICIT REPEATED CLEAR AFFIRMATIVE CONSENT**

**Consent template:**

```
Should I create a new file [filename] for [purpose]? Please reply "yes" to confirm.
```

- [ ] Explicit user consent obtained for every new file:
  - [ ] [filename1] ([purpose1])
  - [ ] [filename2] ([purpose2])

---

## Serializability Validation

> **All arguments and return values of cacheable functions must be JSON-serializable and type-safe.**

**Validation template:**

```ts
import { isPlainObject } from 'is-plain-object';

function validateSerializable(value: unknown): boolean {
  return (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    value === null ||
    Array.isArray(value) ||
    isPlainObject(value)
  );
}
```

- [ ] All cacheable function arguments and return values are serializable and type-safe

---

## Edge Runtime Warning

> **'use cache' is NOT supported in Edge or Client runtime code. Use only in Node.js/server code.**

- [ ] No usage of 'use cache' in Edge or Client runtime code

---

## Additional Notes

- All code snippets and comments must be clear, specific, and succinct per ZERO TEMPERATURE standards.
- Reference this checklist in each phase/section below.
- Remove any redundant or verbose language for clarity and compliance.

---

## Migration Plan

  This plan migrates from custom caching (ImageMemoryManager + ServerCache) to Next.js 15 native caching using the experimental
   'use cache' directive, addressing the root cause of memory issues where 3.3GB of native memory (outside JavaScript heap) is
   causing crashes. The 'use cache' directive provides automatic caching with fine-grained control over cache lifetimes and
   invalidation through tags.

  IMPORTANT: Next.js 15 'use cache' is experimental and requires enabling the `dynamicIO` experimental flag in `next.config.ts`.
  All changes must be validated with `bun run validate` and all documentation must be updated per repository rules.
  Documentation: <https://nextjs.org/docs/app/api-reference/directives/use-cache>

  ---
  PHASE 1: Assessment & Inventory

  1.1 Usage Point Discovery

```bash
# Find all ImageMemoryManager usage
grep -r "ImageMemoryManager" --include="*.ts" --include="*.tsx" .
grep -r "ImageMemoryManagerInstance" --include="*.ts" --include="*.tsx" .

# Find all ServerCache usage
grep -r "ServerCache" --include="*.ts" --include="*.tsx" .
grep -r "ServerCacheInstance" --include="*.ts" --include="*.tsx" .
```

  1.2 Create Migration Matrix

  | Component      | Cache Type  | Key Pattern | TTL | Invalidation | Migration Target |
  |----------------|-------------|-------------|-----|--------------|------------------|
  | Logo API       | ImageMemory | logo:{url}  | 30d | Never        | Route Handler    |
  | OG Images      | ImageMemory | og:{id}     | 7d  | On update    | Route Handler    |
  | Bookmarks      | ServerCache | bookmarks:* | 1h  | On refresh   | 'use cache'      |
  | GitHub Data    | ServerCache | github:*    | 24h | Daily        | 'use cache'      |
  | Search Results | ServerCache | search:{q}  | 15m | Never        | 'use cache'      |

  1.3 Critical Dependencies Map

  ┌─────────────────┐
  │ ImageMemManager │──┐
  └─────────────────┘  │
                       ├──► S3Utils ──► Sharp ──► Native Memory
  ┌─────────────────┐  │
  │  ServerCache    │──┘
  └─────────────────┘

  Key Risks:

- S3Utils depends on both caches
- Sharp allocates native memory we can't control
- Multiple components may share cache keys
- 'use cache' is experimental in Next.js 15 (requires dynamicIO flag)
- Must handle migration from `unstable_cache` patterns to 'use cache' directive

  ---
  PHASE 2: Immediate Stabilization (Pre-Migration Setup)

  2.1 Sharp Concurrency Limiting

  Create lib/utils/sharp-processor.ts:

```ts
import pLimit from 'p-limit';
import sharp from 'sharp';

// Start conservative - only 2 concurrent Sharp operations
const limit = pLimit(2);

export interface ProcessOptions {
  width?: number;
  height?: number;
  quality?: number;
}

export const processImageSafely = async (
  buffer: Buffer,
  options: ProcessOptions
): Promise<Buffer> => {
  return limit(async () => {
    try {
      // Force garbage collection if available
      if (global.gc) global.gc();

      const result = await sharp(buffer)
        .resize(options.width, options.height)
        .webp({ quality: options.quality || 80 })
        .toBuffer();

      // Clear sharp cache after each operation
      sharp.cache(false);
      sharp.concurrency(1);

      return result;
    } catch (error) {
      console.error('Sharp processing failed:', error);
      throw error;
    }
  });
};
```

  2.2 Native Memory Monitoring

  Add to instrumentation.ts:
  if (process.env.NODE_ENV === "development") {
    setInterval(() => {
      const usage = process.memoryUsage();
      const nativeMemory = usage.rss - usage.heapTotal;

      if (nativeMemory > 1024 * 1024 * 1024) { // 1GB
        console.warn(`High native memory: ${Math.round(nativeMemory / 1024 / 1024)}MB`);
      }
    }, 30000).unref();
  }

  2.3 Memory Budget Fixes

  Update lib/constants.ts:
  const DEFAULT_TOTAL_MEMORY_BUDGET_BYTES =
    process.env.NODE_ENV === "production"
      ? 3.75 *1024* 1024 *1024  // 3.75GB for 4GB container
      : 2* 1024 *1024* 1024;     // 2GB for development

  ---
  PHASE 3A: ServerCache → 'use cache' Directive Migration

  3.1 Enable Experimental 'use cache' in next.config.ts

  Update next.config.ts (choose one option):
  
  Option A - Enable useCache directly:
  experimental: {
    // ... existing experimental options
    useCache: true,  // Enable the 'use cache' directive
  }
  
  Option B - Enable via dynamicIO (includes 'use cache' and other features):
  experimental: {
    // ... existing experimental options
    dynamicIO: true,  // Enables 'use cache' + other dynamic features
  }

  3.2 Simplified Migration Helpers

  Create lib/cache/migration-helpers.ts:
  import 'server-only';

  // Simple feature flag check
  export const USE_NEXTJS_CACHE = process.env.USE_NEXTJS_CACHE === 'true';

  // Type for cache profile selection
  export type CacheProfile = 'seconds' | 'minutes' | 'hours' | 'days' | 'weeks' | 'max';

  export function getCacheProfile(ttlSeconds: number): CacheProfile {
    if (ttlSeconds <= 60) return 'minutes';
    if (ttlSeconds <= 3600) return 'hours';
    if (ttlSeconds <= 86400) return 'days';
    return 'weeks';
  }

  // Error boundary for cache fallbacks
  export async function withCacheFallback<T>(
    cachedFn: () => Promise<T>,
    fallbackFn: () => Promise<T>
  ): Promise<T> {
    try {
      return await cachedFn();
    } catch (error) {
      console.warn('Cache function failed, using fallback:', error);
      return await fallbackFn();
    }
  }

  3.3 Component Migration Example

  Before (ServerCache):
  const cached = ServerCacheInstance.get('bookmarks:index');
  if (cached) return cached;
  const fresh = await fetchBookmarksFromS3();
  ServerCacheInstance.set('bookmarks:index', fresh);
  return fresh;

  After (using 'use cache' directive):
  export async function getBookmarksIndex() {
    'use cache'; // MUST be the very first line of the function.

    cacheLife('hours'); // Use predefined profile for consistency
    cacheTag('bookmarks');

    return await fetchBookmarksFromS3();
  }

  // With error fallback
  export async function getBookmarksIndexSafe() {
    return withCacheFallback(
      async () => {
        'use cache'; // MUST be the very first line
        cacheLife('hours');
        cacheTag('bookmarks');
        // Ensure the return value is serializable
        return await fetchBookmarksFromS3();
      },
      async () => {
        // Fallback without cache
        return await fetchBookmarksFromS3();
      }
    );
  }

  3.4 Bookmarks Data Access Migration

  Update lib/bookmarks/bookmarks-data-access.server.ts:
  
  // Add at top of file
  import { cacheLife, cacheTag, revalidateTag } from 'next/cache';
  
  // Migrate getBookmarks function
  export async function getBookmarks(options: BookmarkLoadOptions = {}) {
    'use cache'; // MUST be the very first line

    // Configure cache behavior
    cacheLife({
      revalidate: options.skipExternalFetch ? false : 3600,
      stale: 300,
      expire: 86400
    });

    // Tag for invalidation
    cacheTag('bookmarks-all');

    // Existing implementation remains the same
    // WARNING: Ensure the return value is serializable.
    return fetchAndCacheBookmarks(options);
  }
  
  // Migrate getBookmarksPage
  export async function getBookmarksPage(pageNumber: number) {
    'use cache'; // MUST be the very first line

    cacheLife('hours'); // Use predefined profile
    cacheTag('bookmarks');
    cacheTag(`bookmarks-page-${pageNumber}`);

    // Existing implementation
    const pageKey = `${BOOKMARKS_S3_PATHS.PAGE_PREFIX}${pageNumber}.json`;
    // ... rest of implementation
  }

  3.5 Cache Invalidation Pattern

  // Invalidate specific tags when data changes
  import { revalidateTag } from 'next/cache';

  export async function refreshBookmarks() {
    // Perform refresh logic
    const result = await refreshAndPersistBookmarks();

    if (result) {
      // Invalidate all bookmark-related caches
      revalidateTag('bookmarks');
      revalidateTag('bookmarks-all');

      // Invalidate specific pages if needed
      for (let i = 1; i <= totalPages; i++) {
        revalidateTag(`bookmarks-page-${i}`);
      }
    }

    return result;
  }

  3.6 VALIDATION STEP

- Run `bun run validate` to ensure no new errors have been introduced.
- Update `docs/projects/structure/caching.md` and `docs/projects/file-overview-map.md` with the changes.

  ---
  PHASE 3B: Understanding Next.js 15 'use cache' Directive

  Based on Next.js 15 documentation (<https://nextjs.org/docs/app/api-reference/directives/use-cache>):

  3B.1 Key Concepts

  The 'use cache' directive enables automatic request-level caching in Next.js 15:

- Works at file, component, or function level
- MUST BE THE VERY FIRST LINE in the function/component (before any other code)
- Functions MUST be `async`
- Arguments and return values MUST BE SERIALIZABLE (plain objects, arrays, primitives)
- Automatically deduplicates requests within the same render pass
- Caches across requests with configurable lifetimes
- Requires experimental `useCache` or `dynamicIO` flag in `next.config.ts`

  3B.2 Cache Lifetime Configuration

  Use `cacheLife()` to configure cache behavior. **Note: This API is experimental.**
  
  It is recommended to use the predefined string profiles for consistency (e.g., 'seconds', 'minutes', 'hours', 'days').
  
  import { cacheLife } from 'next/cache';
  
  async function getData() {
    'use cache'; // MUST be the very first line
    cacheLife('hours'); // Use predefined profile
    // OR custom configuration:
    cacheLife({
      revalidate: 3600,    // Revalidate after 1 hour
      stale: 300,          // Serve stale for 5 minutes during revalidation
      expire: 86400        // Expire after 24 hours
    });

    return await fetch('/api/data');
  }
  
  type CacheLife = {
    revalidate?: number | false;  // Seconds until cache expires
    stale?: number;               // Seconds to serve stale while revalidating
    expire?: number;              // Max seconds to keep in cache
  }

  Default profiles available:

- 'default': { revalidate: false, stale: undefined, expire: undefined }
- 'seconds': { revalidate: 1, stale: 1, expire: 1 }
- 'minutes': { revalidate: 60, stale: 300, expire: 3600 }
- 'hours': { revalidate: 3600, stale: 3600, expire: 86400 }
- 'days': { revalidate: 86400, stale: 86400, expire: 604800 }
- 'weeks': { revalidate: 604800, stale: 604800, expire: 2592000 }
- 'max': { revalidate: false, stale: 9999999999, expire: 9999999999 }

  3B.3 Cache Tagging for Invalidation

  Use `cacheTag()` to add tags for targeted invalidation. **Note: This API is experimental.**
  Invalidation can be triggered via `revalidateTag('tag-name')` or `revalidatePath('/path-to-page')`.
  
  import { cacheTag } from 'next/cache';
  
  async function getCachedData(userId: string) {
    'use cache'; // MUST be the very first line

    // CORRECT USAGE: Call cacheTag() once for each tag.
    cacheTag('bookmarks');
    cacheTag(`user-${userId}`);

    // Your cached logic here
    return data;
  }
  
  // Later, invalidate via:
  import { revalidateTag } from 'next/cache';
  await revalidateTag('bookmarks');

  3B.4 Important Constraints

- Only works in Server Components and Server Actions
- Cannot be used in Client Components
- Must be the first line of the function (before any other code)
- Functions must be async
- Cannot use inside conditionals or loops
- Works with fetch() and database queries
- Respects dynamic = 'force-dynamic' to bypass cache
- Cannot be used with request-time APIs like cookies() or headers() when caching routes
- Default revalidation period is 15 minutes (configurable via cacheLife)
- Non-serializable arguments become references (can pass through but not inspect)

  3B.5 Migration Pattern from unstable_cache

  From unstable_cache:
  const getCachedData = unstable_cache(
    async () => fetchData(),
    ['cache-key'],
    { revalidate: 3600, tags: ['data'] }
  );

  To 'use cache':
  async function getCachedData() {
    'use cache';
    cacheLife('hours');
    cacheTag('data');
    return fetchData();
  }
  
  Key differences:

- 'use cache' must be first line in function
- Cache key is automatically generated from function inputs
- Use cacheLife() and cacheTag() instead of options object
- Function must be async
- Arguments become part of cache key automatically

  3B.6 Platform Support & Limitations

  Supported:

- Node.js server deployments
- Docker containers
- Self-hosting with proper cache configuration
  
  Not Supported:

- Static exports
- Edge runtime (partial support via adapters)
  
  Cache Storage:

- Server: In-memory cache
- Client: Browser memory for session duration
- Default revalidation: 15 minutes (configurable)

  3B.7 Build Time vs Runtime Behavior

  **Build Time ('use cache' on pages/layouts):**

- Route segments are prerendered at build time
- Cannot use request-time APIs (cookies, headers)  
- Content is static until revalidation
- Must add 'use cache' to BOTH layout and page files

  **Runtime ('use cache' on functions/components):**

- Server: In-memory cache with 15min default revalidation
- Client: Browser memory for session duration  
- Can use dynamic data sources
- Functions are cached based on their arguments

  Example of caching entire routes:
  ```ts
  // app/projects/layout.tsx
  'use cache';
  
  export default function Layout({ children }) {
    return <div>{children}</div>;
  }
  
  // app/projects/page.tsx
  'use cache';
  
  import { cacheLife, cacheTag } from 'next/cache';
  
  export default async function ProjectsPage() {
    cacheLife('days');
    cacheTag('projects-page');
    
    const projects = await getProjects();
    return <ProjectsGrid projects={projects} />;
  }
  ```

  ---
  PHASE 3C: ImageMemoryManager → Route Handlers

  3C.1 Create Cached S3 Data Accessor
  
  Direct SDK calls (e.g., AWS S3 Client) are NOT automatically cached by Next.js. We must wrap them in a function using the 'use cache' directive.
  
  Create lib/data-access/images.server.ts:

```ts
import 'server-only';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { cacheLife, cacheTag } from 'next/cache';
import { env } from '@/lib/env';

const s3Client = new S3Client({ region: env.AWS_REGION });

export async function getCachedS3Image(key: string): Promise<Buffer> {
  'use cache';

  cacheLife('weeks'); // Images are immutable, long cache lifetime. It's recommended to use string profiles.
  cacheTag('image');
  cacheTag(`image-key-${key}`);

  const command = new GetObjectCommand({
    Bucket: env.S3_BUCKET_NAME,
    Key: key,
  });

  try {
    const response = await s3Client.send(command);
    if (!response.Body) {
      throw new Error(`No body in S3 response for key: ${key}`);
    }
    return Buffer.from(await response.Body.transformToByteArray());
  } catch (error) {
     console.error(`S3 Image fetch failed for key ${key}:`, error);
     throw error;
  }
}
```

  3C.2 Create Image Route Handler

  The route handler now calls the cached data accessor.
  
  app/api/images/[...segments]/route.ts:
  import { NextRequest, NextResponse } from 'next/server';
  import { processImageSafely } from '@/lib/utils/sharp-processor';
  import { getCachedS3Image } from '@/lib/data-access/images.server';

  export async function GET(
    request: NextRequest,
    { params }: { params: { segments: string[] } }
  ) {
    try {
      const key = params.segments.join('/');
      const cacheControl = 'public, max-age=31536000, immutable';

      // Fetch from S3 using our cached function
      const buffer = await getCachedS3Image(key);

      // Process with concurrency limiting
      const processed = await processImageSafely(buffer, {
        width: 512,
        quality: 80,
      });

      return new NextResponse(processed, {
        headers: {
          'Content-Type': 'image/webp',
          'Cache-Control': cacheControl,
        },
      });
    } catch (error) {
      console.error(`Image processing failed:`, error);
      return new NextResponse('Image not found', { status: 404 });
    }
  }

  3C.3 Update Image References

  Before:
  const imageUrl = await getProcessedImageUrl(logoUrl);

  After:
  const imageUrl = `/api/images/${encodeURIComponent(logoUrl)}`;

  ---
  PHASE 4: Monitoring & Rollback

  4.1 Memory Monitoring Dashboard

  app/api/admin/memory/route.ts:
  export async function GET() {
    const usage = process.memoryUsage();
    const stats = {
      timestamp: new Date().toISOString(),
      rss: Math.round(usage.rss / 1024 / 1024),
      heap: Math.round(usage.heapUsed / 1024 / 1024),
      native: Math.round((usage.rss - usage.heapTotal) / 1024 / 1024),
      sharpConcurrency: sharp.concurrency(),
      serverCacheSize: ServerCacheInstance?.getStats?.().keys || 0,
      imageCacheSize: ImageMemoryManagerInstance?.getMetrics?.().cacheSize || 0,
    };

    return NextResponse.json(stats);
  }

  4.2 Rollback Procedures

  ┌─────────────────┐
  │ Feature Flags   │ ◄── Immediate (seconds)
  ├─────────────────┤
  │ Git Revert      │ ◄── Fast (minutes)
  ├─────────────────┤
  │ Full Rollback   │ ◄── Emergency (hour)
  └─────────────────┘

  Feature Flag Rollback:

```bash
USE_NEXTJS_CACHE=false
USE_IMAGE_ROUTES=false
```

  ---
  PHASE 5: Cleanup & Removal

  5.1 File Removal (After Validation)

```bash
# Backup first
tar -czf cache-backup-$(date +%Y%m%d).tar.gz \
  lib/image-memory-manager.ts \
  lib/server-cache.ts

# Remove files
rm lib/image-memory-manager.ts
rm lib/server-cache.ts
```

  5.2 Docker Enhancement

```dockerfile
# Add jemalloc for better native memory management
RUN apt-get update && apt-get install -y libjemalloc2
ENV LD_PRELOAD=/usr/lib/x86_64-linux-gnu/libjemalloc.so.2
```

  ---
  PHASE 5B: Real-World Migration Examples for williamcallahan.com

  5B.1 Migrate GitHub Activity Data

  Before (using ServerCache):
  // lib/github/github-data.ts
  export async function getGitHubActivity() {
    const cached = ServerCacheInstance.get('github:activity');
    if (cached) return cached;

    const data = await fetchGitHubAPI();
    ServerCacheInstance.set('github:activity', data);
    return data;
  }

  After (using 'use cache'):
  // lib/github/github-data.ts
  import { cacheLife, cacheTag } from 'next/cache';
  
  export async function getGitHubActivity() {
    'use cache';

    cacheLife('days'); // Use predefined profile for 24h cache
    cacheTag('github');
    cacheTag('github-activity');
    
    return await fetchGitHubAPI();
  }

  5B.2 Migrate Search Results

  Before:
  // app/api/search/route.ts
  export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q') || '';
    const cacheKey = `search:${query}`;

    const cached = ServerCacheInstance.get(cacheKey);
    if (cached) return NextResponse.json(cached);
    
    const results = await performSearch(query);
    ServerCacheInstance.set(cacheKey, results);
    return NextResponse.json(results);
  }

  After:
  // lib/search/search-functions.ts
  export async function getSearchResults(query: string) {
    'use cache';

    cacheLife('minutes');  // 15 min cache
    cacheTag('search');
    cacheTag(`search-${query.slice(0, 20)}`);
    
    return await performSearch(query);
  }
  
  // app/api/search/route.ts
  export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q') || '';

    const results = await getSearchResults(query);
    return NextResponse.json(results);
  }

  5B.3 Caching Entire Routes

  // app/projects/page.tsx
  'use cache';
  
  import { cacheLife, cacheTag } from 'next/cache';
  
  export default async function ProjectsPage() {
    cacheLife('days');  // Cache for 1 day
    cacheTag('projects-page');

    const projects = await getProjects();
    
    return (
      <ProjectsGrid projects={projects} />
    );
  }

  5B.4 Interleaving Cached and Dynamic Content

  // app/blog/[slug]/page.tsx
  export default async function BlogPost({ params }: { params: { slug: string } }) {
    return (
      <>
        <CachedArticleContent slug={params.slug} />
        <DynamicComments slug={params.slug} />
      </>
    );
  }
  
  async function CachedArticleContent({ slug }: { slug: string }) {
    'use cache';

    cacheLife('weeks');  // Articles rarely change
    cacheTag('blog', `article-${slug}`);
    
    const article = await getArticleBySlug(slug);
    return <ArticleRenderer article={article} />;
  }

  ---
  PHASE 6: Validation & Success Criteria

  6.1 Memory Targets

  Before Migration:        After Migration:
  ┌─────────────────┐     ┌─────────────────┐
  │ RSS:    4.7 GB  │     │ RSS:    < 2 GB  │
  │ Heap:   1.4 GB  │ ──► │ Heap:   < 1 GB  │
  │ Native: 3.3 GB  │     │ Native: < 500MB │
  └─────────────────┘     └─────────────────┘

  6.2 Performance Targets

- Image API: < 100ms for cached responses
- Data API: < 50ms for cached responses
- Cache hit ratio: > 90%
- Zero memory pressure warnings

    6.3 Validation Checklist

  **General Validation:**
  - All feature flags tested individually
  - Load tests show no memory spikes
  - Error handling doesn't leak memory
  - Rollback procedures tested
  - Performance benchmarks met
  - Zero customer impact

  **Next.js 15 'use cache' Specific:**
  - 'use cache' functions properly with dynamicIO enabled
  - Cache invalidation works correctly with revalidateTag
  - Cache tags properly invalidate related data
  - Cache keys generate correctly from function arguments
  - Serializable return values verified
  - Non-serializable arguments handled as references
  - Build-time caching works for static routes
  - Runtime caching works for dynamic functions
  - Stale-while-revalidate behavior verified
  - Multiple cacheTag() calls working correctly
  - Cache profiles (hours, days, weeks) behave as expected
  - 'use cache' directive placement validated (first line of functions)

  ---
  Critical Mistakes to Avoid

  1. Starting migration without inventory - You'll miss dependencies
  2. Not stabilizing Sharp first - Migration will crash from memory spikes
  3. Migrating everything at once - No rollback path
  4. Removing old code too early - Need fallback during validation
  5. Not monitoring native memory - Miss the actual problem
  6. **Assuming non-`fetch` I/O is cached** - Next.js only auto-caches `fetch`. Direct DB/SDK calls must be explicitly wrapped in a `'use cache'` function.
  7. Ignoring performance regression - Users will notice
  8. Declaring success too early - Monitor for at least 1 week
  9. Not enabling dynamicIO flag - 'use cache' won't work without it
  10. Mixing unstable_cache and 'use cache' - Use one pattern consistently
  11. Forgetting to add cache tags - Can't invalidate without them
  12. **Calling cacheTag() with multiple arguments** - Must call once per tag: `cacheTag('tag1'); cacheTag('tag2');` not `cacheTag('tag1', 'tag2')`
  13. Not using predefined cache profiles - Use 'hours', 'days', 'weeks' instead of custom configurations when possible
  14. Putting 'use cache' in wrong position - Must be the very first line of async functions
  15. Forgetting both layout AND page for route caching - Both files need 'use cache' directive

  ---
  Migration Order (Risk-Based)

  1. Lowest Risk First:
  - GitHub data cache (low traffic)
  - Search results cache (short TTL)
  2. Medium Risk:
  - Bookmarks cache (moderate traffic)
  - OpenGraph data cache
  3. Highest Risk Last:
  - Logo image processing (high traffic)
  - OG image generation (critical path)
