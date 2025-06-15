# Bugs & Type / Linting Issues Tracker

This document lists actionable, up-to-date bugs and issues found during architecture mapping and code review. Each entry includes a checkbox, file path, and a short description of the bug and how to fix it.

---

## Core Utils - NOT AN ACCEPTABLE FUNCTIONALITY FEATURE NAME

## macOS-GUI

- [ ] `components/ui/instruction-macos-frame-tabs.client.tsx` - When the window is hidden (closed), the "Content hidden" bar still displays active minimize and maximize buttons. Clicking them changes the component's state but provides no visual feedback, which is confusing. The minimize and maximize buttons should be disabled or hidden on the "Content hidden" bar.
- [ ] `components/ui/instruction-macos-frame-tabs.client.tsx` - The component has a memory leak. When the window is maximized, it adds a 'mousedown' event listener to the `document` to detect outside clicks. This listener is only removed when the window is un-maximized, but not when the component unmounts. If the component is removed from the DOM while maximized, the listener will persist, leading to a memory leak. The cleanup function in the `useEffect` hook needs to be updated to remove the listener on unmount regardless of the maximized state.

## Blog Article

- [ ] `components/features/blog/tweet-embed.tsx` - Uses a third-party proxy (`x.com`) to embed tweets, which creates an external dependency. This should be replaced with a more robust, self-hosted solution for long-term stability and to avoid potential issues with the third-party service.

## SEO

- [ ] `lib/seo/utils.ts` - The `ensureAbsoluteUrl` function's behavior with an empty string input is dictated by a comment ("Test expects...") rather than clear, predictable logic. It returns the site's base URL, which is not an intuitive outcome for an empty path and could lead to unexpected behavior. This should be clarified and potentially changed to throw an error or return an empty string.
- [ ] `types/seo/opengraph.ts` - The `ProfileOpenGraph` and `WebsiteOpenGraph` types include a nested object (`profile` and `website`, respectively) containing `publishedTime` and `modifiedTime`. These are not standard OpenGraph properties for the `profile` or `website` types and will likely be ignored by crawlers. They should be removed to ensure the generated metadata is clean and compliant.
- [ ] `lib/utils/domain-utils.ts` - The `ensureAbsoluteUrl` function correctly handles absolute URLs but could be more robust by also checking for protocol-relative URLs (e.g., `//example.com`). This would make it more versatile in different environments.

## Config

- [ ] `app/api/sentry-example-api/route.ts` - **CRITICAL SECURITY**: Debug endpoint accessible in production. Add environment check to return 404 in production.
- [ ] `lib/constants.ts` - The cache duration constants are defined with inconsistent units. `CACHE_DURATION` is in milliseconds, while `SERVER_CACHE_DURATION` and others are in seconds. This is confusing and error-prone. All duration constants should be standardized to a single unit (e.g., seconds) for clarity and consistency.
- [ ] `lib/constants.ts` - The `LOGO_SOURCES` for DuckDuckGo define `hd` and `md` URLs that are identical. This is redundant and likely a copy-paste error. The duplicate entry should be removed or corrected.
- [ ] Multiple API routes - Conflicting Next.js directives: `dynamic = 'force-static'` with `revalidate = 3600`. Remove one to avoid ambiguous behavior.

## Error-Handling

- [ ] `lib/search.ts` - **CRITICAL**: Server/client boundary violation. Import from './bookmarks.client' crashes in production. Separate implementations needed.
- [ ] `lib/imageCompare.ts` - Ambiguous error handling: returns false for both errors and mismatches. Should throw errors to distinguish failures from mismatches.
- [ ] `lib/utils/retry.ts` - Returns null on failure, losing error context. Should throw the last error encountered.
- [ ] `types/error.ts` - Duplicate timestamp properties (`lastFetched` and `lastFetchedTimestamp`). Standardize to single property name.
- [ ] `types/error.ts` - Type guards and utility functions should be moved to `lib/utils/error-utils.ts` for separation of concerns.
- [ ] Multiple files - Widespread use of console.log/error instead of centralized logger. Replace all with structured logging.

## Uncategorized

- [ ] `docs/projects/wip/files-reviewed.md` — The `edit_file` tool is inconsistently failing to apply changes to this file, particularly when updating checklists. It often returns a "no changes applied" message or applies partial/incorrect diffs. This may be due to the file's size or complex structure. Manual updates are required until the tool's reliability improves. (Second instance logged).
- [ ] `lib/utils.ts` - The `formatDate` function contains confusing and potentially error-prone logic for handling date-only strings (e.g., `YYYY-MM-DD`). The comments indicate that these are interpreted as UTC midnight, which can result in off-by-one-day errors when converting to the `America/Los_Angeles` time zone. This behavior is based on test expectations rather than clear, predictable logic and should be refactored to be more robust.
- [ ] `lib/utils.ts` - The `formatMultiple` function's logic to append `.0` to integers (e.g., `2` becomes `2.0x`) is an arbitrary styling decision that makes the function's output inconsistent. This rule should be removed to ensure that integers are formatted consistently with other numbers.
- [ ] `components/ui/card.tsx` - The `Card` component and its sub-components (`CardHeader`, `CardTitle`, etc.) are defined in a single file. While convenient, this makes the file larger and less modular. For better organization and reusability, these components should be split into their own individual files within a `components/ui/card/` directory.

## Interactive Containers

- [ ] `components/ui/external-link.client.tsx` - The `rawTitle` prop is an unnecessary complication. The component's logic for adding a "Visit " prefix to the `title` attribute should be removed. The responsibility for formatting the title text should belong to the parent component that calls `ExternalLink`, which can pass the desired string directly. This simplifies the component's API and removes redundant logic.

## Investments

- [ ] `data/investments.ts` - The data file contains a mix of structured investment data and a large, multi-line string of prose (`investmentPhilosophy`). This makes the data file harder to parse and maintain. The `investmentPhilosophy` text should be moved to a separate, more appropriate location, such as a dedicated content file or a server component, to improve the separation of data and presentation.

- [ ] `lib/utils/opengraph-utils.ts` - The `getOgImageS3Key` function has overly complex and conditional logic for generating S3 keys. It mixes generic hashing with domain-specific key generation, making it unpredictable. This function should be refactored to use a single, deterministic method for key generation (e.g., always based on a content hash), and any domain-specific logic should be moved to the calling modules.
- [ ] `components/ui/logo-image.client.tsx` - The component uses the Next.js `<Image>` component with the `fill` prop but fails to provide the required `sizes` attribute. This is a performance issue, as it will cause the browser to default to `100vw`, likely resulting in the download of an unnecessarily large image. The `sizes` prop should be added and configured appropriately to ensure optimal image loading.

## Image Handling

- [ ] `app/api/cache/images/route.ts:73` - **CRITICAL SECURITY**: Open proxy SSRF vulnerability. The `isAllowedUrl` function permits any http/https URL, allowing attackers to scan internal networks or use server as proxy. Implement DNS resolution with private IP blocking.
- [ ] `app/api/logo/invert/route.ts:29` - **CRITICAL SECURITY**: SSRF vulnerability. Allows relative URLs starting with `/api`, enabling internal API access. Also lacks validation for private IPs. Remove `/api` handling and add IP validation.
- [ ] `app/api/twitter-image/[...path]/route.ts:80` - **HIGH SECURITY**: Path traversal vulnerability. Regex allows `.` character enabling `../../` attacks. Add explicit `..` blocking.
- [ ] `app/api/assets/[assetId]/route.ts:51` - **HIGH SECURITY**: Path traversal on backend service. Unsanitized assetId allows `../` to access other endpoints. Sanitize and normalize paths.
- [ ] `app/api/cache/images/route.ts:111` - **HIGH SECURITY**: DoS vulnerability. No size limits on fetched images can exhaust memory. Check Content-Length header and enforce 10MB limit.
- [ ] `app/api/logo/invert/route.ts` - **HIGH SECURITY**: DoS vulnerability. No size limits on image processing. Add Content-Length validation.
- [ ] `app/api/og-image/route.ts:71` - **HIGH SECURITY**: SSRF via open redirects. fetch follows redirects which can bypass host validation. Set `redirect: 'error'` in fetch options.
- [ ] `app/api/logo/route.ts:60` - **MEDIUM SECURITY**: Unsafe domain parsing fallback. Failed URL parsing falls back to regex that accepts malicious input like `javascript:alert(1)`. Remove fallback or add strict validation.
- [ ] `lib/data-access/logos/external-fetch.ts` - **CRITICAL SECURITY**: Server-Side Request Forgery (SSRF) vulnerability. User-controlled domain parameter used to construct URLs without validation. Implement strict domain validation regex and IP address blocking.
- [ ] `lib/data-access/logos/s3-operations.ts` - **CRITICAL SECURITY**: Path traversal vulnerability in S3 key construction. Unsanitized domain input could lead to arbitrary file read/write. Sanitize ID to remove non-alphanumeric characters.
- [ ] `lib/imageCompare.ts` - Ambiguous error handling: returns false for both errors and mismatches. Should throw errors to distinguish failures from mismatches.
- [ ] `lib/hooks/use-fix-svg-transforms.ts` - Performance: MutationObserver observes entire subtrees without debouncing. Add debouncing for frequent DOM updates.
- [ ] `lib/data-access/logos/s3-store.ts` - Race condition in cache initialization. Multiple concurrent requests trigger duplicate S3 listings. Use promise-based initialization.
- [ ] Multiple files - **CRITICAL SECURITY**: No SVG sanitization for external content. Implement server-side SVG sanitization to prevent XSS.

## Bookmarks

- [ ] `lib/bookmarks.ts` and `lib/data-access/bookmarks.ts` - **CRITICAL**: Circular dependency between business logic and data access layers. Refactor to unidirectional dependency flow.
- [ ] `lib/bookmarks.server.ts` - Inefficient server-side fetching: makes HTTP request to own server. Import directly from data access layer.
- [ ] `lib/data-access/bookmarks.ts` - Race condition in distributed lock: non-atomic read-then-write pattern. Consider DynamoDB or Redis for atomic operations.
- [ ] `lib/validators/bookmarks.ts` - Validation logic duplicated in data access layer. Consolidate to single source of truth.
- [ ] Multiple bookmark files - Type safety: unsafe type assertions on API responses without runtime validation. Use Zod for runtime validation.

## S3-Object-Storage

- [ ] `lib/utils/image-s3-utils.ts` - The functions in this file are highly specific to generating S3 keys for OpenGraph images and are tightly coupled to the `opengraph-utils.ts` module. This file should not exist as a separate `s3-utils` module. Its logic should be merged directly into `opengraph-utils.ts` to reduce fragmentation and improve code cohesion, as its functionality is not generic enough to warrant a separate utility file. OR ACTUALLY REFACTOR TO MATCH INTENDED/DESIRED/NECESSARY FUNCTIONALITY. NOTE: ALL FILES MUST HAVE < 500 LINES OF CODE.
- [ ] `lib/s3-utils.ts` - **CRITICAL SECURITY**: `writeToS3` sets all objects as publicly readable by default. This is dangerous for a generic utility. Make ACL an explicit required parameter.
- [ ] `lib/s3-utils.ts` - Broken retry logic: `MAX_S3_READ_RETRIES = 1` with loop condition `i < MAX_S3_READ_RETRIES` results in zero retries. Fix loop condition or rename constant.
- [ ] `lib/utils/image-s3-utils.ts` - Performance: `findImageInS3` lists entire directories as fallback, doesn't scale. Redesign key structure for efficient prefix searches.
- [ ] `lib/data-access/logos/s3-store.ts` - Race condition: Multiple concurrent requests can trigger duplicate S3 listings. Use promise-based initialization.
- [ ] `lib/s3.ts` - Redundant S3 client: Creates separate client instead of reusing the one from s3-utils.ts. Consolidate to single client.
- [ ] `lib/data-access/logos/s3-operations.ts` - Brittle logo selection: Arbitrary "best" logo selection with fragile string matching. Implement explicit preference ordering.
- [ ] `lib/utils/opengraph-utils.ts` - The `getOgImageS3Key` function has overly complex and conditional logic for generating S3 keys. It mixes generic hashing with domain-specific key generation, making it unpredictable. This function should be refactored to use a single, deterministic method for key generation (e.g., always based on a content hash), and any domain-specific logic should be moved to the calling modules.

## Social-Links

- [x] `components/ui/social-icons/social-links.ts` - The Discord link URL (`https://discord.com/users/WilliamDscord`) appears to contain a typo ("Dscord" instead of "Discord"). This is likely a broken link and should be corrected to ensure it points to the correct user profile. NOT A TYPO.
- [ ] `types/social.ts` - Icon property typed as `z.any()` loses type safety for icon components. Create proper type definitions or discriminated union.

## Navigation

- [ ] `components/ui/navigation/navigation-link.client.tsx` - **CRITICAL**: Production console.log exposed at lines 90-99. Reveals internal state to users. Remove or wrap in development check.
- [ ] `components/ui/navigation/navigation-link.client.tsx` - Hydration mismatch: Component returns null based on client-side window size (lines 102-104). Use CSS for responsive behavior instead.
- [ ] `components/ui/navigation/navigation.client.tsx` - Hydration mismatch: isMounted pattern prevents SSR (lines 28-30). Causes layout shift and impacts Core Web Vitals.
- [ ] `lib/hooks/use-anchor-scroll.client.ts` - Race condition: Retry timers not cleaned up on navigation (lines 99-127). Can cause unexpected scrolling on new pages.
- [ ] `components/ui/collapse-dropdown.client.tsx` - Global registry anti-pattern: Uses module-level global state instead of React Context. Creates hidden dependencies.
- [ ] `components/ui/navigation/navigation-link.client.tsx` - Duplicate code: clearHistory() called twice under same condition (lines 67-73).
- [ ] `components/ui/collapse-dropdown.client.tsx` - Unstable IDs: Generated from summary text (lines 189-194). Links break if summary changes.

## Theming

- [ ] `components/ui/theme/theme-provider.client.tsx` - The `useEffect` hook in `ThemeExpiryHandler` has an unnecessary dependency on `resolvedTheme`. This causes the hook to re-run every time the system theme changes, leading to needless `localStorage` access. The `resolvedTheme` dependency should be removed, and the hook should be configured to run only once on component mount.

## Search

- [ ] `lib/search.ts` - **CRITICAL**: Server/client boundary violation. searchBookmarks imports from './bookmarks.client' which crashes in production when called from API routes. Separate client and server logic.
- [ ] `types/search.ts` and `types/terminal.ts` - Type duplication: SearchResult defined in both files. Consolidate into single definition.
- [ ] `lib/search.ts` - Severe code duplication: Search algorithm copy-pasted across 6 functions. Extract common search logic.
- [ ] `app/api/search/all/route.ts` - No input validation or sanitization. Add validation for query parameters.
- [ ] `app/api/search/blog/route.ts` - No error handling for MDX read failures. Add try-catch blocks.
- [ ] All search files - No caching mechanism causing performance issues. Implement caching strategy.
- [ ] `lib/search.ts` - Poor search quality: Only exact string matching, no typo tolerance. Consider Fuse.js integration.

## Terminal

- [ ] `components/ui/shell-parent-tabs.client.tsx` - The active tab panel `div`, which has `role="tabpanel"`, is missing the required `tabIndex="0"` attribute. This is an accessibility violation, as it prevents keyboard users from focusing on the content within the active tab. The component should be updated to include `tabIndex="0"` on the active tab panel.
- [ ] `components/ui/terminal/terminal-implementation.client.tsx` - The `useEffect` hook for scrolling to the bottom of the terminal has a suppressed lint warning and an incorrect dependency array (`[terminalHistory.length]`). This can cause the scroll to fail if the history changes without its length changing. The dependency should be changed to `[terminalHistory]` to ensure the effect runs correctly on every history update.
- [ ] `components/ui/terminal/command-input.client.tsx` - Performance: All commands wait for search module to load, even simple ones like 'help'. Implement lazy loading for search module.
- [ ] `components/ui/terminal/selection-view.client.tsx` - Performance: Recreates keyboard listeners on every selection change. Use refs to maintain stable event handlers.
- [ ] `components/ui/terminal/selection-view.client.tsx` - Accessibility: Selection list lacks proper ARIA patterns. Add `role="listbox"` to container and `role="option"` to items.
- [ ] `components/ui/terminal/selection-view.client.tsx` - Event conflicts: Global keyboard listeners could interfere with other components when terminal is maximized. Scope listeners to terminal container.
- [ ] `components/ui/terminal/terminal-implementation.client.tsx` - Implementation: Fixed 100ms timeout for scroll-to-hash could fail on slow devices. Use requestAnimationFrame loop instead.
- [ ] `lib/utils/commands.client.ts` - Type safety: API responses use blind type assertions without runtime validation. Implement type guards for external data.

### `logging`

- **File**: `app/api/log-client-error/route.ts`
  - **Issue**: Incorrectly handles the `x-forwarded-for` header. It reads the entire header value, which can be a comma-separated list of IP addresses, instead of just the first one. This leads to storing invalid IP data.
  - **Impact**: Corrupted and unreliable IP address logging for client-side errors, hindering debugging and security analysis.
  - **Suggested Fix**: Parse the `x-forwarded-for` header and extract only the first IP address. Also, add a fallback to `request.ip` for better reliability.

### `bookmarks`

- **File**: `app/api/bookmarks/route.ts`
  - **Issue**: Contains a redundant `isRefresh` check that duplicates the functionality of the dedicated `app/api/bookmarks/refresh/route.ts` endpoint. This creates two ways to trigger a refresh, violating the DRY principle and adding unnecessary complexity.
  - **Impact**: Code duplication and confusion for API consumers, who have two different endpoints for the same action.
  - **Suggested Fix**: Remove the `isRefresh` logic block from this route handler.
- **File**: `app/api/bookmarks/route.ts`
  - **Issue**: The code contains multiple `console.log` statements used for debugging.
  - **Impact**: These logs add noise to production logs and are not structured, making them difficult to parse and monitor effectively.
  - **Suggested Fix**: Remove the `console.log` statements or replace them with the centralized `logger.ts` for structured, consistent logging.
- **File**: `app/api/bookmarks/refresh/route.ts`
  - **Issue**: Exports a `GET` handler that checks if a refresh is needed. This handler is not used by the client-side application and represents dead code.
  - **Impact**: Increases bundle size with unused code and adds an unnecessary API endpoint.
  - **Suggested Fix**: Remove the `GET` handler from this route.
- **File**: `app/api/bookmarks/refresh/route.ts`
  - **Issue**: Incorrectly handles the `x-forwarded-for` header for rate limiting. It takes the entire header string instead of the first IP address in the list.
  - **Impact**: The rate limiter may not function correctly, as it could be using an invalid or incorrect IP address string.
  - **Suggested Fix**: Parse the header and extract only the first IP address.
- **File**: `app/api/bookmarks/refresh/route.ts`
  - **Issue**: The route is filled with `console.log` and `console.warn` statements for debugging purposes.
  - **Impact**: Clutters production logs with unstructured data, making it difficult to monitor the application's health.
  - **Suggested Fix**: Replace all `console` calls with the structured `logger.ts` utility.

### `caching`

- **File**: `app/api/cache/clear/route.ts`
  - **Issue**: **Critical Security Vulnerability.** The endpoint is public and lacks any authentication or authorization checks. Anyone on the internet can send a `POST` request to clear the entire server-side cache.
  - **Impact**: This can be exploited to launch a Denial of Service (DoS) attack by repeatedly forcing the server to refetch all data, potentially overwhelming upstream APIs and databases.
  - **Suggested Fix**: Implement strict authentication and authorization. This endpoint should only be accessible to administrators, likely via a secret token or an authenticated session.
- **File**: `app/api/cache/clear/route.ts`
  - **Issue**: Uses `console.error` for logging errors.
  - **Impact**: Inconsistent with the project's standardized logging approach. Logs are unstructured and harder to manage.
  - **Suggested Fix**: Replace `console.error` with the `logger.ts` utility.
- **File**: `app/api/cache/images/route.ts`
  - **Issue**: **Critical Security Vulnerability.** The `isAllowedUrl` function permits caching images from any URL on the internet. This turns the endpoint into an open image proxy.
  - **Impact**: A malicious actor could abuse this to serve arbitrary content (including illegal or harmful images) from the application's domain, or use it to probe internal network resources by making the server fetch arbitrary URLs.
  - **Suggested Fix**: Replace the permissive `isAllowedUrl` function with a strict allow-list that only validates against a known set of trusted image source domains.
- **File**: `app/api/cache/images/route.ts`
  - **Issue**: Uses `console.error` for logging image processing and caching errors.
  - **Impact**: Unstructured logs that are difficult to parse and monitor in a production environment.
  - **Suggested Fix**: Replace `console.error` with the centralized `logger.ts` utility.
- [ ] `lib/server-cache.ts` - Memory management: No memory limits set, cache can grow unbounded causing OOM errors. Add `maxKeys` limit in constructor.
- [ ] `lib/server-cache.ts` - Object mutation risk: `useClones: false` allows cached objects to be accidentally mutated. Set `useClones: true` for data integrity.
- [ ] `lib/server-cache.ts` - Cache poisoning: Failed image processing results are cached as successes. Check error status before caching.
- [ ] `lib/data-access/bookmarks.ts` - Race condition: Uses `globalThis.isBookmarkRefreshLocked` which is an anti-pattern. Replace with proper locking mechanism.
- [ ] `app/api/cache/images/route.ts` - Cache poisoning: Failed image processing is cached with success headers. Return no-cache headers on errors.
- [ ] `lib/cache.ts` - Dead code: This entire file and its tests are unused. Delete to reduce confusion.
- **File**: `app/api/logo/invert/route.ts`
  - **Issue**: Both the `GET` and `HEAD` handlers use `console.error` in their `catch` blocks for logging.
  - **Impact**: Inconsistent, unstructured logging.
  - **Suggested Fix**: Replace `console.error` with the `logger.ts` utility.

### `debugging`

- **File**: `app/api/debug/posts/route.ts`
  - **Issue**: The code uses `mdxFiles.map(async ...)` to iterate over files and perform async operations. While it correctly uses `Promise.all` to await the results, this pattern is confusing. `map` is not designed for asynchronous iteration and can be misleading.
  - **Impact**: The code is harder to read and maintain than necessary. A developer might mistakenly assume the operations are sequential.
  - **Suggested Fix**: Refactor the loops to use a standard `for...of` loop, which is more explicit and idiomatic for handling asynchronous operations in sequence.
- **File**: `app/api/debug/posts/route.ts`
  - **Issue**: The route uses `console.error` and `console.warn` for logging.
  - **Impact**: Inconsistent, unstructured logging that is difficult to manage in production.
  - **Suggested Fix**: Replace all `console` calls with the `logger.ts` utility.

### `github-activity`

- [ ] `app/api/github-activity/refresh/route.ts` - **CRITICAL SECURITY**: Refresh secret exposed via NEXT_PUBLIC_GITHUB_REFRESH_SECRET. Anyone can trigger refreshes. Remove public prefix, use server-only secret.
- [ ] `lib/data-access/github.ts` - Cache never expires: ServerCacheInstance has no TTL. Data stays stale until restart. Add 30-minute TTL.
- [ ] `app/api/github-activity/refresh/route.ts` - No rate limiting on refresh endpoint. Vulnerable to DoS. Implement rate limiting middleware.
- [ ] `lib/data-access/github.ts` - Unbounded API calls: Commit counting loop has no limit. Can trigger hundreds of calls. Add MAX_COMMIT_PAGES limit.
- [ ] `lib/data-access/github.ts` - Data consistency: All-time stats can be lower than trailing year. Ensure all-time >= trailing year for all metrics.
- [ ] `lib/data-access/github.ts` - Inefficient retry: fetchWithRetry retries on 4xx errors including auth failures. Skip retries on permanent failures.
- [ ] `components/features/github/github-activity.client.tsx` - Runtime env var reference to NEXT_PUBLIC var can cause undefined errors. Use fallback or server-side config.

- **File**: `app/api/github-activity/route.ts`
  - **Issue**: Contains `console.log` and `console.warn` statements for request and deprecation logging.
  - **Impact**: Unstructured logs that add noise and are difficult to parse in a production environment.
  - **Suggested Fix**: Replace all `console` calls with the centralized `logger.ts` utility.
- **File**: `app/api/github-activity/refresh/route.ts`
  - **Issue**: The route uses `console.log`, `console.warn`, and `console.error` for logging authorization attempts and process status.
  - **Impact**: Inconsistent, unstructured logging that makes monitoring and debugging difficult.
  - **Suggested Fix**: Replace all `console` calls with the `logger.ts` utility.

### `ops`

- **File**: `app/api/health/route.ts`
  - **Issue**: The `catch` block uses `console.error` to log failures in the health check.
  - **Impact**: Inconsistent, unstructured logging.
  - **Suggested Fix**: Replace `console.error` with the `logger.ts` utility.

### `blog`

- **File**: `app/blog/page.tsx`
  - **Issue**: The page's `try...catch` block for fetching posts uses `console.error`.
  - **Impact**: Inconsistent, unstructured logging.
  - **Suggested Fix**: Replace `console.error` with the `logger.ts` utility.
- **File**: `app/blog/page.tsx`
  - **Issue**: The page is configured with both `export const dynamic = 'force-static'` and `export const revalidate = 3600`. This is a contradiction in Next.js. `force-static` enforces pure static generation at build time, while `revalidate` is for Incremental Static Regeneration (ISR).
  - **Impact**: The build behavior is ambiguous and may not work as intended. Next.js will likely prioritize one over the other, but the code is misleading.
  - **Suggested Fix**: Decide on the desired behavior. If pure static is intended, remove `revalidate`. If ISR is desired, remove `dynamic = 'force-static'`.
- **File**: `app/blog/[slug]/page.tsx`
  - **Issue**: Similar to the blog index, this page has conflicting `export const dynamic = 'force-static'` and `export const revalidate = 3600` settings.
  - **Impact**: Ambiguous and potentially incorrect build behavior.
  - **Suggested Fix**: Choose either pure static generation (remove `revalidate`) or ISR (remove `dynamic = 'force-static'`).
- **File**: `app/blog/[slug]/page.tsx`
  - **Issue**: The page uses `console.warn`, `console.log`, and `console.error` for logging various states like missing posts and rendering errors.
  - **Impact**: Inconsistent, unstructured logging.
  - **Suggested Fix**: Replace all `console` calls with the `logger.ts` utility.
- **File**: `app/blog/[slug]/page.tsx`
  - **Issue**: The `generateMetadata` function contains two large, almost identical blocks of code for handling `NewsArticle` and `SoftwareApplication` schema types. This is a major violation of the DRY (Don't Repeat Yourself) principle.
  - **Impact**: The code is difficult to maintain. A change to the metadata structure would need to be applied in two separate places, increasing the risk of bugs.
  - **Suggested Fix**: Refactor this into a single, more generic function. It should build a base metadata object and then conditionally add the `SoftwareApplication`-specific fields if the post is a software post.
- **File**: `app/blog/tags/[tagSlug]/page.tsx`
  - **Issue**: **Critical.** This file contains its own, complete, and divergent implementation of a `getAllPosts()` function. The main, canonical version exists in `lib/blog.ts`. This local version uses synchronous file I/O, hardcodes author data, and lacks the proper caching and MDX processing of the central function.
  - **Impact**: Massive code duplication and a high risk of data inconsistency. Any change to post fetching logic in the main library will not be reflected here, leading to bugs, stale data, and incorrect rendering on the tag pages.
  - **Suggested Fix**: Delete the entire local `getAllPosts` function and its related helper types/constants. Import and use the canonical `getAllPosts` from `@/lib/blog` instead.
- **File**: `app/blog/tags/[tagSlug]/page.tsx`
  - **Issue**: The local, redundant `getAllPosts` function uses `console.warn` and `console.error` for logging.
  - **Impact**: Inconsistent, unstructured logging.
  - **Suggested Fix**: This will be resolved by deleting the local function, but if it were to remain, it should use the centralized `logger.ts`.
- **File**: `app/bookmarks/loading.tsx`
  - **Issue**: The skeleton loader creates keys for its components using `Date.now()`. This creates unstable keys that change on every render.
  - **Impact**: This is a React anti-pattern that can lead to performance issues and unpredictable behavior, as React may be forced to unmount and remount the components instead of updating them.
  - **Suggested Fix**: Change the key to be stable. Since this is a static list of skeleton loaders, using the array `index` is sufficient and correct: `key={`bookmark-skeleton-${index}`}`.
- **File**: `app/bookmarks/error.tsx`
  - **Issue**: The component uses `console.error` and `console.warn` for logging.
  - **Impact**: Inconsistent, unstructured logging.
  - **Suggested Fix**: Replace all `console` calls with the `logger.ts` utility.

### `education`

- **File**: `app/education/page.tsx`
  - **Issue**: The JSON-LD structured data for the `ProfilePage` contains hardcoded, static values for `interactionStatistic` (follower count) and `agentInteractionStatistic` (post count).
  - **Impact**: This data is not dynamic and will quickly become outdated and inaccurate, providing misleading information to search engines. Structured data should accurately reflect the content on the page.
  - **Suggested Fix**: Remove the `interactionStatistic` and `agentInteractionStatistic` properties from the JSON-LD object. This data should only be included if it is fetched dynamically and displayed on the page.

### `experience`

- **File**: `app/experience/page.tsx`
  - **Issue**: Similar to the education page, the JSON-LD for the `ProfilePage` schema contains hardcoded and static `interactionStatistic` and `agentInteractionStatistic` values.
  - **Impact**: Inaccurate and misleading structured data that will become stale.
  - **Suggested Fix**: Remove the `interactionStatistic` and `agentInteractionStatistic` properties from the JSON-LD object.

## Batch Fetch Update

- [ ] `scripts/scheduler.ts` - **CRITICAL**: Uses spawnSync which blocks entire scheduler if one job hangs. Replace with async spawn.
- [ ] `types/node-cron.d.ts` - Custom type declaration instead of official package. Install @types/node-cron.
- [ ] `scripts/prefetch-data.ts` - Brittle regex parsing of TypeScript files. Refactor data files to export pure data.
- [ ] All batch scripts - No protection against concurrent job execution. Implement job locking.
- [ ] All batch scripts - No retry mechanism for failed operations. Implement dead letter queue.
- [ ] `scripts/update-s3-data.ts` - No circuit breaker for external APIs. Add to prevent cascading failures.
- [ ] `scripts/force-refresh-repo-stats.ts` - Hardcoded credentials instead of consistent env var usage.

### `build`

- **File**: `scripts/check-file-naming.ts`
  - **Issue**: The script uses `promisify` from the `util` module to create an async version of `fs.readFile`. This is an outdated pattern.
  - **Impact**: While functional, it's not the modern, recommended approach.
  - **Suggested Fix**: Replace the use of `promisify` with the native `fs.promises.readFile` API, which is built into Node.js and is the standard for promise-based file system operations.
