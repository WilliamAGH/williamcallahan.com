# GitHub Issues by Functionality

This document organizes bugs and improvements by functionality area. Each issue combines related problems that should be addressed together.

---

## Analytics

### Issue: Modernize Analytics Implementation

**GitHub Issue**: [#110](https://github.com/WilliamAGH/williamcallahan.com/issues/110)

**Problem**: The analytics component currently uses a hardcoded 500ms setTimeout delay to wait for analytics scripts to load before tracking events. This approach is unreliable because it assumes all scripts will load within 500ms, which may fail on slow connections or under heavy load, causing analytics events to be lost.
**Solution**: Replace the brittle setTimeout approach with Next.js Script component's onLoad callback, which fires deterministically when the script has actually finished loading, ensuring analytics tracking always works regardless of network conditions.
**Affected Files**:

- `components/analytics/analytics.client.tsx`

---

## Batch Fetch Update

### Issue: Improve Batch Job Architecture and Reliability

**GitHub Issue**: [#111](https://github.com/WilliamAGH/williamcallahan.com/issues/111)

**Problem**: The batch processing system has several critical issues:

1. Uses `spawnSync` which blocks the entire scheduler if one job hangs
2. No protection against multiple instances running the same job concurrently, potentially corrupting data
3. No retry logic when external API calls fail, causing data gaps
4. Scripts parse TypeScript files using fragile regex patterns to extract data instead of proper imports
5. The entrypoint.sh script runs as root user, creating security vulnerabilities
6. No way to monitor if scheduled jobs are running or have failed
**Solution**:

- Replace spawnSync with async spawn to prevent blocking
- Implement distributed job locking (e.g., using Redis or file-based locks)
- Add exponential backoff retry logic for failed operations
- Add circuit breaker pattern to prevent cascading failures when external APIs are down
- Implement incremental sync to avoid re-fetching all data on every run
- Convert regex parsing to proper ESM imports for type safety
- Configure scripts to run as non-privileged user
- Add health check endpoints for monitoring job status
**Affected Files**:
- `scripts/scheduler.ts`
- `scripts/update-s3-data.ts`
- `scripts/prefetch-data.ts`
- `scripts/entrypoint.sh`
- `scripts/force-refresh-repo-stats.ts`
- All batch script files

---

## Blog

### Issue: Fix Blog Configuration and Performance

**GitHub Issue**: [#112](https://github.com/WilliamAGH/williamcallahan.com/issues/112)

**Problem**: The blog system has multiple architectural issues:

1. Pages export both `dynamic = 'force-static'` and `revalidate = 3600`, which are conflicting Next.js directives
2. The generateMetadata function contains two nearly identical 50+ line blocks for NewsArticle and SoftwareApplication schemas
3. getPostBySlug iterates through all posts on every request instead of using direct lookups
4. MDX processing requires `@ts-nocheck` directive due to type incompatibilities
5. The tags page contains its own complete getAllPosts implementation using synchronous file I/O, diverging from the main implementation
6. Software post detection uses hardcoded arrays instead of frontmatter metadata
**Solution**:

- Remove either `dynamic` (for ISR) or `revalidate` (for static) to resolve conflicts
- Extract duplicate metadata generation into a single reusable function
- Create a build-time slug-to-file mapping for O(1) post lookups
- Update MDX dependencies and fix type definitions to remove @ts-nocheck
- Delete the 100+ line duplicate getAllPosts in tags page and import from lib/blog
- Add `schemaType` field to frontmatter for software posts
**Affected Files**:
- `app/blog/[slug]/page.tsx`
- `app/blog/page.tsx`
- `app/blog/tags/[tagSlug]/page.tsx`
- `lib/blog/mdx.ts`
- `lib/blog.ts`

---

## Blog Article

### Issue: Enhance Blog Article Security and Architecture

**GitHub Issue**: [#113](https://github.com/WilliamAGH/williamcallahan.com/issues/113)

**Problem**: Blog article components have security vulnerabilities and architectural issues:

1. Tweet embeds rely on x.com proxy which could go offline or be compromised
2. The twitter-image route's regex allows `.` character, enabling `../../` path traversal attacks to access arbitrary files
3. Cache-Control headers include 'immutable' preventing content updates even when needed
4. No size limits on fetched content, allowing DoS attacks via large files
5. Excellent fetchWithRetry implementation is duplicated instead of being a shared utility
6. API routes lack versioning, making future breaking changes difficult
**Solution**:

- Implement self-hosted tweet rendering using Twitter's oEmbed API
- Add explicit validation: `if (path.includes('..')) throw new Error('Invalid path')`
- Remove 'immutable' directive to allow cache revalidation
- Check Content-Length header and reject requests > 15MB
- Move fetchWithRetry to lib/utils/fetch.ts for reuse
- Add /api/v1/ prefix to all API routes
**Affected Files**:
- `components/features/blog/tweet-embed.tsx`
- `app/api/twitter-image/[...path]/route.ts`
- `app/api/posts/route.ts`
- `lib/utils/tag-utils.ts`

---

## Bookmarks

### Issue: Refactor Bookmarks Architecture

**GitHub Issue**: [#114](https://github.com/WilliamAGH/williamcallahan.com/issues/114)

**Problem**: The bookmarks system has severe architectural issues:

1. lib/bookmarks.ts imports from lib/data-access/bookmarks.ts which imports back, creating circular dependencies ✅ **FIXED 2025-06-16**
2. lib/bookmarks.server.ts makes HTTP requests to its own /api/bookmarks endpoint instead of calling functions directly
3. S3-based distributed locking uses non-atomic read-then-write pattern, allowing race conditions
4. Bookmark validation logic is duplicated across multiple files instead of centralized
5. API responses are cast to types without runtime validation, causing runtime errors ✅ **FIXED 2025-06-16**
6. The main route handler duplicates refresh logic that exists in /refresh endpoint
7. No pagination for users with hundreds of bookmarks
8. Double lock release warnings occur during bookmark processing ✅ **FIXED 2025-06-16**
9. Distributed locking needs more resilient cleanup mechanism ✅ **FIXED 2025-06-16**
**Solution**:

- Move shared logic to lib/bookmarks-core.ts to break circular dependencies ✅ **IMPLEMENTED 2025-06-16**
- Have server components import directly from data-access layer
- Replace S3 locking with DynamoDB conditional writes for true atomicity
- Create lib/validators/bookmarks.ts for all validation logic
- Use Zod schemas for runtime validation of external data ✅ **IMPLEMENTED 2025-06-16**
- Remove isRefresh parameter from main endpoint
- Add limit/offset parameters for pagination
- Added cleanup mechanism for orphaned locks ✅ **IMPLEMENTED 2025-06-16**
**Affected Files**:
- `lib/bookmarks.ts`
- `lib/data-access/bookmarks.ts`
- `lib/bookmarks.server.ts`
- `lib/validators/bookmarks.ts`
- `app/api/bookmarks/route.ts`
- `app/api/bookmarks/refresh/route.ts`
- `components/features/bookmarks/*`

---

## Caching

### Issue: Implement Robust Cache Management

**GitHub Issue**: [#115](https://github.com/WilliamAGH/williamcallahan.com/issues/115)

**Problem**: The caching system has critical reliability and security issues:

1. ServerCache has no memory limits, allowing unbounded growth until OOM crash
2. `useClones: false` setting allows cached objects to be accidentally mutated by consumers
3. Failed image processing results are cached as successes, serving errors to users
4. /api/cache/clear endpoint is completely public, allowing anyone to DoS the site by clearing caches
5. No visibility into cache performance (hit rates, memory usage, etc.)
6. Cold starts result in poor performance until cache warms naturally
7. Can only clear entire cache, not specific keys or patterns
8. No mechanism to refresh stale logos already cached in S3
**Solution**:

- Add `maxKeys: 1000` parameter to ServerCache constructor
- Change to `useClones: true` to prevent object mutation
- Check response.ok before caching image processing results
- Add JWT authentication to cache clear endpoint
- Implement cache.getStats() method returning hit/miss ratios
- Add startup cache warming for common domains
- Implement cache.clear(pattern) for selective clearing
**Affected Files**:
- `lib/server-cache.ts`
- `app/api/cache/clear/route.ts`
- `app/api/cache/images/route.ts`
- `middleware/cache-debug.ts`
- `lib/cache.ts` (remove dead code)
- `__tests__/lib/server-cache-simple.test.ts` (updated with comprehensive tests documenting known issues)

---

## Code Block

### Issue: Improve Code Block Reliability

**GitHub Issue**: [#123](https://github.com/WilliamAGH/williamcallahan.com/issues/123)

**Problem**: Code block components have reliability and maintainability issues:

1. Uses setTimeout to handle click-outside events when maximized, which can fail if user clicks too quickly
2. Copy button has fixed positioning that can overlap code content in narrow blocks
3. SVG transform fixes are duplicated across multiple components instead of centralized
**Solution**:

- Replace setTimeout with immediate event listener that checks state synchronously
- Calculate copy button position based on code block width to prevent overlap
- Create useSvgTransformFix hook to centralize all SVG fixing logic
**Affected Files**:
- `components/ui/code-block/code-block.client.tsx`
- `components/ui/code-block/copy-button.client.tsx`
- `components/ui/code-block/mdx-code-block-wrapper.client.tsx`

---

## Config

### Issue: Standardize Configuration Management

**GitHub Issue**: [#124](https://github.com/WilliamAGH/williamcallahan.com/issues/124)

**Problem**: Configuration has consistency and security issues:

1. CACHE_DURATION is in milliseconds (3600000) while SERVER_CACHE_DURATION is in seconds (3600), causing confusion
2. LOGO_SOURCES defines identical URLs for DuckDuckGo's 'hd' and 'md' entries
3. Multiple API routes export both `dynamic = 'force-static'` and `revalidate = 3600`
4. /api/sentry-example-api/route.ts debug endpoint works in production, exposing internal errors
**Solution**:

- Convert all durations to seconds for consistency
- Remove duplicate 'md' entry for DuckDuckGo or fix URL
- Remove one directive based on desired caching behavior
- Add `if (process.env.NODE_ENV === 'production') return NextResponse.json({error: 'Not found'}, {status: 404})`
**Affected Files**:
- `lib/constants.ts`
- `app/api/sentry-example-api/route.ts`
- Multiple API routes with conflicting directives

---

## CSS

### Issue: Modernize CSS Architecture

**GitHub Issue**: [#122](https://github.com/WilliamAGH/williamcallahan.com/issues/122)

**Problem**: CSS files have maintainability and performance issues:

1. Glitch animation pseudo-elements have duplicate `animation` properties (lines 192, 199)
2. Inconsistent !important usage - some properties use it unnecessarily while others that need it don't
3. Chart color variables (--chart-1 through --chart-5) are defined but never used
4. All styles are global, risking conflicts and making refactoring dangerous
5. Social styles have `height: 0` for a feature that's either incomplete or dead code
6. Tab system hardcoded for exactly 4 tabs, breaking with different numbers
7. Dark mode styles in code-blocks.css are commented as "not active" but are active
**Solution**:

- Remove duplicate animation declarations
- Document !important policy: only for overriding third-party styles
- Delete unused chart color variables
- Migrate to CSS Modules for component isolation
- Add stylelint with rules for formatting and best practices
- Either implement colored bars feature or remove dead code
- Refactor tabs to support dynamic number using data attributes
**Affected Files**:
- `app/globals.css`
- `app/code-blocks.css`
- `components/ui/simple-tabs.css`
- `styles/social-styles.css`
- `components/ui/code-block/prism-syntax-highlighting/prism.css`

---

## Education

### Issue: Clean Up Education and Experience Pages

**GitHub Issue**: [#125](https://github.com/WilliamAGH/williamcallahan.com/issues/125)

**Problem**: Hardcoded static values in JSON-LD for interaction statistics that become outdated, and inefficient imports.
**Solution**:

- Remove static interactionStatistic from JSON-LD
- Consolidate multiple imports from same file
**Affected Files**:
- `app/education/page.tsx`

---

## Error Handling

### Issue: Implement Comprehensive Error Handling

**GitHub Issue**: [#126](https://github.com/WilliamAGH/williamcallahan.com/issues/126)

**Problem**: Error handling is inconsistent and loses important debugging information:

1. imageCompare.ts returns `false` for both actual mismatches AND errors, making debugging impossible
2. retry.ts returns `null` on failure, losing the actual error that caused the failure
3. Error types have both `lastFetched` and `lastFetchedTimestamp` properties doing the same thing
4. Hundreds of console.log/error calls instead of structured logging that can be filtered/searched
5. Type guard functions mixed into type definition files instead of utilities
**Solution**:

- Change imageCompare to throw errors: `if (error) throw new Error('Image comparison failed: ' + error.message)`
- Modify retry to throw the last error instead of returning null
- Remove duplicate timestamp property, keep only `lastFetchedTimestamp`
- Replace all console.* with logger.info/warn/error from centralized logger
- Move isErrorResponse, isValidationError etc. to lib/utils/error-utils.ts
**Affected Files**:
- `lib/imageCompare.ts`
- `lib/utils/retry.ts`
- `types/error.ts`
- `lib/search.ts`
- Multiple files using console.log

---

## Experience

### Issue: Clean Up Experience Page

**GitHub Issue**: [#125](https://github.com/WilliamAGH/williamcallahan.com/issues/125)

**Problem**: Same as Education - static JSON-LD values and inefficient imports.
**Solution**:

- Remove static interactionStatistic from JSON-LD
- Consolidate imports
**Affected Files**:
- `app/experience/page.tsx`

---

## GitHub Activity

### Issue: Refactor GitHub Activity Architecture

**GitHub Issue**: [#116](https://github.com/WilliamAGH/williamcallahan.com/issues/116)

**Problem**: GitHub integration has severe architectural and security issues:

1. fetchAndProcessGithubActivity is a 600+ line monolithic function mixing GraphQL, REST, and CSV parsing
2. NEXT_PUBLIC_GITHUB_REFRESH_SECRET exposes the refresh token to browsers, allowing anyone to trigger expensive operations
3. Multiple simultaneous refresh requests can occur, wasting API quota
4. Commit counting loop has no upper bound, potentially making hundreds of API calls
5. ServerCache has no TTL, serving stale data indefinitely until restart
6. All-time stats can be mathematically less than trailing year stats
7. fetchWithRetry retries on 401/403 auth errors which will never succeed
8. Request coalescing implemented for logos but not for GitHub activity fetches
**Solution**:

- Split into fetchGraphQL, fetchREST, and parseCSV modules
- Change to GITHUB_REFRESH_SECRET (remove NEXT_PUBLIC prefix)
- Add in-memory flag to prevent concurrent refreshes
- Add MAX_COMMIT_PAGES = 10 limit to prevent runaway loops
- Set cache TTL to 30 minutes for fresh data
- Add validation: allTimeStats = Math.max(allTimeStats, trailingYearStats)
- Skip retries on 4xx errors: `if (response.status >= 400 && response.status < 500) throw error`
**Affected Files**:
- `lib/data-access/github.ts`
- `app/api/github-activity/route.ts`
- `app/api/github-activity/refresh/route.ts`
- `components/features/github/github-activity.client.tsx`

---

## Image Handling

### Issue: Secure and Optimize Image Processing

**GitHub Issue**: [#117](https://github.com/WilliamAGH/williamcallahan.com/issues/117)

**Problem**: Image handling has critical security vulnerabilities and performance issues:

1. isAllowedUrl permits ANY http/https URL, allowing attackers to scan internal networks via SSRF
2. /api/logo/invert allows relative URLs starting with /api, enabling internal API access
3. No size limits mean attackers can exhaust memory by requesting huge images
4. External SVG content is served without sanitization, enabling XSS attacks
5. Multiple concurrent requests trigger duplicate S3 listings due to race conditions
6. logo-fetcher.ts and logo.server.ts have overlapping normalizeDomain functions
7. No caching of image analysis results, reprocessing identical images
8. fetch follows redirects, bypassing domain validation via open redirects
9. Investment cards now actively use dynamic logo fetching (previously disabled)
10. NextResponse.redirect errors when using relative URLs ✅ **FIXED 2025-06-16**
11. Animated image formats (GIF, WebP) not preserved ✅ **FIXED 2025-06-16**
12. Infinite loop when fetching Karakeep fallback images ✅ **FIXED 2025-06-16**
**Solution**:

- Validate URLs against allowlist and block private IPs (10.*, 192.168.*, etc)
- Remove /api relative URL support from logo/invert endpoint
- Check Content-Length header and reject if > 10MB
- Implement DOMPurify or similar for SVG sanitization
- Use promise-based initialization: `if (!this.initPromise) this.initPromise = this.loadFromS3()`
- Consolidate logo modules into single module
- Cache image analysis results by content hash
- Add `redirect: 'error'` to all fetch calls
- Created unified `/api/og-image` route as single source of truth ✅ **IMPLEMENTED 2025-06-16**
- Fixed NextResponse.redirect to use absolute URLs ✅ **IMPLEMENTED 2025-06-16**
- Added contextual fallback images ✅ **IMPLEMENTED 2025-06-16**
**Affected Files**:
- `app/api/cache/images/route.ts`
- `app/api/logo/route.ts`
- `app/api/logo/invert/route.ts`
- `app/api/validate-logo/route.ts`
- `app/api/og-image/route.ts`
- `app/api/assets/[assetId]/route.ts`
- `lib/data-access/logos/*`
- `lib/logo-fetcher.ts`
- `lib/logo.server.ts`
- `lib/imageAnalysis.ts`
- `lib/imageCompare.ts`

---

## Interactive Containers

### Issue: Simplify External Link Component

**GitHub Issue**: [#127](https://github.com/WilliamAGH/williamcallahan.com/issues/127)

**Problem**: Unnecessary rawTitle prop complication.
**Solution**: Remove rawTitle prop and "Visit " prefix logic, let parent components handle title formatting.
**Affected Files**:

- `components/ui/external-link.client.tsx`

---

## Investments

### Issue: Clean Up Investment Components

**GitHub Issue**: [#128](https://github.com/WilliamAGH/williamcallahan.com/issues/128)

**Problem**: Mixed data and content in data file, duplicated AcceleratorBadge logic, dead financial metrics code, and regex-based parsing fallback. Investment cards are now fetching logos dynamically but the infrastructure lacks a mechanism to refresh stale S3-cached logos.
**Solution**:

- Move investmentPhilosophy to separate content file
- Refactor to use AcceleratorBadge component
- Remove dead metrics code or implement fully
- Remove regex-based fallback
- Consolidate imports
**Affected Files**:
- `data/investments.ts`
- `components/features/investments/investment-card.client.tsx`
- `components/ui/financial-metrics.server.tsx`
- `app/investments/page.tsx`
- `lib/data-access/investments.ts`

---

## Log Debug

### Issue: Secure Debug Endpoints and Implement Structured Logging

**GitHub Issue**: [#129](https://github.com/WilliamAGH/williamcallahan.com/issues/129)

**Problem**: Debug endpoints expose sensitive information and use poor practices:

1. /api/debug/* and /api/sentry-example-api routes work in production, exposing internals
2. log-client-error uses entire x-forwarded-for header instead of first IP
3. All endpoints use console.log/error instead of structured logging
4. Posts debug endpoint uses confusing async map pattern
5. No audit trail of who accessed debug endpoints
6. No-cache headers duplicated across multiple endpoints
**Solution**:

- Add to all debug routes: `if (process.env.NODE_ENV === 'production') return new Response('Not Found', { status: 404 })`
- Parse x-forwarded-for: `const ip = forwardedFor?.split(',')[0].trim()`
- Replace console with logger that outputs JSON with timestamp, level, and context
- Use for...of loop instead of map for clarity
- Add audit logging with timestamp, IP, and user agent
- Create NOCACHE_HEADERS constant for reuse
**Affected Files**:
- `app/api/debug/posts/route.ts`
- `app/api/sentry-example-api/route.ts`
- `app/api/health/route.ts`
- `app/api/log-client-error/route.ts`
- `app/sentry-example-page/page.tsx`

---

## Logging

### Issue: Implement Production-Grade Logging System

**GitHub Issue**: [#130](https://github.com/WilliamAGH/williamcallahan.com/issues/130)

**Problem**: Simple console wrapper instead of robust logging, duplicate logging utilities, and unstructured logs throughout codebase.
**Solution**:

- Replace with pino or similar logging library
- Consolidate debug.ts with logger.ts
- Implement structured logging with proper levels
**Affected Files**:
- `lib/utils/logger.ts`
- `lib/utils/debug.ts`
- All files using console.log/error

---

## macOS GUI

### Issue: Fix macOS Window Components

**GitHub Issue**: [#131](https://github.com/WilliamAGH/williamcallahan.com/issues/131)

**Problem**: Memory leaks from event listeners, confusing button states when hidden, and deprecated props.
**Solution**:

- Implement proper event listener cleanup
- Disable buttons when window is hidden
- Migrate from hideTrafficLights to showTrafficLights
**Affected Files**:
- `components/ui/instruction-macos-frame-tabs.client.tsx`
- `components/ui/macos-window.client.tsx`

---

## Navigation

### Issue: Fix Navigation Hydration and Performance

**GitHub Issue**: [#118](https://github.com/WilliamAGH/williamcallahan.com/issues/118)

**Problem**: Navigation has multiple hydration errors and performance issues:

1. navigation-link returns null based on window.innerWidth, causing hydration mismatches
2. Production console.log at lines 90-99 exposes internal navigation state to users
3. Scroll retry timers aren't cleaned up on route change, causing scrolls on wrong pages
4. collapse-dropdown uses module-level Map for state instead of React patterns
5. isMounted pattern in navigation.client prevents server-side rendering
6. Dropdown IDs generated from summary text break when content changes
7. clearHistory() called twice in same condition block
**Solution**:

- Use CSS display:none with media queries instead of conditional rendering
- Wrap console.log in `if (process.env.NODE_ENV === 'development')`
- Store timer IDs and clear in useEffect cleanup
- Replace global Map with React Context for dropdown state
- Remove isMounted check and handle hydration properly
- Accept explicit id prop for dropdowns
- Remove duplicate clearHistory() call
**Affected Files**:
- `components/ui/navigation/navigation-link.client.tsx`
- `components/ui/navigation/navigation.client.tsx`
- `lib/hooks/use-anchor-scroll.client.ts`
- `components/ui/collapse-dropdown.client.tsx`
- `components/ui/navigation/window-controls.tsx`

---

## S3 Object Storage

### Issue: Improve S3 Operations and Architecture

**GitHub Issue**: [#119](https://github.com/WilliamAGH/williamcallahan.com/issues/119)

**Problem**: S3 operations have security, reliability, and performance issues:

1. writeToS3 sets ACL: 'public-read' by default, accidentally exposing private files
2. MAX_S3_READ_RETRIES = 1 but loop uses `i < MAX_S3_READ_RETRIES`, resulting in 0 retries
3. Multiple concurrent requests cause duplicate S3 ListObjectsV2 calls
4. findImageInS3 lists entire directories as fallback, O(n) operation that doesn't scale
5. Separate S3 clients created in s3.ts and s3-utils.ts wasting connections
6. Logo selection uses fragile string matching like 'apple-touch' priority
7. No S3 object versioning despite overwriting logos frequently
**Solution**:

- Remove default ACL, require explicit parameter: `acl: ACLType`
- Fix loop: `for (let i = 0; i <= MAX_S3_READ_RETRIES; i++)`
- Cache initialization promise: `this.initPromise ??= this.loadFromS3()`
- Restructure keys for prefix search: `logos/domain/netflix.com/type/og/image.png`
- Export shared S3 client from s3-utils.ts
- Define explicit priority array: `['og', 'apple-touch', 'favicon']`
- Enable S3 versioning on bucket
**Affected Files**:
- `lib/s3-utils.ts`
- `lib/utils/image-s3-utils.ts`
- `lib/data-access/logos/s3-operations.ts`
- `lib/data-access/logos/s3-store.ts`
- `lib/s3.ts`
- `lib/utils/opengraph-utils.ts`
- `lib/data-access/logos.ts` (invalidateLogoS3Cache is a no-op)

---

## Search

### Issue: Rebuild Search Architecture

**GitHub Issue**: [#120](https://github.com/WilliamAGH/williamcallahan.com/issues/120)

**Problem**: Search implementation has severe architectural issues:

1. lib/search.ts imports from './bookmarks.client' causing server crashes in production
2. Search logic copy-pasted across 6 nearly identical functions (300+ lines duplication)
3. No caching means every search re-processes all content
4. Only exact substring matching - no typo tolerance or ranking
5. SearchResult type defined in both search.ts and terminal.ts
6. No validation of search queries, allowing regex DoS attacks
7. Each search endpoint duplicates the same logic
**Solution**:

- Separate client/server search implementations
- Create generic `searchContent<T>(items: T[], query: string, fields: string[])`
- Implement build-time search index generation
- Integrate Fuse.js: `new Fuse(items, { threshold: 0.3, keys: fields })`
- Add 5-minute cache for search results
- Consolidate SearchResult type in types/search.ts only
- Validate and sanitize queries: `query = query.slice(0, 100).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')`
- Create /api/search/[scope] dynamic route
**Affected Files**:
- `lib/search.ts`
- `app/api/search/*`
- `types/search.ts`
- `types/terminal.ts`

---

## SEO

### Issue: Standardize SEO Implementation

**GitHub Issue**: [#132](https://github.com/WilliamAGH/williamcallahan.com/issues/132)

**Problem**: Non-standard OpenGraph properties, inconsistent URL handling, hardcoded values, and complex metadata generation.
**Solution**:

- Remove non-standard OpenGraph properties
- Enhance URL handling for protocol-relative URLs
- Make metadata configurable
- Simplify date formatting with libraries
- Remove duplicate schema definitions
- Use specific OpenGraph types
**Affected Files**:
- `lib/seo/*`
- `types/seo/*`
- `lib/utils/domain-utils.ts`

---

## Social Links

### Issue: Improve Social Links Type Safety

**GitHub Issue**: [#133](https://github.com/WilliamAGH/williamcallahan.com/issues/133)

**Problem**: Icon property typed as z.any() losing type safety, and potential broken Discord link.
**Solution**:

- Create proper type definitions for icon components
- Verify and fix Discord URL if needed
**Affected Files**:
- `types/social.ts`
- `components/ui/social-icons/social-links.ts`

---

## Terminal

### Issue: Enhance Terminal Performance and Accessibility

**GitHub Issue**: [#121](https://github.com/WilliamAGH/williamcallahan.com/issues/121)

**Problem**: Terminal has performance bottlenecks and accessibility violations:

1. All commands wait for search module to load, even 'help' or 'clear'
2. Tab panel missing required tabIndex="0" for keyboard navigation
3. Selection view recreates keyboard listeners on every selection change
4. No virtualization for search results, rendering 100+ DOM nodes
5. Terminal history grows unbounded in sessionStorage
6. 100ms fixed timeout for scroll-to-hash can fail on slow devices
7. API responses cast to types without validation
**Solution**:

- Lazy load search only when search command is used
- Add tabIndex="0" to active tab panel with role="tabpanel"
- Store listeners in refs: `const keyHandlerRef = useRef(handleKeyDown)`
- Implement react-window for virtualizing result lists
- Limit history to 1000 entries with FIFO eviction
- Use requestAnimationFrame loop instead of setTimeout
- Add type guards: `if (!isSearchResult(data)) throw new Error()`
**Affected Files**:
- `components/ui/terminal/*`
- `lib/utils/commands.client.ts`
- `lib/context/terminal-window-state-context.client.tsx`

---

## Theming

### Issue: Optimize Theme Provider

**GitHub Issue**: [#134](https://github.com/WilliamAGH/williamcallahan.com/issues/134)

**Problem**: Unnecessary useEffect dependencies causing excessive localStorage access.
**Solution**: Remove resolvedTheme dependency from useEffect to prevent unnecessary re-runs.
**Affected Files**:

- `components/ui/theme/theme-provider.client.tsx`

---

## Consolidated Bug Review for Recent Functionalities

### Issue: Review Potential Bugs in Home, Hooks, and State Management

**GitHub Issue**: [#135](https://github.com/WilliamAGH/williamcallahan.com/issues/135)

**Problem**: A comprehensive bug check was conducted on functionalities including 'Home', 'Hooks', and 'State, Theme & Window Providers'. No confirmed bugs were identified, but several potential issues and improvements were noted. These have been moved to 'docs/projects/improvement_potential.md' for further evaluation and prioritization.
**Potential Impact**: These potential issues could affect performance, user experience, and security if not addressed. They require further investigation to confirm as bugs or to implement as improvements.
**Affected Functionalities**:

- **Home**: Potential issues with ISR revalidation handling.
- **Hooks**: Potential performance and documentation issues with anchor scrolling, window state hydration, and SVG transform fixes.
- **State, Theme & Window Providers**: Potential issues with theme preference expiry, sessionStorage limits, resize event handling, and console logging security.
**Affected Files**:
- Multiple files across the reviewed functionalities. See 'docs/projects/improvement_potential.md' for detailed listings.
**Note**: This section serves as a placeholder for confirmed bugs. As issues are verified, they will be detailed here with specific solutions.
