# Bookmarks Architecture

**Functionality:** `bookmarks`

## Core Purpose

The bookmarks system orchestrates fetching, processing, enriching, and serving bookmark data from an external API (Karakeep). It provides a rich, searchable, and performant bookmark collection with advanced features like pagination, tag filtering, and automatic metadata enrichment. **Alongside blog articles, bookmarks is our highest-traffic surface**, so every optimization described here is mandatory, not optional.

## Architecture Overview

### Data Flow

```
Karakeep API -> Selective Refresh Jobs -> Drizzle writes (bookmarks + taxonomy/index tables + bookmarks_tags + bookmarks_tags_links)
                                                   |
                              PostgreSQL read model (lists/pages/tags/index joins)
                                                   |
                                        Next.js Cache Components (pages, RSCs)
                                                   |
                                   Clients (lists, detail pages, related content)
```

### Key Components

1. **Refresh & Data Access Layer** (`lib/bookmarks/bookmarks-data-access.server.ts`)
   - Manages PostgreSQL-first runtime reads and PostgreSQL persistence
   - Uses in-process refresh locking for refresh operations and selective rewrites
   - Handles request coalescing and deduplication
   - Provides paginated and tag-filtered data access from PostgreSQL query modules

2. **Service Layer** (`lib/bookmarks/service.server.ts`)
   - Business logic orchestration
   - Coordinates between data access and external APIs
   - Manages refresh cycles and cache invalidation

3. **API Endpoints (always `unstable_noStore`)**
   - `/api/bookmarks` - Paginated bookmark retrieval with tag filtering and feed mode (`?feed=discover|latest`); responds with `Cache-Control: public, s-maxage=60, stale-while-revalidate=300`
   - `/api/bookmarks/refresh` - Manual refresh trigger (secret protected)
   - `/api/engagement` - Client engagement event ingestion (impression, click, dwell, external_click)
   - `/api/og-image` - Unified OpenGraph image serving

4. **UI Components (Next.js cache consumers)**
   - Server components for initial data fetching (`"use cache"` + cache tags per page/tag slug)
   - Client components for interactivity and pagination
   - Tag navigation with URL-based routing
   - Share functionality with pre-generated URLs
   - Feed toggle (Discover/Latest) in BookmarksWindow title bar
   - Hero row and section breaks for magazine-style discover layout

### Scraped Content Normalization

- Refresh pagination requests `includeContent=true` from Karakeep so crawled page HTML is available during normalization.
- Crawled HTML from the Karakeep API is converted to clean plain text via `normalizeScrapedContentText()` during normalization.
- Normalized text is stored in PostgreSQL as `scraped_content_text`; raw HTML is explicitly excluded from the persisted `content` JSONB column.
- Embedding payload generation uses `scraped_content_text` as the content source (positioned last so server-side token truncation clips its tail first).

### Derived Columns

Derived columns are computed during normalization (`lib/bookmarks/normalize.ts`) and stored in PostgreSQL. The computation is deterministic and reusable for both ingestion and backfill.

- **`word_count`**: `text.trim().split(/\s+/).length` from `scraped_content_text`. Returns `undefined` when no scraped content exists.
- **`reading_time`**: `Math.ceil(wordCount / 200)` (200 WPM). Returns `undefined` when word count is 0 or undefined.
- **`og_title`**, **`og_description`**, **`og_image`**: Populated during OG enrichment (`lib/bookmarks/enrich-opengraph.ts`) or backfilled by fetching bookmark URLs and parsing `<meta property="og:*">` tags.
- **`logo_data`**: `{url, alt}` JSONB mapped from the S3 CDN logo manifest (`json/image-data/logos/manifest.json`) keyed by bookmark domain.

### Backfill Scripts

All backfill scripts are standalone Node (`#!/usr/bin/env node`) scripts using `postgres` directly. They share a production write guard pattern (`assertDatabaseWriteAllowed`) and support `--dry-run`, `--force`, and `--ids` flags.

```bash
# Source env and run any backfill script
set -a && source .env && set +a

# Derived fields (word_count, reading_time) from scraped_content_text
DEPLOYMENT_ENV=production NODE_ENV=production node scripts/backfill-computed-fields.node.mjs

# OG metadata by fetching bookmark URLs
DEPLOYMENT_ENV=production NODE_ENV=production node scripts/backfill-og-metadata.node.mjs

# Logo data from S3 CDN manifest
DEPLOYMENT_ENV=production NODE_ENV=production node scripts/backfill-logo-data.node.mjs

# Embeddings (Qwen3-Embedding-4B, 2560-d halfvec)
DEPLOYMENT_ENV=production NODE_ENV=production node scripts/backfill-bookmark-embeddings.node.mjs --force --batch-size 4
```

### Tag Alias Canonicalization Ingestion

- `scripts/ingest-bookmark-tag-aliases.node.mjs` runs tag alias canonicalization from bookmark tag context plus embedding-nearest related bookmarks.
- Each run can process one seed bookmark (plus up to 8 similar bookmarks by default), ask the LLM for alias-to-canonical tag mappings, and write results to `bookmarks_tags` + `bookmarks_tags_links`.
- Alias tags are stored in `bookmarks_tags` (`tag_status='alias'`) and mapped to canonical primary tags through `bookmarks_tags_links`.
- Incremental mode: `node scripts/ingest-bookmark-tag-aliases.node.mjs --limit=1`
- Retrofit mode: `node scripts/ingest-bookmark-tag-aliases.node.mjs --retrofit --limit=1`
- One-bookmark test run: `node scripts/ingest-bookmark-tag-aliases.node.mjs --bookmark-id=<bookmark-id>`
- Dry-run preview: append `--dry-run` to print before/after without writes.

### Scheduler / Cron Pipeline

- `scripts/data-updater.ts` now accepts:
  - `--bookmark-tags`
  - `--bookmark-tags-retrofit`
- `src/lib/server/scheduler.ts` schedules:
  - `S3_BOOKMARK_TAGS_CRON` (default `30 */4 * * *`, every 4 hours)
  - `S3_BOOKMARK_TAGS_RETROFIT_CRON` (default `45 3 * * *`, daily at 3:45 AM PT)
- Both tag alias cron jobs trigger bookmark cache revalidation via `/api/revalidate/bookmarks`.

### Runtime Fetch Strategy

- Builds no longer hydrate bookmark JSON locally. Docker images and workstation builds read bookmarks from PostgreSQL in runtime paths.
- `app/sitemap.ts` iterates DB-backed pagination via `getBookmarksIndex()` + `getBookmarksPage()` and streams tag metadata via `listBookmarkTagSlugs()` + `getTagBookmarksIndex()`/`getTagBookmarksPage()` so the sitemap never materializes the full dataset in memory.
- All bookmark data is served from PostgreSQL at runtime; no local JSON snapshot step is required.

### Rendering Strategy

- Bookmark detail routes (`app/bookmarks/[slug]/page.tsx`) keep Cache Components enabled and rely on a `<Suspense>` boundary around `RelatedContent` to stream recommendations. `RelatedContent` does **not** call `connection()`; it avoids build-time execution by returning `null` during the production build phase and performs PostgreSQL-backed precomputed lookups (`content_graph_artifacts`) at request time, with an in-process cache fallback to avoid repeated similarity computation. Slug-resolution helpers (`findBookmarkBySlug`, `resolveBookmarkIdFromSlug`) remain cache-tagged for memoization.
- Bookmark tag routes (`app/bookmarks/tags/[...slug]/page.tsx`) can display a “Discover More” related-content section sourced from the first bookmark on the page, with the active tag excluded from recommendations.

### Engagement Tracking & Discovery Feed

The discovery feed ranks bookmarks by blended engagement and recency signals rather than pure chronological order.

**Feed Modes** (`?feed=discover|latest`):

- **Discover** (default): Recency-primary ranking (82% recency + 18% engagement). Client-side SWR fetch with `fallbackData: undefined` triggers a loading skeleton while the API returns engagement-ranked results. Falls back to latest order when discovery scores are unavailable.
- **Latest**: Chronological order using server-provided `initialData` via SWR `fallbackData`.

**Data Flow**:

```
Client events → POST /api/engagement → content_engagement table
                                              ↓
                        getDiscoveryRankedBookmarks() joins bookmarks + engagement aggregation
                                              ↓
                        applyCategoryDiversity() prevents 3+ consecutive same-category items
                                              ↓
                        Client SWR receives ranked bookmarks
```

**Engagement Events** (validated by Zod schema in `types/schemas/engagement.ts`):

- `impression`: Bookmark enters viewport (IntersectionObserver)
- `click`: User clicks bookmark card
- `dwell`: Time spent on detail page
- `external_click`: User follows external link

**Key Modules**:

- `src/lib/db/schema/content-engagement.ts`: Drizzle schema for `content_engagement` table
- `src/lib/db/schema/bookmark-taxonomy.ts`: Includes `bookmarks_tags` + `bookmarks_tags_links` for primary/alias tag canonicalization
- `src/lib/db/queries/discovery-scores.ts`: `computeDiscoveryScore()`, `getDiscoveryRankedBookmarks()`
- `src/hooks/use-engagement-tracker.ts`: Client-side hook for batching and flushing events
- `src/components/features/bookmarks/impression-tracker.client.tsx`: IntersectionObserver wrapper
- `src/components/features/bookmarks/feed-toggle.client.tsx`: Discover/Latest segmented control
- `src/components/features/bookmarks/hero-row.client.tsx`: Top-3 hero cards in discover mode
- `src/components/features/bookmarks/section-break.client.tsx`: Thematic section dividers

## Key Features

### Pagination System

- **Root Discover Feed**: `/bookmarks` uses auto-scroll loading for topic sections
- **Tag Pages**: URL-based pagination remains on `/bookmarks/tags/[tagSlug]/page/[n]`
- **Efficient Loading**: 24 items per page, served from PostgreSQL pagination + RSC cache
- **Dual Modes**: Tag pagination controls or infinite scroll where explicitly enabled
- **SEO Optimized**: Canonical tag pagination URLs in sitemap generation

### Tag System

- **URL Routes**: `/bookmarks/tags/[tagSlug]`
- **Slug Handling**: Converts between slug and display formats
- **Special Characters**: Handles &, +, and other characters gracefully
- **DB Join Path**: Tag routes are served from `bookmark_tag_links` joins with deterministic sort/order.
- **Index Metadata**: Per-tag counts/pages are served from `bookmark_tag_index_state`.

### Memory & Cache Management

- **Health Monitoring**: `/api/health/deep` verifies shard lookups (`json/bookmarks/slug-shards*/`) resolve correctly, guaranteeing slug files and mapping stay in sync.
- **Next.js Cache Tags**: Bookmark lists/tag pages use `cacheTag("bookmarks")` plus slug-specific tags with 15–60 minute lifetimes. Detail routes tag `bookmark-${slug}`. Related content uses its own tags while reading PostgreSQL-backed content-graph artifacts.
- **API Responses**: `/api/bookmarks`, `/api/search/*`, `/api/related-content*` call `unstable_noStore()` and return `Cache-Control: no-store` so they always read the freshest DB-backed bookmark state without joining the Cache Components layer.
- **Legacy Map Cache**: Still used for metadata (slug lookups, stats) but never stores full bookmark arrays or buffers.

### Memory Management

- **Tag Caching Controls**:
  - `ENABLE_TAG_CACHING`: Emergency shutoff
  - `MAX_TAGS_TO_CACHE`: Limits to top N tags
- **Buffer Management**: No raw buffers in cache, only metadata

### Performance Optimizations

- **Request Coalescing**: Prevents duplicate API calls
- **Multi-layer Caching**: Memory -> PostgreSQL -> External API
- **Bookmark Detail Cache**: `/bookmarks/[slug]` uses Next.js segment caching with a 2-hour revalidate window and tag-based invalidation tied to `bookmark-${id}` tags, so detail pages are reused across requests without sacrificing freshness
- **Singleton Pattern**: One initialization per process
- **Background Refresh**: Non-blocking with 15-minute cooldown

## Data Structures

### UnifiedBookmark

Core data model with fields for:

- Basic metadata (id, url, title, description)
- Tags (supports both string[] and object[] formats)
- Timestamps (created, updated, bookmarked)
- Enrichment data (OpenGraph, assets, logos)
- Content from Karakeep (screenshots, metadata)
- Normalized scraped text (`scrapedContentText`) derived from Karakeep HTML content

### S3 Storage Layout

S3 is retained for slug mapping artifacts and shard lookups. Runtime bookmark list/page/tag/index reads and writes are PostgreSQL-backed.

```
json/bookmarks/
├── slug-mapping-dev.json    # Aggregate slug mapping (env-suffixed)
├── slug-shards-dev/         # Sharded slug->id lookups (per slug file)
│   ├── aa/
│   │   └── apple.json
│   └── __/
│       └── 404.json
```

Note: Bookmark arrays and index/tag pages are persisted in PostgreSQL. The centralized slug-mapping file
(`slug-mapping*.json`) remains the integrity checkpoint, while `slug-shards*/**/*.json` provides O(1) slug lookups
without reading the full mapping file.

Embedded slugs are treated as the source of truth during refreshes; metadata-only updates preserve existing slugs
to avoid URL churn when titles or OpenGraph descriptions change.

## Critical Design Decisions

### 1. Title-Based Slug Generation for Content-Sharing Domains

**Problem**: Slug collisions on content-sharing platforms (YouTube, Reddit, etc.) where multiple pieces of content share the same URL structure.

**Solution**: Domain whitelist (`lib/config/content-sharing-domains.ts`) generates title-based slugs via `titleToSlug()` instead of domain+path. E.g. `youtube.com/watch?v=abc123` + "How to Use OpenAI" → `youtube-how-to-use-openai`. Regular domains continue using domain+path slugs. Numeric suffixes (`-2`, `-3`) handle remaining collisions.

### 2. Callback Pattern for Circular Dependencies

**Problem**: Circular dependency between business logic and data access layers

**Solution**: Data access layer accepts refresh callback via `setRefreshBookmarksCallback`

### 3. In-Process Refresh Locking

**Problem**: Race conditions with concurrent refresh operations. **Solution**: `refresh-logic.server.ts` keeps a process-local lock and in-flight promise gate (one app container per environment).

### 4. Refresh Memory Protection

**Problem**: Metadata refresh/enrichment bursts can exhaust memory under load.

**Solution**:

- Memory headroom checks before operations
- Non-blocking refresh with immediate response
- Selective metadata refresh strategy to avoid unnecessary full rewrites

### 5. Client-Server Data Consistency

**Problem**: Client filtering conflicting with server-filtered data

**Solution**:

- Server provides pre-filtered data for tag pages
- Client skips redundant filtering on tag routes
- Pagination hook respects server-provided initial data

### 6. Slug Uniqueness Guarantees

**Strategy**:

```text
1. Primary: Title-based slugs for content-sharing domains (YouTube, Reddit, etc.)
2. Secondary: Domain + path-based slugs for regular domains
3. Fallback: Numeric suffixes when identical slugs detected (-2, -3, etc.)
```

**Deterministic Ordering**:

- Bookmarks sorted by ID before slug generation
- Ensures consistent slug assignment across refreshes
- First bookmark with a given slug gets no suffix
- Subsequent bookmarks with same base slug get -2, -3, etc.

**Edge Cases Handled**:

- Empty titles on content-sharing domains -> Fall back to domain + path
- Identical titles on same platform -> Numeric suffix applied
- Very long titles -> Truncated at 60 characters at word boundary
- Special characters in titles -> Sanitized to URL-safe format

## Security Considerations

1. **XSS Protection**: React's default escaping for OpenGraph data
2. **Asset Proxying**: Bearer token authentication for Karakeep assets
3. **Rate Limiting**: API endpoints protected against abuse
4. **Input Validation**: Tag slugs sanitized and validated

## Monitoring & Operations

- `/api/health` endpoint with system health checks; refresh lock state reported by runtime diagnostics
- `/api/bookmarks/refresh` for manual refresh trigger (secret protected)
- Detailed logging, cache hit/miss metrics, and external API error tracking

## Related Documentation

- See `bookmarks.mmd` for visual architecture diagram
- See `s3-object-storage.md` for storage patterns
- See `opengraph.md` for metadata enrichment

## Data Requirements & Regression Warnings

### Critical: Image Data Requirements by Use Case

**The most common regression in this codebase is missing images in UI components due to `includeImageData: false`**

#### UI Components (MUST include image data)

1.  **RelatedContent Component** (`components/features/related-content/`):
    - Data sources: pgvector cosine ANN search (`findSimilarByEntity`) with batch hydration (`hydrateRelatedContent`) that fetches preview metadata and best image URL from domain tables.
    - Why: Displays bookmark thumbnails in "Discover Similar Content".

2.  **Bookmark Cards/Lists**: Any component rendering bookmark cards with visual previews.

#### Build-Time Operations (can exclude image data)

These operations only need metadata and can safely use `includeImageData: false`:

1.  **Sitemap Generation** (`app/sitemap.ts`): Only needs URLs and slugs.
2.  **Slug Mapping Generation**: Only needs bookmark IDs and titles.
3.  **Search Index Building**: Only needs text content.

**Common regression**: Adding `includeImageData: false` to optimize build memory causes UI components to lose thumbnails. NEVER change `includeImageData` without checking all consumers.

## Deployment & Automatic Data Population (Integrated)

This consolidates deployment details for bookmarks data population and scheduler behavior.

### Automatic Population on Container Startup

- `scripts/entrypoint.sh` ensures slug mappings exist at boot:
  - Runs `scripts/data-updater.ts --bookmarks --force` if missing
  - Starts scheduler and Next.js server

### Scheduler Cadence (Pacific Time)

- Bookmarks refresh: every 2 hours
- GitHub activity: daily at midnight
- Logos: weekly on Sunday

### Environment-Specific S3 Keys

- Source of truth: `lib/config/environment.ts`. Suffixes: production `""`, test `"-test"`, dev/local `"-dev"` (e.g., `json/bookmarks/slug-mapping-dev.json`).
- Local snapshots are not consumed at runtime; bookmark reads and writes are PostgreSQL-first.

### Redundancy & Fallbacks

- No redundancy or cross-environment fallbacks. `saveSlugMapping` writes only the primary env-specific path.
- `loadSlugMapping` reads only the primary path and returns `null` when missing.

### Manual Ops

```bash
# Force data update
bun scripts/data-updater.ts --bookmarks --force

# Check status
bun scripts/debug-slug-mapping.ts
```
