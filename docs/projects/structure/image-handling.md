# Image Handling Architecture

**Functionality:** `image-handling`

## Core Objective

Robust centralized system for fetching, processing, and serving images with memory-safe operations. Primary focus on company logos and OpenGraph images with automatic theme adaptation.

**Last Updated**: 2025-07-03 - Major security hardening (SSRF/path traversal prevention), URL validation with Zod schemas, performance optimizations (parallel operations), type consolidation (BaseMediaResult), and comprehensive test coverage.

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
# Server-side only (Priority for server code)
S3_CDN_URL=https://direct-cdn.domain.com                  # Direct CDN URL without custom SSL
S3_BUCKET=your-bucket-name                                # S3 bucket
IMAGE_STREAM_THRESHOLD_BYTES=5242880                      # 5MB streaming threshold

# Client-side (exposed to browser)
NEXT_PUBLIC_S3_CDN_URL=https://s3-storage.callahan.cloud  # CDN with custom SSL certificate
```

**Important**: Server-side code should use `S3_CDN_URL` (direct CDN) with fallback to `NEXT_PUBLIC_S3_CDN_URL`. This reduces client bundle size and provides flexibility for different CDN endpoints.

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

## 🐛 Bugs & Improvements Inventory

### Security Issues (CRITICAL - IMMEDIATE ACTION REQUIRED)

1. **SSRF Vulnerability** - Multiple endpoints:
   - `/api/cache/images`: Open proxy accepting any URL
   - `/api/og-image/route.ts:282-293`: No URL validation before fetch
   - `/api/logo/invert`: Allows internal API access
   - `lib/services/unified-image-service.ts:842-946`: No private IP blocking
   - **Fix**: Implement URL allowlist, block private IP ranges (127._, 10._, 172.16-31._, 192.168._)
   - **✅ FIXED (2025-07)**: Comprehensive URL validation implemented:
     - Created `lib/utils/url-utils.ts` with `validateExternalUrl()` function
     - Blocks all private IP ranges (IPv4 and IPv6)
     - Enforces HTTP/HTTPS protocols only
     - Domain allowlisting for sensitive endpoints
     - Zod schemas validate all URL inputs

2. **Path Traversal** - Multiple locations:
   - `/api/twitter-image/[...path]/route.ts`: Regex allows `.` character
   - `/api/assets/[assetId]/route.ts`: Unsanitized parameter
   - `lib/utils/s3-key-generator.ts:62`: User input in paths
   - **Fix**: Path normalization, explicit `..` blocking, validate against whitelist
   - **✅ FIXED (2025-07)**: All paths now sanitized:
     - Asset IDs validated with alphanumeric + hyphen pattern
     - Path traversal sequences blocked (`..`, `.\`)
     - S3 keys use sanitized inputs only

### Type/Validation Issues (HIGH PRIORITY)

3. **Missing Zod Validation** - External API responses:
   - `lib/services/unified-image-service.ts:842-946`: Google/DuckDuckGo/Clearbit responses
   - `lib/data-access/opengraph.ts`: OpenGraph metadata parsing
   - **Fix**: Create Zod schemas for all external data
   - **✅ FIXED (2025-07)**: Comprehensive Zod validation added:
     - Created `types/schemas/` directory for all validation schemas
     - External API responses now validated before use
     - URL validation includes security checks
     - Type-safe parsing with error handling

4. **Type Duplication** - `types/image.ts` & `types/logo.ts`:
   - ImageResult vs LogoResult (80%+ similar)
   - ImageSource vs LogoSource (separate but overlapping)
   - **Fix**: Create shared base interfaces with extends
   - **⚠️ PARTIAL FIX (2025-07)**: Created `BaseMediaResult` interface in `types/image.ts` for shared properties. Full consolidation still pending.

### Environment Issues (HIGH PRIORITY)

5. **NEXT*PUBLIC* Misuse** - Server-side code using client prefix:
   - `lib/services/unified-image-service.ts:48,104,148`
   - `lib/persistence/s3-persistence.ts:294,296,349,362`
   - `lib/s3-utils.ts:39`
   - **Fix**: Use `S3_CDN_URL` for server-side code
   - **✅ FIXED (2025-07)**: All server-side code now uses `S3_CDN_URL` with fallback:
     ```typescript
     const cdnUrl = process.env.S3_CDN_URL || process.env.NEXT_PUBLIC_S3_CDN_URL;
     ```

### Performance Issues (MEDIUM PRIORITY)

6. **Sequential Operations** - `lib/services/unified-image-service.ts:932-943`:
   - Logo sources checked serially (30+ seconds worst case)
   - **Fix**: Use Promise.all for parallel source checking
   - **✅ FIXED (2025-07)**: Implemented parallel fetching:
     - All logo sources now checked concurrently with Promise.allSettled()
     - Reduced worst-case time from 30s to ~6s
     - Batch S3 existence checks for multiple logos

7. **Memory Leaks** - Unbounded collections:
   - `lib/services/unified-image-service.ts:51`: migrationLocks Map
   - `lib/services/unified-image-service.ts:55-56`: session Sets
   - `lib/services/unified-image-service.ts:62`: inFlightLogoRequests Map
   - **Fix**: Implement LRU eviction or periodic cleanup

8. **Full Directory Scans** - `lib/image-handling/image-s3-utils.ts:findImageInS3`:
   - Lists entire S3 directories (O(n) complexity)
   - **Fix**: Use deterministic keys and HEAD requests
   - **✅ FIXED (2025-07)**: Optimized S3 operations:
     - Direct HEAD requests with deterministic keys
     - Batch existence checking for multiple objects
     - No more directory listing operations

### British English (IMMEDIATE FIX)

9. **Spelling Corrections**:
   - `lib/services/memory-aware-scheduler.ts:315-316,323`: "cancelled" → "canceled"
   - `types/lib.ts:57`: "cancelled" → "canceled"
   - **✅ FIXED (2025-07)**: All British spellings converted to American English.

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
