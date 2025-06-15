# Improvement Potential Tracker

This document tracks actionable improvement opportunities identified during architecture mapping and code review. Each entry includes a checkbox, file path, and a short description of the improvement and how to address it.

---

## Analytics

- [ ] `components/analytics/analytics.client.tsx` — The use of a 500ms `setTimeout` to delay analytics tracking is brittle. Replace with a more robust mechanism using the `<Script>` component's `onLoad` callback to ensure scripts are fully loaded before tracking events.

## Batch-Fetch-Update

- [ ] `scripts/scheduler.ts` - Implement proper job queue with state management instead of simple cron.
- [ ] `scripts/update-s3-data.ts` - Add incremental sync capability to avoid fetching all data every time.
- [ ] All batch scripts - Implement circuit breaker pattern for external API calls.
- [ ] All batch scripts - Add structured logging and metrics collection for monitoring.
- [ ] `scripts/scheduler.ts` - Add health check endpoint to monitor scheduler status.
- [ ] `scripts/update-s3-data.ts` - Implement parallel processing with controlled concurrency using p-limit.
- [ ] All batch scripts - Add input validation and sanitization for domains and URLs.
- [ ] `scripts/prefetch-data.ts` - Convert to use ESM imports instead of regex parsing.
- [ ] All batch scripts - Implement exponential backoff for retry logic.

## Blog

- [ ] `lib/blog/mdx.ts` — MDX processing relies on `@ts-nocheck` directive. Revisit when `next-mdx-remote` and related plugins are updated.
- [ ] `lib/blog.ts` — `getPostBySlug` iterates over all posts. For large blogs, create build-time slug-to-file map for direct lookups.
- [ ] `app/blog/page.tsx` — Pre-rendering of `BlogListServer` unnecessarily wrapped in `await Promise.resolve()`. Remove wrapper for cleaner code.
- [ ] `app/blog/[slug]/page.tsx` — Special handling for "software" posts is hardcoded. Move to frontmatter (e.g., `schemaType: 'SoftwareApplication'`).
- [ ] `app/blog/[slug]/page.tsx` — `articleBody` for JSON-LD uses `JSON.stringify(post.content)`. Use `post.rawContent` for cleaner SEO text.
- [ ] `app/blog/[slug]/page.tsx` — **CRITICAL**: Conflicting export directives. Choose either ISR (remove `dynamic`) or static (remove `revalidate`).
- [ ] `app/blog/[slug]/page.tsx` — **HIGH PRIORITY**: Duplicate code in `generateMetadata`. Extract common logic into shared function.
- [ ] `app/blog/[slug]/page.tsx` — `SOFTWARE_POSTS` and `SOFTWARE_DETAILS` hardcoded. Move to post frontmatter for maintainability.
- [ ] `app/blog/[slug]/page.tsx` — Replace `console.log` and `console.warn` with centralized logger utility.
- [ ] `app/blog/[slug]/page.tsx` — Remove unnecessary `await params` and simplify type from `Promise<{slug: string}>`.
- [ ] `app/blog/tags/[tagSlug]/page.tsx` — Functions use `await Promise.resolve()` on synchronous operations. Remove async/await if synchronous.
- [ ] `app/blog/tags/[tagSlug]/page.tsx` — Performance issue: Fetches all posts twice. Consider caching or passing data between functions.

## Blog-Article

- [ ] `lib/utils/tag-utils.ts` - Contains `sanitizeTagSlug` and `tagToSlug` functions. Deprecate `sanitizeTagSlug` and use only `tagToSlug` for consistency.
- [ ] `app/api/twitter-image/[...path]/route.ts` - **CRITICAL SECURITY**: Add explicit `..` check to prevent path traversal.
- [ ] `app/api/twitter-image/[...path]/route.ts` - **HIGH PRIORITY**: Remove `immutable` from Cache-Control to allow revalidation.
- [ ] `app/api/twitter-image/[...path]/route.ts` - **HIGH PRIORITY**: Add content size limit (15MB) to prevent DoS.
- [ ] `app/api/twitter-image/[...path]/route.ts` - Fix header handling: copy upstream headers first, then override with your policies.
- [ ] `app/api/twitter-image/[...path]/route.ts` - Extract excellent `fetchWithRetry` function to shared utility.
- [ ] `app/api/posts/route.ts` - Remove conflicting Next.js directives. Rely solely on Cache-Control headers.
- [ ] `app/api/posts/route.ts` - Add pagination support as blog grows.
- [ ] `app/api/posts/route.ts` - Add API versioning (e.g., `/api/v1/posts`) for future breaking changes.

## Bookmarks

- [ ] `components/features/bookmarks/bookmarks-client-with-window.tsx` — Nested component hierarchy could be flattened to simplify component tree.
- [ ] `lib/bookmarks.ts` - Implement pagination support for large bookmark collections.
- [ ] `lib/data-access/bookmarks.ts` - Replace S3-based locking with DynamoDB conditional writes for better distributed locking.
- [ ] `lib/data-access/bookmarks.ts` - Add retry mechanism with exponential backoff for API failures.
- [ ] `lib/validators/bookmarks.ts` - Create shared validation module to eliminate duplication.
- [ ] `components/features/bookmarks/bookmark-card.client.tsx` - Add lazy loading for bookmark images.
- [ ] `lib/utils/domain-utils.ts` - Consolidate URL manipulation functions into single module.
- [ ] All bookmark files - Implement offline support with service worker caching.
- [ ] `app/bookmarks/page.tsx` — Local `PAGE_METADATA` duplicates global metadata. Import from `data/metadata.ts`.

## Build

- [ ] `scripts/populate-volumes.ts` - **CRITICAL**: Ensure data-access layer sanitizes domain inputs to prevent path traversal.
- [ ] `scripts/populate-volumes.ts` - **HIGH PRIORITY**: Remove regex parsing of TypeScript files. Import data directly.
- [ ] `scripts/populate-volumes.ts` - Remove redundant `createDirectories()` function.
- [ ] `scripts/populate-volumes.ts` - Extract duplicate domain parsing logic into reusable helper.
- [ ] `scripts/populate-volumes.ts` - Replace `while` loops with `String.prototype.matchAll()`.
- [ ] `scripts/consolidate-configs.js` - Rename `executeConsolidation()` to `displayNextSteps()` for clarity.
- [ ] `scripts/consolidate-configs.js` - Use `micromatch` library for robust glob pattern matching.
- [ ] `scripts/pre-build-checks.sh` - Remove redundant second GitHub API check on line 47.
- [ ] `scripts/pre-build-checks.sh` - Implement retry logic for connectivity checks.
- [ ] All build scripts - Add comprehensive error tracking and monitoring.
- [ ] `scripts/check-file-naming.ts` - Replace basic progress indicator with CLI progress bar library.

## Caching

- [ ] `lib/server-cache.ts` - Implement cache warming strategy to pre-fetch common domains during startup.
- [ ] `lib/server-cache.ts` - Add cache statistics tracking (hit/miss ratios, eviction rates).
- [ ] `lib/server-cache.ts` - Implement cache partitioning to separate data types with independent TTLs.
- [ ] `middleware/cache-debug.ts` - Extend to include cache size metrics and memory usage statistics.
- [ ] `app/api/cache/clear/route.ts` - After adding auth, implement selective cache clearing by type or pattern.
- [ ] `lib/utils/revalidate-path.ts` - Create higher-level abstraction combining cache clearing with Next.js revalidation.
- [ ] All cache files - Implement comprehensive test suite covering TTL behavior and race conditions.

## Code-Block

- [ ] `components/ui/code-block/code-block.client.tsx` — `setTimeout` for handling maximize click outside events unreliable. Use robust event listener cleanup.
- [ ] `components/ui/code-block/copy-button.client.tsx` — Copy button positioning could overlap narrow code blocks. Add dynamic width calculation.
- [ ] `components/ui/code-block/mdx-code-block-wrapper.client.tsx` — SVG transform fix should be centralized in utility or hook.

## Config

*No improvement opportunities identified in this functionality.*

## CSS

- [ ] `app/globals.css` - Remove duplicate `animation` properties from glitch animation pseudo-elements (lines 192, 199).
- [ ] `app/globals.css` - Establish clear policy for `!important` flag usage.
- [ ] `app/globals.css` - Consolidate `.x-icon` mobile transform adjustments into single transform.
- [ ] `app/globals.css` - Remove unused CSS variables for chart colors (--chart-1 through --chart-5).
- [ ] `app/globals.css` - Move Dark Reader compatibility styles to separate, conditionally loaded module.
- [ ] `app/globals.css` - Simplify social icon fixes using data attributes or dedicated classes.
- [ ] `app/code-blocks.css` - Remove misleading comment or move active dark mode styles elsewhere.
- [ ] `app/code-blocks.css` - Consolidate duplicate token colors with `prism.css`.
- [ ] `components/ui/simple-tabs.css` - Make tab switching generic to support any number of tabs dynamically.
- [ ] `components/ui/simple-tabs.css` - Migrate CSS-only tabs to React component for better accessibility.
- [ ] `styles/social-styles.css` - Either implement colored bars feature or remove dead code (height: 0).
- [ ] `styles/social-styles.css` - Consolidate duplicate banner image selectors using single class.
- [ ] `components/ui/code-block/prism-syntax-highlighting/prism.css` - Consider using `pre` with horizontal scrolling instead of `pre-wrap`.
- [ ] `components/ui/code-block/prism-syntax-highlighting/prism.css` - Remove empty style blocks for light/dark modes.
- [ ] All CSS files - Consider CSS Modules or CSS-in-JS to avoid global namespace pollution.
- [ ] All CSS files - Add CSS linting (stylelint) to enforce consistent formatting.

## Data-Access

*No improvement opportunities identified in this functionality.*

## Deployment

- [ ] `scripts/entrypoint.sh` - Script runs as root which is security anti-pattern. Run as non-privileged user.
- [ ] `scripts/entrypoint.sh` - Add health check for scheduler process instead of blind start.
- [ ] `scripts/entrypoint.sh` - Cleanup function could miss SIGKILL. Implement robust process management.
- [ ] `scripts/entrypoint.sh` - Add timeout to wait command in cleanup() to prevent hanging.
- [ ] `scripts/entrypoint.sh` - Consider using process supervisor like tini or dumb-init.
- [ ] `scripts/entrypoint.sh` - Add logging for exec command failures.

## Education

- [ ] `app/education/page.tsx` — Consolidate three separate imports from same file into single import statement.

## Error-Handling

*No improvement opportunities identified in this functionality.*

## Experience

- [ ] `app/experience/page.tsx` — Consolidate three separate imports from same file into single import statement.

## GitHub-Activity

- [ ] `lib/data-access/github.ts` - Extract 600+ line function into smaller, testable modules. Separate GraphQL, REST, and CSV processing.
- [ ] `lib/data-access/github.ts` - Add request deduplication to prevent simultaneous refresh requests.
- [ ] `lib/data-access/github.ts` - Implement health metrics for data freshness and consistency monitoring.
- [ ] `app/api/github-activity/refresh/route.ts` - Replace direct API calls with background job queue.
- [ ] All GitHub files - Add comprehensive error boundaries and validation for API responses.
- [ ] `lib/data-access/github.ts` - Implement progressive data fetching to show partial results during refreshes.
- [ ] `scripts/scheduler.ts` - Add monitoring and alerting for failed scheduled refreshes.
- [ ] `app/api/github-activity/route.ts` — Extract default `UserActivityView` creation to shared utility function.
- [ ] `app/api/github-activity/refresh/route.ts` — Remove environment variable names from console.warn for security.
- [ ] `app/api/github-activity/refresh/route.ts` — Improve error handling - throw exceptions instead of returning falsy values.
- [ ] `app/api/github-activity/refresh/route.ts` — Remove redundant `dynamic = 'force-dynamic'` for POST route.

## Home

- [ ] `app/page.tsx` — The documentation mentions that 'app/page.tsx' is configured for ISR with a one-hour revalidation, but there is no mention of fallback mechanisms if data updates fail within the hour. Consider adding fallback logic to handle stale content scenarios.
- [ ] `components/features/home/home.tsx` — Review ISR integration to ensure robust data update handling in case of failures.

## Hooks

- [ ] `lib/hooks/use-anchor-scroll.client.ts` — Document the reasoning behind browser-specific optimizations for Firefox with longer delays to ensure maintainability and consistent scrolling behavior across browsers.
- [ ] `lib/hooks/use-anchor-scroll.client.ts` — Consider adding performance optimizations for scroll retry timers to prevent unnecessary operations on route changes.
- [ ] `lib/hooks/use-window-state.client.ts` — Address potential hydration delay impacts on window state initialization to prevent flickering or incorrect initial states.
- [ ] `lib/hooks/use-fix-svg-transforms.ts` — Optimize performance by implementing throttling or debouncing for MutationObserver to handle frequent DOM updates efficiently.
- [ ] `docs/projects/structure/hooks.mmd` — Update documentation to include details on browser-specific optimizations and performance considerations.

## Image-Handling

- [ ] `lib/logo-fetcher.ts` and `lib/logo.server.ts` - Consolidate overlapping functionality. Remove duplicate `normalizeDomain` functions.
- [ ] `lib/imageAnalysis.ts` - Add caching for analysis results to avoid reprocessing identical images.
- [ ] `lib/data-access/logos.ts` - Implement batched logo fetching to reduce API calls.
- [ ] `lib/data-access/logos/external-fetch.ts` - Add timeout configuration for external API calls.
- [ ] `lib/data-access/logos/image-processing.ts` - Implement progressive image loading by generating multiple sizes.
- [ ] `lib/utils/svg-transform-fix.ts` - Create comprehensive test suite for SVG malformation patterns.
- [ ] All image files - Implement comprehensive error tracking and monitoring for failed operations.
- [ ] `app/api/assets/[assetId]/route.ts` - Document response streaming pattern as best practice.
- [ ] `app/api/cache/images/route.ts` - Implement etag-based caching to reduce unnecessary processing.
- [ ] `app/api/logo/invert/route.ts` - Extend HEAD endpoint pattern to other image processing endpoints.
- [ ] All image API routes - Implement consistent error response format with structured error codes.
- [ ] All image API routes - Add OpenTelemetry tracing to monitor performance bottlenecks.
- [ ] `app/api/og-image/route.ts` - Add Promise.race for faster fallback to default images.
- [ ] `app/api/logo/route.ts` — Remove conflicting cache directives. Rely on Cache-Control headers.
- [ ] `app/api/logo/route.ts` — Extract domain parsing logic to dedicated utility function.
- [ ] `app/api/logo/invert/route.ts` — Remove `/api` relative URL handling for security.
- [ ] `app/api/logo/invert/route.ts` — Consolidate to single caching strategy (remove redundant in-memory cache).
- [ ] `app/api/logo/invert/route.ts` — Remove conflicting cache directives.
- [ ] `app/api/validate-logo/route.ts` - **HIGH PRIORITY**: Add file size validation (10MB limit).
- [ ] `app/api/validate-logo/route.ts` - **HIGH PRIORITY**: Validate file type before processing.
- [ ] `app/api/validate-logo/route.ts` - Remove conflicting cache directives.
- [ ] `app/api/validate-logo/route.ts` - Implement request queuing or rate limiting for CPU-intensive operations.
- [ ] `app/api/validate-logo/route.ts` - Simplify reference globe icon loading to single path.
- [ ] `app/api/validate-logo/route.ts` - Add structured logging for monitoring validation patterns.
- [ ] `app/api/validate-logo/route.ts` - Consider moving image comparison logic to worker service.

## Interactive-Containers

*No improvement opportunities identified in this functionality.*

## Investments

- [ ] `lib/data-access/investments.ts` — Remove brittle regex-based fallback for parsing investment data. Rely solely on static imports.
- [ ] `components/features/investments/investment-card.client.tsx` — Refactor to use `AcceleratorBadge` component instead of duplicating logic.
- [ ] `components/ui/financial-metrics.server.tsx` & `investment-card.client.tsx` — Either fully implement metrics feature or remove dead code.
- [ ] `app/investments/page.tsx` — Consolidate three separate imports from same file into single import statement.

## JSON-Handling

- [ ] `lib/data-access/bookmarks.ts` — For high-traffic scenarios, upgrade S3-based lock to DynamoDB with conditional writes for atomic operations.

## Log-Debug

- [ ] `app/api/debug/posts/route.ts` - Replace string concatenation with proper type narrowing.
- [ ] `app/api/health/route.ts` - Extract no-cache headers to shared constant.
- [ ] `app/api/log-client-error/route.ts` - Add structured logging format (JSON) for better log parsing.
- [ ] `app/api/tunnel/route.ts` - Consider request batching for multiple Sentry events.
- [ ] `app/sentry-example-page/page.tsx` - Add environment-based conditional rendering to hide debug UI in production.
- [ ] All log-debug files - Implement centralized audit logging with who/what/when tracking.
- [ ] All debug endpoints - Add OpenTelemetry instrumentation for observability.
- [ ] `app/api/sentry-example-api/route.ts` - **CRITICAL**: Add production environment check.
- [ ] `app/api/sentry-example-api/route.ts` - Remove unreachable code after throw statement.
- [ ] `app/api/sentry-example-api/route.ts` - Add documentation comment explaining debug-only purpose.
- [ ] `app/api/sentry-example-api/route.ts` - Consider renaming to follow debug endpoint pattern.
- [ ] `app/api/health/route.ts` — Remove `await Promise.resolve()` workaround for synchronous function.
- [ ] `app/api/health/route.ts` — Define no-cache headers once in shared constant.
- [ ] `app/api/ip/route.ts` — Remove `await Promise.resolve()` workaround for synchronous function.

## Logging

- [ ] `lib/utils/logger.ts` - Replace simple console wrapper with robust logging library like `pino` for structured logging, log levels, and transport options.
- [ ] `lib/utils/debug.ts` - Consolidate with `logger.ts` to create single logging module.

## macOS-GUI

- [ ] `components/ui/macos-window.client.tsx` — Deprecate `hideTrafficLights` prop and migrate all uses to `showTrafficLights` for API simplicity.

## Middleware

*No improvement opportunities identified in this functionality.*

## Navigation

- [ ] `components/ui/navigation/navigation.client.tsx` - Replace JavaScript-based responsive logic with CSS media queries.
- [ ] `components/ui/navigation/navigation-link.client.tsx` - Extract hardcoded "Projects Sandbox" logic to configuration.
- [ ] `lib/hooks/use-anchor-scroll.client.ts` - Add proper error boundaries for scroll failures.
- [ ] `components/ui/navigation/window-controls.tsx` - Add actual functionality or remove if purely decorative.
- [ ] `components/ui/collapse-dropdown.client.tsx` - Add explicit ID prop instead of generating from summary text.
- [ ] All navigation files - Consolidate duplicate navigation mapping logic into single source of truth.
- [ ] `types/navigation.ts` - Define comprehensive TypeScript interfaces for navigation configuration.

## Network

- [ ] `lib/utils/retry.ts` - Refactor `retryOperation` to throw last error instead of returning null. Replace console logs with structured logger.

## Nextjs-Architecture

- [ ] `lib/utils/ensure-server-only.ts` - Remove redundant file. Use `assertServerOnly` from `runtime-guards.ts` instead.

## Overview

- [ ] `lib/constants.ts` - Hardcoded `ENDPOINTS` object should be constructed dynamically from route-aware utility.
- [ ] `lib/utils.ts` - Split `extractDomain` function into separate URL parsing and company name cleaning functions.
- [ ] `lib/utils.ts` - Add warning documentation for `randomString` function about non-cryptographic security.
- [ ] `lib/utils/domain-utils.ts` - Refactor `generateUniqueSlug` to be more generic and less coupled to test cases.

## Projects

*No improvement opportunities identified in this functionality.*

## Rate-Limit-and-Sanitize

*No improvement opportunities identified in this functionality.*

## S3-Object-Storage

- [ ] `lib/data-access/logos/s3-operations.ts` — Add check for `DeleteMarker: true` in delete operations.
- [ ] `lib/s3-utils.ts` — Make CDN bypass logic configurable instead of hardcoded by file extension.
- [ ] `lib/s3-utils.ts` — Expand error handling for S3-specific error codes (AccessDenied, BucketNotFound, etc.).
- [ ] `lib/s3.ts` — Implement connection pool or multiple S3Client instances for better concurrency.
- [ ] `lib/utils/image-s3-utils.ts` - Remove tight coupling to other modules. Move specific logic to calling modules.
- [ ] `lib/utils/image-s3-utils.ts` - Replace inefficient `findImageInS3` fallback with dedicated index or database.
- [ ] `lib/utils/opengraph-utils.ts` - Refactor `getOgImageS3Key` to use single, deterministic key generation method.
- [ ] `lib/data-access/logos/s3-store.ts` — Implement proper error recovery for failed cache initialization.
- [ ] `lib/s3-utils.ts` — Add request/response logging for debugging S3 operations in development.
- [ ] `lib/data-access/logos/s3-operations.ts` — Implement versioning support for logos.
- [ ] `lib/s3-utils.ts` — Add support for S3 Transfer Acceleration.
- [ ] `types/s3.ts` — Extend type definitions to include S3 operation metadata.

## Search

- [ ] `lib/search.ts` - Create generic search utility function to eliminate code duplication across all search functions.
- [ ] `app/api/search/[...scope]/route.ts` - Implement unified search API endpoint to replace multiple endpoints.
- [ ] `scripts/build-search-index.ts` - Create build-time search index generation for better performance.
- [ ] All search files - Integrate Fuse.js for fuzzy matching, typo tolerance, and weighted search.
- [ ] `lib/search.ts` - Add search result ranking and relevance scoring.
- [ ] `app/api/search/*` - Implement rate limiting to prevent abuse.
- [ ] `types/search.ts` - Extend SearchResult interface to include match score and highlight positions.
- [ ] All search files - Add comprehensive test coverage for search functionality.
- [ ] `lib/search/service.ts` - Create centralized search service with proper dependency injection.

## SEO

- [ ] `lib/utils/domain-utils.ts` - Enhance `ensureAbsoluteUrl` to handle protocol-relative URLs (e.g., `//example.com`).
- [ ] `lib/seo/index.ts` - Make hardcoded values more dynamic or configurable for flexibility.
- [ ] `lib/seo/metadata.ts` - Replace brittle JPEG assumption in image variations with robust image processing.
- [ ] `lib/seo/metadata.ts` - Review `other` metadata block for redundancy with `openGraph` object.
- [ ] `lib/seo/metadata.ts` - Refactor `getStaticPageMetadata` to configuration-based approach.
- [ ] `lib/seo/schema.ts` - Parameterize hardcoded dataset license and article language values.
- [ ] `lib/seo/schema.ts` - Simplify and DRY up `createProfilePageEntity` function logic.
- [ ] `lib/seo/utils.ts` - Replace custom date formatting with `date-fns-tz` library.
- [ ] `types/seo/metadata.ts` - Remove duplicate schema type definitions. Import from `types/seo/schema.ts`.
- [ ] `types/seo/metadata.ts` - Use specific types like `ArticleOpenGraph` instead of generic types.
- [ ] `types/seo/schema.ts` - Refactor `SchemaParams` into discriminated union based on `type` property.

## Social-Links

*No improvement opportunities identified in this functionality.*

## String-Manipulation

- [ ] `lib/utils/formatters.ts` - Consolidate with `lib/utils/tag-utils.ts` to create single string manipulation module.
- [ ] `lib/utils/domain-utils.ts` - Refactor `generateUniqueSlug` to be more generic and predictable.

## Terminal

- [ ] `components/ui/terminal/__tests__/terminal.test.tsx` — Enable skipped test suite for this complex, interactive component.
- [ ] `components/ui/terminal/use-terminal.client.tsx` — Replace fixed 100ms timeout with MutationObserver or state-based approach.
- [ ] `components/ui/terminal/commands.client.ts` — Implement command registry pattern for dynamic command registration.
- [ ] `components/ui/terminal/terminal-implementation.client.tsx` — Use ref-based approach for event listener cleanup.
- [ ] `components/ui/terminal/selection-view.client.tsx` — Implement virtualization for long result lists.
- [ ] `components/ui/terminal/terminal-context.client.tsx` — Implement maximum history limit for sessionStorage.
- [ ] `components/ui/terminal/history.tsx` — Add syntax highlighting for different command types.
- [ ] `lib/context/terminal-window-state-context.client.tsx` — Extend to support multiple terminal instances.

## Testing-Config

*No improvement opportunities identified in this functionality.*

## Tests

*No improvement opportunities identified in this functionality.*

## Theming

- [ ] `app/providers.client.tsx` — Consider adding user notification or override options for theme preference expiry to prevent unexpected theme reversion.
- [ ] `app/layout.tsx` — Review theme state management integration for user experience improvements related to theme expiry.
- [ ] `components/ui/theme/theme-provider.client.tsx` — Implement mechanisms to notify users about theme preference expiry or allow longer persistence.

## Window-and-State-Mgmt

- [ ] `app/providers.client.tsx` — Evaluate sessionStorage usage for window state to handle storage limits or multi-tab conflicts.
- [ ] `app/layout.tsx` — Ensure window management logic accounts for sessionStorage constraints and multi-tab scenarios.
- [ ] `lib/context/global-window-registry-context.client.tsx` — Add handling for sessionStorage limits to prevent inconsistent window behavior.
- [ ] `lib/hooks/use-window-state.client.ts` — Implement safeguards for sessionStorage limits and secure console logging by conditionally disabling logs in production.
- [ ] `lib/hooks/use-window-size.client.ts` — Add debouncing or throttling to resize event handling to prevent frequent re-renders during rapid window resizing.

## Type Definitions

- [ ] `types/env.d.ts` - Add comprehensive type definitions for all environment variables used in the application.
- [ ] `types/error.ts` - Consolidate duplicate timestamp properties to single, consistent property name.
- [ ] `types/error.ts` - Move type guards and utility functions to `lib/utils/error-utils.ts`.
- [ ] `types/jest-dom.jest.d.ts` - Rename to `jest-dom.d.ts` to remove redundant `.jest`.
- [ ] `types/jest-extended.d.ts` - Add comprehensive type definitions or document why only `toBeString()` is needed.
- [ ] `types/project.ts` - Define proper image type instead of indirect `ImageProps['src']` reference.
- [ ] `types/social.ts` - Replace `z.any()` for icon property with proper type definitions.
- [ ] `types/terminal.ts` - Remove `SearchResult` duplicate. Use `SelectionItem` consistently.
- [ ] `types/global/window.d.ts` - Split into separate files: `analytics.d.ts` and `jsx-compat.d.ts`.
- [ ] `types/global/window.d.ts` - Add TODO comment to remove JSX namespace workaround when @types/mdx is updated.

## Uncategorized

- [ ] `components/features/index.ts` - Update barrel file to export all feature components (Bookmarks, Projects, Social, Education, GitHub).
- [ ] `components/ui/index.ts` — Update barrel file to export all UI components (Card, CollapseDropdown, MacOSWindow, etc.).
- [ ] `components/ui/responsive-table.client.tsx` — Refactor to generic table or move to `components/features/investments/`.
- [ ] `components/ui/simple-tabs.css` — Refactor to use generic data-attribute selectors instead of hardcoded tab names.
