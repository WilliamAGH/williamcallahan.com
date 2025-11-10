# Bookmarks Architecture

**Functionality:** `bookmarks`

## Core Purpose

The bookmarks system orchestrates fetching, processing, enriching, and serving bookmark data from an external API (Karakeep). It provides a rich, searchable, and performant bookmark collection with advanced features like pagination, tag filtering, and automatic metadata enrichment. **Alongside blog articles, bookmarks is our highest-traffic surface**, so every optimization described here is mandatory, not optional.

## Architecture Overview

### Data Flow

```
Karakeep API → Selective Refresh Jobs → JSON in S3 (bookmarks*.json, pages/, tags/)
                                                   ↓
                                        Next.js Cache Components (pages, RSCs)
                                                   ↓
                                   Clients (lists, detail pages, related content)

API routes → read JSON in S3 → `Cache-Control: no-store`
```

### Key Components

1. **Refresh & Data Access Layer** (`lib/bookmarks/bookmarks-data-access.server.ts`)
   - Manages S3 persistence and retrieval (JSON is the source of truth)
   - Implements distributed locking for refresh operations and selective rewrites
   - Handles request coalescing and deduplication
   - Provides paginated and tag-filtered data access directly from S3 JSON

2. **Service Layer** (`lib/bookmarks/service.server.ts`)
   - Business logic orchestration
   - Coordinates between data access and external APIs
   - Manages refresh cycles and cache invalidation

3. **API Endpoints (always `unstable_noStore`)**
   - `/api/bookmarks` - Paginated bookmark retrieval with tag filtering (responds with `Cache-Control: no-store`)
   - `/api/bookmarks/refresh` - Manual refresh trigger (secret protected)
   - `/api/og-image` - Unified OpenGraph image serving

4. **UI Components (Next.js cache consumers)**
   - Server components for initial data fetching (`"use cache"` + cache tags per page/tag slug)
   - Client components for interactivity and pagination
   - Tag navigation with URL-based routing
   - Share functionality with pre-generated URLs

### Build-Time CDN Sync (2025-11)

- `scripts/fetch-bookmarks-public.ts` now auto-detects the active environment via `API_BASE_URL`/`NEXT_PUBLIC_SITE_URL` using `lib/config/environment.ts`, so Docker builds no longer require a `DEPLOYMENT_ENV` override.
- When CDN variables are missing inside BuildKit, the script falls back to the Spaces origin (`S3_SERVER_URL + S3_BUCKET`) so bookmark snapshots are still hydrated before Next.js prerenders `/bookmarks/**` routes.
- Coolify provides the same env secrets for runtime and build, so this script is the single place that ensures local shells, Docker builds, and production ingest identical JSON payloads before sitemap/tag generation.

## Key Features

### Pagination System

- **URL-based**: `/bookmarks/page/2`, `/bookmarks/page/3`
- **Efficient Loading**: 24 items per page, served from cached JSON + RSC cache
- **Dual Modes**: Manual pagination or infinite scroll
- **SEO Optimized**: Proper canonical, prev/next tags
- **Sitemap Integration**: All pages included automatically

### Tag System

- **URL Routes**: `/bookmarks/tags/[tagSlug]`
- **Slug Handling**: Converts between slug and display formats
- **Special Characters**: Handles &, +, and other characters gracefully
- **S3 Caching**: Pre-computed tag pages for performance (JSON files per tag and page)
- **Fallback Logic**: Filters from all bookmarks if cache miss

### Memory & Cache Management

- **Tag JSON Controls**: `ENABLE_TAG_CACHING` and `MAX_TAGS_TO_CACHE` prevent runaway S3 writes when memory pressure is detected.
- **Health Monitoring**: `/api/health/deep` verifies the first slug from `slug-mapping*.json` resolves via the JSON readers, ensuring no silent corruption.
- **Next.js Cache Tags**: Bookmark lists/tag pages use `cacheTag("bookmarks")` plus slug-specific tags with 15–60 minute lifetimes. Detail routes tag `bookmark-${slug}`. Related content uses its own tags but still reads the same JSON.
- **API Responses**: `/api/bookmarks`, `/api/search/*`, `/api/related-content*` call `unstable_noStore()` and return `Cache-Control: no-store` so they always read the freshest JSON without joining the Cache Components layer.
- **Legacy Map Cache**: Still used for metadata (slug lookups, stats) but never stores full bookmark arrays or buffers.

### Memory Management

- **Tag Caching Controls**:
  - `ENABLE_TAG_CACHING`: Emergency shutoff
  - `MAX_TAGS_TO_CACHE`: Limits to top N tags
- **Memory Pressure Detection**: Defers operations when memory high
- **Buffer Management**: No raw buffers in cache, only metadata
- **Health Monitoring**: 5-second timeout with memory checks

### Performance Optimizations

- **Request Coalescing**: Prevents duplicate API calls
- **Multi-layer Caching**: Memory → S3 → External API
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

### S3 Storage Layout

```
bookmarks-suffix/
├── bookmarks-dev.json       # Full dataset (suffix = env)
├── index-dev.json           # Metadata and counts
├── slug-mapping-dev.json    # Slug lookup helper
├── pages-dev/
│   ├── page-1.json
│   └── page-2.json
└── tags-dev/
    └── [tag-slug]/
        ├── index.json
        └── page-1.json
```

Note: As of this update, all persisted bookmark arrays (bookmarks*.json, pages/page-*.json, tags/[tag]/page-_.json)
embed a required `slug` field per item for idempotent internal routing. The centralized slug-mapping file
(`slug-mapping_.json`) remains the source of truth and is still written for integrity checks and static
param generation, but readers now prefer the embedded `slug` when present.

## Critical Design Decisions

### 1. Title-Based Slug Generation for Content-Sharing Domains (2025-01)

**Problem**: Slug collisions on content-sharing platforms (YouTube, Reddit, etc.) where multiple pieces of content share the same URL structure

**Previous Behavior**:

```text
youtube.com/watch?v=abc123 → "youtube-com-watch"
youtube.com/watch?v=xyz789 → "youtube-com-watch-2" ❌ Collision with numeric suffix
```

**Solution**: Domain whitelist with title-based natural language slugs

**New Behavior**:

```text
youtube.com/watch?v=abc123 + "How to Use OpenAI" → "youtube-how-to-use-openai"
youtube.com/watch?v=xyz789 + "React Best Practices" → "youtube-react-best-practices"
```

**Implementation**:

- **Whitelist**: `lib/config/content-sharing-domains.ts` defines platforms requiring title-based slugs
- **Slug Generation**: `lib/utils/domain-utils.ts` detects content-sharing domains and uses `titleToSlug()` for natural language conversion
- **Backward Compatibility**: Regular domains continue using domain + path-based slugs

**Affected Domains**:

- Video: YouTube, Vimeo, Twitch
- Social: Reddit, Twitter/X, LinkedIn
- Content: Medium, Substack, Dev.to
- Code: GitHub, GitLab, StackOverflow
- And others (see full list in `content-sharing-domains.ts`)

### 2. Callback Pattern for Circular Dependencies

**Problem**: Circular dependency between business logic and data access layers

**Solution**: Data access layer accepts refresh callback via `setRefreshBookmarksCallback`

### 2. Atomic S3 Locking

**Problem**: Race conditions with concurrent refresh operations

**Solution**: Conditional writes using `IfNoneMatch: "*"` for atomic lock acquisition.

- Default TTL is **30 minutes** to cover the worst-case OpenGraph enrichment window. The previous 5-minute TTL
  allowed long-running refreshes to appear stale, which meant other processes could start overlapping refreshes.
- Periodic stale-lock cleanup now skips while the current process owns the distributed lock, avoiding self-deletion
  during active refresh cycles.

### 3. Tag Caching Memory Protection

**Problem**: Exponential S3 writes causing memory exhaustion

**Solution**:

- Configurable limits on tag caching
- Memory headroom checks before operations
- Non-blocking refresh with immediate response

### 4. Client-Server Data Consistency

**Problem**: Client filtering conflicting with server-filtered data

**Solution**:

- Server provides pre-filtered data for tag pages
- Client skips redundant filtering on tag routes
- Pagination hook respects server-provided initial data

### 5. Slug Uniqueness Guarantees (2025-01)

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

- Empty titles on content-sharing domains → Fall back to domain + path
- Identical titles on same platform → Numeric suffix applied
- Very long titles → Truncated at 60 characters at word boundary
- Special characters in titles → Sanitized to URL-safe format

## Security Considerations

1. **XSS Protection**: React's default escaping for OpenGraph data
2. **Asset Proxying**: Bearer token authentication for Karakeep assets
3. **Rate Limiting**: API endpoints protected against abuse
4. **Input Validation**: Tag slugs sanitized and validated

## Monitoring & Operations

### Health Checks

- `/api/health` endpoint with memory pressure detection
- Automatic container restart on memory critical
- Distributed lock cleanup every 2 minutes

### Observability

- Detailed logging for all operations
- Performance metrics for cache hits/misses
- Error tracking for external API failures

### Manual Operations

```bash
# Force refresh bookmarks
curl -X POST http://localhost:3000/api/bookmarks/refresh

# Check system health
curl http://localhost:3000/api/health

# View bookmark status
curl http://localhost:3000/api/bookmarks/status
```

## Future Improvements

1. **Search Enhancement**: Full-text search with Elasticsearch
2. **User Personalization**: Per-user bookmark collections
3. **Batch Operations**: Bulk bookmark management
4. **Real-time Updates**: WebSocket for live bookmark changes
5. **Analytics**: Usage tracking and popular bookmarks

## Related Documentation

- See `bookmarks.mmd` for visual architecture diagram
- See `memory-mgmt.md` for memory management details
- See `s3-object-storage.md` for storage patterns
- See `opengraph.md` for metadata enrichment

## Deployment & Automatic Data Population (Integrated)

This consolidates deployment details for bookmarks data population and scheduler behavior.

### Automatic Population on Container Startup

- `scripts/entrypoint.sh` ensures slug mappings exist at boot:
  - Runs `scripts/data-updater.ts --bookmarks --force` if missing
  - Falls back to `scripts/ensure-slug-mappings.ts` on failure
  - Starts scheduler and Next.js server

### Scheduler Cadence (Pacific Time)

- Bookmarks refresh: every 2 hours
- GitHub activity: daily at midnight
- Logos: weekly on Sunday

### Environment-Specific S3 Keys

- Source of truth: `lib/config/environment.ts`
- Suffixes:
  - production: "" (no suffix)
  - test: "-test"
  - development/local: "-dev"
- Examples:
  - dev: `json/bookmarks/slug-mapping-dev.json`
  - prod: `json/bookmarks/slug-mapping.json`
- Docker builds hydrate `lib/data/s3-cache/` snapshots from these paths via `scripts/fetch-bookmarks-public.ts` (supports BuildKit secrets for private buckets).

### Redundancy & Fallbacks

- Save to all paths when needed for resilience:
  ```ts
  await saveSlugMapping(bookmarks, true, true);
  ```
- Load fallback order:
  1. Primary (env-specific)
  2. All environment variants
  3. Local BuildKit snapshot in `lib/data/s3-cache/` (written during Docker builds)
  4. Regenerate dynamically

### Manual Ops

```bash
# Force data update
bun scripts/data-updater.ts --bookmarks --force

# Check status
bun scripts/debug-slug-mapping.ts

# Fix suffix layout
bun scripts/fix-s3-env-suffix.ts
```
