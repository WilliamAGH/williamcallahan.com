# Caching Architecture

**Functionality:** `caching`

## Core Objective

Use durable data stores (PostgreSQL + S3 binaries) plus Next.js Cache Components to deliver low-latency reads, predictable invalidation, and clear cache boundaries between UI rendering and API routes.

## Architecture Diagram

See `docs/architecture/caching.mmd` for the current write/read/supporting flow.

## Caching Inventory

### Domain Responsibilities

| Domain                   | Source of truth                                             | Cached read path                                   | Invalidation                                                |
| ------------------------ | ----------------------------------------------------------- | -------------------------------------------------- | ----------------------------------------------------------- |
| Bookmarks                | PostgreSQL read model (`src/lib/db/*`)                      | `"use cache"` functions + tag-labeled RSC reads    | `revalidateTag("bookmarks")`, slug/tag-specific tags        |
| Blog + Related Content   | Repository content + PostgreSQL content-graph artifacts     | Server read functions with `cacheLife/cacheTag`    | `revalidateTag("blog")`, `revalidateTag("related-content")` |
| GitHub Activity          | PostgreSQL `github_activity_store` (JSON payload documents) | RSC summaries/pages using cache tags               | `revalidateTag("github-activity")`                          |
| Images/Logos/OG metadata | S3 objects + manifests                                      | Cache-tagged server accessors and manifest loaders | tag invalidation + key-level refresh                        |

### Route Policy

- API routes (`/api/*`) that must always read fresh state call `unstable_noStore()`.
- RSC/server data functions use `"use cache"` and explicit `cacheLife/cacheTag` profiles.
- Cache behavior is intentional per route type; APIs do not rely on UI cache directives.

## Implementation Pattern

```typescript
import {
  unstable_cacheLife as cacheLife,
  unstable_cacheTag as cacheTag,
  revalidateTag,
} from "next/cache";

export async function getCachedData() {
  "use cache";
  cacheLife("hours");
  cacheTag("domain-tag");
  return fetchDomainData();
}

export function invalidateDomainData() {
  revalidateTag("domain-tag");
}
```

## Invalidation Strategy

### Scheduler/Refresh Driven

- Refresh jobs write durable state first (PostgreSQL/S3).
- After successful writes, tags and route paths are revalidated.
- Revalidation is authenticated for operational endpoints.

### Tag Granularity

Common tag strategy:

- `bookmarks`
- `bookmark-{slug}`
- `bookmarks-tag-{slug}`
- `related-content`
- `blog`
- `github-activity`
- image-key specific tags where needed

### Path Revalidation

Use path revalidation for high-value user routes when content freshness must be immediate (for example bookmark lists/details after refresh completion).

## Cache Safety Wrappers

Server functions that can run in CLI/build contexts use guard wrappers before calling `cacheLife/cacheTag/revalidateTag` to avoid invalid runtime contexts.

```typescript
const safeCacheTag = (...tags: string[]) => {
  if (typeof cacheTag !== "function" || isCliLikeContext()) return;
  for (const tag of new Set(tags)) cacheTag(tag);
};
```

## Static-to-Dynamic Safety (`cacheComponents`)

When `cacheComponents` is enabled:

1. Avoid `cache: "no-store"` in page/server-component fetches unless dynamic behavior is required.
2. Prefer positive `revalidate` values for deterministic prerender/runtime behavior.
3. Avoid runtime-only bailouts (`connection()`) in paths intended for prerender.
4. Keep timestamp logic prerender-safe.

### Detection Commands

```bash
rg "cache:\s*\"no-store\"" src app components
rg "connection\s*\(" src app components
rg "Date\.now\(\)" src/lib src/components
```

## Security

### Authenticated Cache Operations

- Cache mutation endpoints require explicit authentication headers/secrets.
- Unauthorized calls return 401 and perform no cache mutation.

### API Separation

- Public read APIs do not expose privileged invalidation paths.
- Invalidation routes are scoped and auditable.

## Key Files

- `src/lib/bookmarks/bookmarks-data-access.server.ts`
- `src/lib/search.ts`
- `src/lib/data-access/github.ts`
- `src/lib/data-access/github-storage.ts`
- `src/lib/data-access/images.server.ts`
- `src/lib/data-access/opengraph.ts`
- `src/lib/image-handling/image-manifest-loader.ts`
- `src/app/api/cache/bookmarks/route.ts`

## Performance Expectations

- Cached RSC responses should be low-latency after warm-up.
- Durable-state reads (PostgreSQL/S3) should remain stable under scheduler-driven refresh cadence.
- Invalidations should be targeted by tag/path instead of global clears.

## Testing Expectations

- Validate tag/path invalidation behavior for each high-traffic domain.
- Verify scheduler refresh writes durable state before invalidation triggers.
- Ensure API routes using `unstable_noStore()` do not regress into stale cached responses.
- Confirm build/runtime parity for `cacheComponents` routes.

## Long-Term Improvements

1. Add cache hit/miss telemetry per domain tag.
2. Add integration tests for revalidation webhooks/endpoints.
3. Standardize cache profiles for each domain in one shared configuration module.
