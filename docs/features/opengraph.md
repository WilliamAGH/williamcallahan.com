# OpenGraph Architecture

**Functionality:** `opengraph`

## Core Objective

To provide resilient OpenGraph metadata extraction and image processing for any URL, with comprehensive fallback mechanisms and intelligent caching. The system handles diverse website structures, large HTML pages, and various image metadata standards to ensure maximum data extraction success. Includes a unified `/api/og-image` route that serves as the single source of truth for ALL OpenGraph images across the application.

## Architecture Overview

The OpenGraph system operates with a multi-layered approach:

```
Request -> Cache Check -> S3 Check -> External Fetch -> Process -> Store -> Return
           |              |              |
         Memory         Persistent    HTML Fetch
         (Fast)         (Durable)     (Slow)
```

## Key Components

### Data Access Layer

- **`lib/data-access/opengraph.ts`**: Core orchestration and caching logic (~280 LoC)
  - Multi-tier caching strategy (Memory -> S3 -> External)
  - Request coalescing to prevent duplicate fetches
  - Background refresh with stale-while-revalidate
  - Delegates to specialized modules for specific tasks
  - Cache validation preserves optional metadata fields (title/description/siteName) while still enforcing schema correctness
- **`lib/data-access/opengraph-next-cache.ts`**: Next.js cache path with `use cache`
  - Handles S3 override, validation, circuit breaker, and S3 metadata reads
  - Delegates refresh to `opengraph-refresh.ts` when external fetch is needed
- **`lib/data-access/opengraph-refresh.ts`**: Refresh workflow with in-flight dedupe
  - External fetch, S3 persistence, and fallback handling
- **`lib/data-access/opengraph-cache-context.ts`**: Cache guard wrappers
  - Safe wrappers for cache tags/lifetimes and CLI context detection

### OpenGraph Modules

- **`lib/opengraph/constants.ts`**: Centralized configuration (~65 LoC)
  - All OPENGRAPH\_\* constants
  - S3 directory structure
  - Fetch configuration and timeouts
  - Circuit breaker settings

- **`lib/opengraph/parser.ts`**: HTML parsing logic (~268 LoC)
  - Extracts OpenGraph tags from HTML
  - Platform-specific extraction (GitHub, Twitter, LinkedIn, Bluesky)
  - Smart partial parsing for large HTML pages
  - Uses Cheerio for DOM manipulation

- **`lib/opengraph/imageSelector.ts`**: Image selection algorithm (~85 LoC)
  - Priority-based image selection
  - Handles relative URL resolution
  - Validates image URLs

- **`lib/opengraph/fallback.ts`**: Unified fallback handling (~215 LoC)
  - Single source of truth for all fallback logic
  - Karakeep integration for bookmark fallbacks
  - Domain-specific fallback images
  - Contextual fallback selection

- **`lib/opengraph/persistence.ts`**: Background persistence (~42 LoC)
  - Fire-and-forget image persistence to S3
  - Non-blocking background operations

- **`lib/opengraph/fetch.ts`**: External fetch logic (~193 LoC)
  - HTTP fetching with retry logic
  - Circuit breaker integration
  - Rate limiting support
  - Timeout handling

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
  - `ImageSource`: Source enumeration (memory, s3, origin, etc.)
  - `BaseImageData`: Base interface for all image data
  - `ImageResult`: Result from image service operations

### Image Processing

- **`lib/image-handling/image-s3-utils.ts`**: Image persistence
  - Downloads and validates images
  - Stores in S3 with deterministic keys
  - Serves images from S3 storage

### API Routes

- **`app/api/og-image/route.ts`**: Universal OpenGraph image endpoint
  - Single source of truth for ALL OpenGraph images
  - Multi-input support: S3 keys, Karakeep asset IDs, external URLs
  - Hierarchy: Memory cache -> S3 storage -> External fetch -> Karakeep fallback
  - Security: SSRF protection, domain allowlisting, size limits
  - Response streaming with background S3 persistence
  - Contextual fallback images (company, person, OpenGraph card)
  - Preserves animated formats (GIF, WebP)

## Unified OG Image Endpoint

The `/api/og-image` route serves as the single source of truth for all OpenGraph images:

### Input Types

1. **S3 Keys**: `opengraph/images/example.png` -> Redirect to CDN
2. **Karakeep Asset IDs**: `abc-123-def` -> Proxy to `/api/assets/[id]`
3. **External URLs**: `https://github.com` -> Fetch, stream, and persist

### Request Parameters

- `url`: Primary input (S3 key, asset ID, or URL)
- `assetId`: Optional Karakeep asset ID for better context
- `bookmarkId`: Optional bookmark ID for domain fallbacks

### Security Features

- **SSRF Protection**: Blocks private IPs and internal networks
- **Domain Allowlisting**: Production restricts to known safe domains
- **Size Limits**: 10MB max to prevent DoS
- **Content Validation**: Ensures response is actually an image
- **Timeout Protection**: 10s timeout on external fetches

### Fallback Hierarchy

1. Check S3 existence (for S3 keys)
2. Try Karakeep asset (for asset IDs)
3. Fetch from OpenGraph data layer (memory -> S3 -> external)
4. Direct image fetch if URL points to image
5. Domain-specific fallbacks (GitHub, Twitter, etc.)
6. Contextual fallbacks (person, OpenGraph card, company)

### Performance Optimizations

- **Response Streaming**: Streams images while persisting to S3
- **Response Cloning**: Enables background S3 upload without blocking
- **S3 Existence Cache**: 5-minute TTL for S3 HEAD checks
- **Clean Error Logging**: Expected errors logged without stack traces

## Module Dependencies

```
app/api/og-image/route.ts
  |
lib/data-access/opengraph.ts (orchestrator)
  ├── lib/data-access/opengraph-next-cache.ts
  ├── lib/data-access/opengraph-refresh.ts
  ├── lib/opengraph/fetch.ts -> lib/opengraph/parser.ts -> lib/opengraph/imageSelector.ts
  ├── lib/opengraph/fallback.ts
  └── lib/opengraph/persistence.ts
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
Memory Cache Check (ServerCacheInstance)
  | (miss)
S3 Metadata Check (opengraph/metadata/{urlHash}.json)
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
Store Metadata in S3 -> Persist Images to S3 -> Update Memory Cache
```

### 5. Background Operations

- Image persistence runs asynchronously
- Stale data returned while refreshing
- Failed domains tracked with circuit breaker

## Image Selection Algorithm

```typescript
function selectBestOpenGraphImage(metadata, pageUrl) {
  const priority = [
    "profileImage", // GitHub/Twitter/LinkedIn avatars
    "image", // Standard og:image
    "imageSecure", // og:image:secure_url
    "imageUrl", // og:image:url
    "twitterImage", // Twitter cards
    "schemaImage", // Schema.org
    "msapplicationImage", // Windows tiles
    "appleTouchIcon", // iOS icons
    "icon", // Favicons
  ];

  for (const type of priority) {
    if (metadata[type] && isValid(metadata[type])) {
      return resolveUrl(metadata[type], pageUrl);
    }
  }
  return null;
}
```

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

### Memory Cache (ServerCacheInstance)

- **Success TTL**: 24 hours
- **Failure TTL**: 1 hour
- **Implementation**: In-memory Map with TTL tracking

### S3 Persistent Storage

- **Metadata**: `opengraph/metadata/{urlHash}.json`
- **Images**: `images/opengraph/{idempotencyKey}.{ext}`
- **Durability**: Survives server restarts

### Circuit Breaker

- **Failure Threshold**: 3 consecutive failures
- **Cooldown**: 1 hour
- **Per-domain tracking**: Prevents hammering failing sites

## Error Handling

### Graceful Degradation Chain

1. Try memory cache (even if stale)
2. Try S3 storage
3. Try external fetch with retries
4. Use Karakeep fallback data
5. Use platform-specific fallbacks
6. Return generic fallback

### Retry Logic

- **Max Retries**: 3
- **Backoff**: Exponential with jitter
- **Non-retryable**: 4xx errors, "unsafe" content

## Performance Characteristics

- **Cache Hit**: 1-5ms (memory)
- **S3 Hit**: 50-200ms
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

- `/api/og-image`: Public OpenGraph image proxy
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

## Debugging

Enable debug logging:

```bash
DEBUG=* npm run dev
```

Key log patterns:

- `[DataAccess/OpenGraph] Selected {type} as best image`
- `[DataAccess/OpenGraph] HTML content...{size}MB. Attempting partial parse`
- `[DataAccess/OpenGraph] Domain {domain} has failed too many times`
