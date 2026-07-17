# OpenGraph Architecture

**Functionality:** `opengraph`

## Core Objective

To provide resilient OpenGraph metadata extraction and image processing for any URL, with comprehensive fallback mechanisms and intelligent caching. The system handles diverse website structures, large HTML pages, and varied image metadata standards. The `/api/og-image` route resolves persisted, Karakeep, and external image inputs through HTTP redirects.

## Architecture Overview

The OpenGraph system operates with a multi-layered approach:

```
Request -> Next.js cache -> PostgreSQL override/metadata -> External fetch + process
                                                                   |
                           optional S3 image persistence (background at runtime)
                                                                   |
                     best-effort PostgreSQL metadata upsert -> Return fetched metadata
```

Runtime image writes are scheduled in the background; batch-mode image writes are awaited. The metadata upsert is awaited, but a failure is logged and the freshly fetched metadata is still returned.

## Key Components

### Data Access Layer

- **`lib/data-access/opengraph.ts`**: Core orchestration and caching logic (~280 LoC)
  - Multi-tier caching strategy (Next.js cache -> PostgreSQL -> external fetch)
  - Request coalescing to prevent duplicate fetches
  - Background refresh with stale-while-revalidate
  - Delegates to specialized modules for specific tasks
  - Cache validation preserves optional metadata fields (title/description/siteName) while still enforcing schema correctness
- **`lib/data-access/opengraph-next-cache.ts`**: Next.js cache path with `use cache`
  - Handles PostgreSQL override and metadata reads, validation, and circuit breaker checks
  - Delegates refresh to `opengraph-refresh.ts` when external fetch is needed
- **`lib/data-access/opengraph-refresh.ts`**: Refresh workflow with in-flight dedupe
  - External fetch, image persistence, best-effort metadata upsert, and fallback handling
- **`lib/data-access/opengraph-cache-context.ts`**: Cache guard wrappers
  - Safe wrappers for cache tags/lifetimes; guards forward during build, skip only in CLI scripts

### OpenGraph Modules

- **`lib/opengraph/parser.ts`**: HTML parsing logic (~268 LoC)
  - Extracts OpenGraph tags from HTML
  - Platform-specific extraction (GitHub, Twitter, LinkedIn, Bluesky)
  - Smart partial parsing for large HTML pages
  - Uses Cheerio for DOM manipulation

- **`lib/opengraph/fallback.ts`**: Unified fallback handling (~215 LoC)
  - Single source of truth for all fallback logic
  - Karakeep integration for bookmark fallbacks
  - Domain-specific fallback images
  - Contextual fallback selection

- **`lib/opengraph/fetch.ts`**: External fetch logic (~193 LoC)
  - HTTP fetching with retry logic
  - Image selection from extracted metadata
  - Background persistence via shared persistence modules
  - Circuit breaker integration
  - Rate limiting support
  - Timeout handling

- **`lib/opengraph/validation.ts`**: OpenGraph validation helpers
  - Metadata and image URL validation
  - Shared guard logic used across fetch/refresh flows

### Utilities

- **`lib/utils/opengraph-utils.ts`**: Helper functions
  - URL validation and normalization
  - Image URL validation
  - Relative URL resolution
  - Content hashing for cache keys
  - Domain type detection

### Type Definitions

- **`types/opengraph.ts`**: OpenGraph type definitions
  - `OgResult`: Core OpenGraph metadata result
  - `OpenGraphImage`: Image metadata structure
  - `KarakeepImageFallback`: Karakeep-specific fallback data
  - Various platform-specific metadata types

- **`types/image.ts`**: Unified image types used by OpenGraph
  - `ImageSource`: Source enumeration (s3, origin, fallback, etc.)
  - `BaseImageData`: Base interface for all image data
  - `ImageResult`: Result from image service operations

### Image Processing

- **`lib/image-handling/image-s3-utils.ts`**: Image persistence
  - Downloads and validates images
  - Stores in S3 with deterministic keys
  - Serves images from S3 storage

### API Route

- **`app/api/og-image/route.ts`**: Redirect-only image resolver
  - Accepts recognized S3 keys, Karakeep asset UUIDs, direct public image URLs, and optional bookmark context
  - Redirects known assets to the CDN or `/api/assets/[assetId]`
  - Reads bookmark data to prioritize Karakeep imagery and construct fallbacks
  - Validates direct image URLs, requires an `image/*` response within 10 seconds, schedules S3 persistence, and redirects to the original URL
  - Does not call the OpenGraph metadata data-access layer, parse page HTML, stream image bytes, or clone responses

## Unified OG Image Endpoint

### Request Parameters

- `url`: Required S3 key, asset UUID, local image path, or direct public image URL
- `assetId`: Optional Karakeep asset ID that redirects to `/api/assets/[assetId]`
- `bookmarkId`: Optional bookmark lookup used to prioritize Karakeep assets and fallbacks

### Resolution Order

1. Redirect relative asset paths and asset UUIDs to `/api/assets/[assetId]`
2. Check recognized S3 keys and redirect existing objects to the CDN
3. Use an explicit `assetId` or the bookmark's `imageAssetId`
4. Resolve first-party static image paths against the validated server base URL, then redirect the absolute URL or an existing derived S3 object
5. Try validated Karakeep `imageUrl` and `screenshotAssetId` fallbacks
6. Validate and fetch the supplied direct image URL
7. Schedule background S3 persistence and redirect to the supplied URL
8. On failure, try remaining Karakeep assets, then a contextual fallback

### Response and Security

- Responses are HTTP 302 redirects; this route does not stream image bodies
- Public HTTP(S) URLs are accepted without a domain allowlist
- Private/internal hosts, credentials, unsafe protocols, and unapproved ports are rejected
- External responses must use an `image/*` content type and complete within 10 seconds
- S3 checks use direct `HeadObject` calls; there is no route-local five-minute existence cache

## Module Dependencies

```
app/api/og-image/route.ts
  |
lib/data-access/opengraph.ts (orchestrator)
  ├── lib/data-access/opengraph-next-cache.ts
  ├── lib/data-access/opengraph-refresh.ts
  ├── lib/opengraph/fetch.ts -> lib/opengraph/parser.ts + lib/opengraph/validation.ts
  ├── lib/opengraph/fallback.ts
  └── lib/persistence/image-persistence.ts
```

## Data Flow

### 1. Request Phase

```typescript
getOpenGraphData(url, skipExternalFetch?, idempotencyKey?, fallbackImageData?)
  |
Validate URL -> Normalize -> Generate hash
```

### 2. Cache Check Phase

```typescript
Next.js Cache Components Check (tagged server data access)
  | (miss)
PostgreSQL Override Check -> PostgreSQL Metadata Check (by URL hash)
  | (miss)
External Fetch Required
```

### 3. External Fetch Phase

```typescript
Check Circuit Breaker -> Rate Limit -> Fetch HTML
  |
Smart HTML Parsing:
  - If >5MB: Extract <head> or first 512KB
  - Otherwise: Parse full HTML
  |
Extract All Image Types -> Select Best by Priority
  |
Resolve Relative URLs -> Validate Images
```

### 4. Storage Phase

```typescript
Runtime: schedule eligible image writes to S3
Batch mode: await eligible image writes and use their CDN URLs
Then: attempt PostgreSQL metadata upsert -> return fetched metadata
```

### 5. Background Operations

- Image persistence runs asynchronously
- Stale data returned while refreshing
- Failed domains tracked with circuit breaker

## Image Selection Algorithm

`lib/opengraph/parser.ts` owns extracted metadata fields, and `lib/opengraph/fetch.ts` selects validated content/profile images before applying fallback data. Documentation does not restate that field priority.

## Platform-Specific Extraction

### GitHub

- Profile images from `.avatar-user`, `.avatar` classes
- Fallback to `og:image` if avatar not found

### Twitter/X

- Profile: `img[src*="profile_images"]`
- Banner: `a[href$="/header_photo"] img`
- Handles obfuscated class names

### LinkedIn

- Profile: `.pv-top-card-profile-picture__image`
- Banner: Background image from `.profile-top-card__banner`

### Bluesky

- Profile: `img[src*="cdn.bsky.app/img/avatar"]`
- Fallback to standard meta tags

## Caching Strategy

### Next.js Cache Components

- **Success Profile**: cache life/tag profiles on server data functions
- **Invalidation**: `revalidateTag(...)` from refresh/update flows
- **Implementation**: framework cache (no custom in-process cache map)

### Persistent Storage

- **Metadata and overrides**: PostgreSQL rows keyed by normalized URL hash
- **Images and cached Jina HTML**: S3 objects with deterministic keys

### Circuit Breaker

- **Failure Threshold**: 5 tracked failures
- **Open-State Reset Timeout**: 30 minutes
- **Scope**: In-memory, per-domain tracking

## Error Handling

### Graceful Degradation Chain

1. Try Next.js cache-backed server reads (tagged cache path)
2. Try PostgreSQL override and metadata rows
3. Try external fetch with retries
4. Use Karakeep fallback data
5. Use platform-specific fallbacks
6. Return generic fallback

### Retry Logic

- **Max Retries**: 3
- **Backoff**: Exponential with jitter
- **Non-retryable**: 4xx errors, "unsafe" content

## Performance Characteristics

- **Cache Hit**: low-latency from Next.js cache-backed server reads
- **Persistent Metadata Hit**: PostgreSQL-backed cached read
- **External Fetch**: 500ms-5s (depends on site)
- **Cold Start**: Up to 10s for slow sites

## Security Considerations

1. **URL Validation**: Blocks unsafe protocols, private IPs
2. **HTML Size Limits**: Prevents DoS via huge pages
3. **Content Sanitization**: HTML entities decoded safely
4. **Rate Limiting**: Prevents abuse of external fetches

## Integration Points

### Bookmarks System

- Enriches bookmarks with OpenGraph metadata
- Falls back to Karakeep data when OG fails
- Batch processing with concurrency limits

### API Routes

- `/api/og-image`: Public OpenGraph image redirect resolver
- Used by external services needing OG images

### Asset Management

- Images persisted to S3 for long-term storage
- Served via CDN for performance

## Best Practices

1. **Always provide idempotencyKey** for consistent S3 keys
2. **Use skipExternalFetch** during build time
3. **Provide fallbackImageData** when available
4. **Monitor circuit breaker logs** for failing domains
5. **Check debug logs** for extraction issues

## Dynamic OG Image Generation

The `/api/og/[entity]` route generates branded 1200×630 OG images for all entity types using Satori.

### Architecture

```
Page generateMetadata() -> buildOgImageUrl(entity, params)
                                |
                         /api/og/[entity]?title=...&coverUrl=...
                                |
                    Validate entity (Zod) -> Parse params -> Fetch image -> Render layout
                                                                              |
                                                                     ImageResponse (PNG)
```

### Modules

- **`lib/og-image/security.ts`**: SSRF protection (host blocking, protocol restriction)
- **`lib/og-image/fetch-image.ts`**: Image fetch with size/pixel/timeout limits, sharp PNG conversion
- **`lib/og-image/design-tokens.ts`**: Shared colors, typography, and layout dimensions
- **`lib/og-image/build-og-url.ts`**: Type-safe URL builder for page metadata
- **`lib/og-image/layouts/`**: Per-entity JSX renderers (book, bookmark, blog, project, text)
- **`types/schemas/og-image.ts`**: Zod schemas for entity types and per-entity params

### Supported Entities

| Entity       | Layout                    | Image Source  | Use Case              |
| ------------ | ------------------------- | ------------- | --------------------- |
| `books`      | Cover + title/author      | coverUrl      | Book detail pages     |
| `bookmarks`  | Screenshot + title/domain | screenshotUrl | Bookmark detail pages |
| `blog`       | Cover + title/author/tags | coverUrl      | Blog post pages       |
| `projects`   | Screenshot + title/tags   | screenshotUrl | Project detail pages  |
| `thoughts`   | Centered title/subtitle   | None          | Thought detail pages  |
| `collection` | Centered title/section    | None          | Tag/collection pages  |

## Debugging

Enable debug logging:

```bash
DEBUG=* npm run dev
```

Key log patterns:

- `[DataAccess/OpenGraph] Selected {type} as best image`
- `[DataAccess/OpenGraph] HTML content...{size}MB. Attempting partial parse`
- `[DataAccess/OpenGraph] Domain {domain} has failed too many times`
- `[OG-Image] Failed to fetch image: {status}` (dynamic generation)
- `[OG-Image] Image exceeds size limit` (dynamic generation)
