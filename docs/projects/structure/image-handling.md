# Image Handling Architecture

**Functionality:** `image-handling`

## Core Objective

Robust centralized system for fetching, processing, and serving images with memory-safe operations. Primary focus on company logos and OpenGraph images with automatic theme adaptation.

## Architecture Diagram

See `image-handling.mmd` for visual pipeline diagram.

## S3/CDN Architecture (2025-06)

### Core Components

1. **UnifiedImageService** (`/lib/services/unified-image-service.ts`)  
   - Single entry point for all image operations
   - Direct S3 persistence without memory caching
   - Streaming support for images >5MB to S3
   - Automatic CDN URL generation
   - Format detection and optimization
   - Domain session management for circuit breaking

2. **Shared Image Processing** (`/lib/image-handling/shared-image-processing.ts`)
   - Consistent image format detection
   - SVG, GIF, WebP animation preservation
   - Automatic PNG conversion for static images
   - Magic number fallback detection

3. **S3/CDN Delivery**
   - All images stored in S3 bucket
   - CloudFront CDN for global distribution
   - Direct CDN URLs in all responses
   - No local caching or buffer storage

### Environment Configuration

```bash
NEXT_PUBLIC_S3_CDN_URL=https://s3-storage.callahan.cloud  # CDN base URL
S3_BUCKET=your-bucket-name                                # S3 bucket
IMAGE_STREAM_THRESHOLD_BYTES=5242880                      # 5MB streaming threshold
```

## Key API Routes

### Logo Management

- **`/api/logo`**: Primary logo endpoint
  - Always returns 301 redirect to CDN URL
  - Query params: `website`, `company`, `forceRefresh`
  - No buffer serving - all images from CDN

- **`/api/logo/invert`**: Theme-aware logo inversion
  - GET: Returns 301 redirect to inverted logo CDN URL
  - HEAD: Checks if inversion needed
  - Inverted images stored separately in S3

### Image Operations

- **`/api/cache/images`**: Generic image optimization
  - ✅ Uses UnifiedImageService for memory safety
  - 🔴 **CRITICAL**: Open proxy vulnerability - needs allowlist
  - Format conversion support (webp, avif, png, jpg)
  - Automatic S3 persistence

- **`/api/og-image`**: Universal OpenGraph endpoint
  - Single source of truth for ALL OpenGraph images
  - Multi-input support: S3 keys, asset IDs, external URLs
  - Response streaming with background S3 persistence
  - Contextual fallbacks (person/og-card/company)
  - Preserves animated formats (GIF, WebP)

## Data Flow

```
Request → UnifiedImageService → Check S3 → EXISTS? Return CDN URL
                ↓                    ↓ MISS
                ↓               External Fetch → Validate
                ↓                    ↓
                ↓               Process Image
                ↓                    ↓
                ↓               >5MB? → Stream to S3
                ↓                    ↓ No
                ↓               Upload to S3
                ↓                    ↓
                └──────────────→ Return CDN URL
```

## S3 Storage Structure

```
images/
├── logos/                          # Company logos (descriptive naming)
│   ├── {company}_{hash}_{source}.png  # e.g., morningstar_83a33aed_clearbit.png
│   └── inverted/{company}_{hash}_{source}.png  # Inverted logos
├── logo/                           # Legacy path (hash-based naming) 
│   ├── {domain-hash}.png           # Old format
│   └── public-migration/           # Migrated from /public/logos
├── opengraph/
│   └── images/{content-hash}.{ext} # OpenGraph images
└── assets/
    └── {asset-id}.{ext}           # General assets
```

## Domain Session Management

### Purpose & Implementation

UnifiedImageService includes **domain session management** to prevent infinite loops and resource exhaustion when fetching external images/logos. This implements a circuit breaker pattern specifically for external domain failures.

### Key Features

1. **Session-Based Tracking**
   - 30-minute session duration
   - Tracks processed and failed domains
   - Per-domain retry counting (max 3 retries)
   - Automatic session reset after expiry

2. **Circuit Breaker Pattern**
   - Prevents infinite redirect loops (Site A → Site B → Site A)
   - Blocks domains after 3 failures within session
   - Temporary blacklisting (not permanent)
   - Allows recovery after transient failures

3. **Use Cases**
   - **Logo Fetching**: Education, experience, certifications, bookmarks
   - **OpenGraph Images**: Blog posts, external links
   - **Investment Logos**: Company logos from various sources
   - **Batch Processing**: Bookmark refresh operations

### Implementation Details

```typescript
// Domain session tracking in UnifiedImageService
private sessionProcessedDomains = new Set<string>();
private sessionFailedDomains = new Set<string>();
private domainRetryCount = new Map<string, number>();
private readonly SESSION_MAX_DURATION = 30 * 60 * 1000; // 30 minutes
private readonly MAX_RETRIES_PER_SESSION = 3;

// Check before fetching from domain
if (unifiedImageService.hasDomainFailedTooManyTimes(domain)) {
  return fallbackImage; // Skip problematic domain
}

// Mark domain as failed after error
unifiedImageService.markDomainAsFailed(domain);
```

### Benefits

- **Prevents Resource Exhaustion**: No repeated attempts on failing domains
- **Protects Batch Operations**: Bookmark refresh won't hang on bad domains
- **Memory Safety**: Prevents accumulating failed fetch attempts
- **Rate Limit Protection**: Avoids getting blocked by external services
- **Performance**: Batch operations complete in minutes instead of hours

## Critical Security Issues

### 🔴 REQUIRES IMMEDIATE FIX

1. **Server-Side Request Forgery (SSRF)**
   - `/api/cache/images`: Open proxy accepting any URL
   - `/api/logo/invert`: Allows internal API access
   - **Fix**: Implement domain allowlist, block private IPs

2. **Path Traversal**
   - `/api/twitter-image/[...path]`: Regex allows `.` character
   - `/api/assets/[assetId]`: Unsanitized parameter
   - **Fix**: Explicit `..` blocking, path normalization

### ✅ FIXED (2025-06)

- Memory leaks from Buffer.slice()
- Duplicate concurrent fetches
- Memory pressure handling
- Size limits (50MB per image)
- Animated format preservation
- NextResponse.redirect errors

## Key Files

### Core Services

- `lib/image-memory-manager.ts` - Deprecated buffer cache (no actual caching)
- `lib/services/unified-image-service.ts` - Image operations
- `lib/services/image-streaming.ts` - Large image streaming
- `lib/health/memory-health-monitor.ts` - Memory monitoring

### Data Access

- `lib/data-access/logos.ts` - Logo lifecycle management
- `lib/data-access/opengraph.ts` - OpenGraph parsing
- `lib/image-handling/image-s3-utils.ts` - S3 operations
- `lib/image-handling/shared-image-processing.ts` - Image processing

### Analysis & Validation

- `lib/imageAnalysis.ts` - Theme suitability analysis
- `lib/imageCompare.ts` - Perceptual hash validation

### Types

- `types/image.ts` - Unified image interfaces
- `types/logo.ts` - Logo-specific types
- `types/cache.ts` - Cache entry types

## Performance Metrics

- S3 existence check: ~50ms
- CDN delivery: ~10-50ms (global)
- External fetch: 100ms-5s
- Streaming threshold: 5MB
- No memory budget (direct S3)
- Max image size: 50MB

## Health Monitoring

- `/api/health` - Overall system health
- `/api/health/metrics` - Detailed memory metrics
- 503 responses when memory critical
- X-System-Status headers for observability
