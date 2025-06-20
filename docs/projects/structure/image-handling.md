# Image Handling Architecture

**Functionality:** `image-handling`

## Core Objective

Robust centralized system for fetching, processing, and serving images with memory-safe operations. Primary focus on company logos and OpenGraph images with automatic theme adaptation.

## Architecture Diagram

See `image-handling.mmd` for visual pipeline diagram.

## Memory-Safe Architecture (2025-06)

### Core Components

1. **ImageMemoryManager** (`/lib/image-memory-manager.ts`)
   - LRU cache with 512MB budget, 50MB per-image limit
   - Buffer copying prevents Buffer.slice() retention
   - Request coalescing prevents duplicate fetches
   - Memory pressure detection with automatic eviction
   - Metadata cache with 50MB size limit

2. **UnifiedImageService** (`/lib/services/unified-image-service.ts`)  
   - Single entry point for all image operations
   - Three-tier caching: Memory → S3 → External APIs
   - Streaming support for images >5MB
   - Automatic S3 persistence with CDN delivery
   - Format detection and optimization

3. **MemoryHealthMonitor** (`/lib/health/memory-health-monitor.ts`)
   - Progressive thresholds: 75% warning, 90% critical
   - Load balancer integration (503 when critical)
   - Emergency cleanup with cache clearing
   - Memory trend analysis

### Environment Configuration

```bash
IMAGE_RAM_BUDGET_BYTES=536870912    # 512MB total
MAX_IMAGE_SIZE_BYTES=52428800       # 50MB per image
IMAGE_STREAM_THRESHOLD_BYTES=5242880 # 5MB streaming threshold
MEMORY_WARNING_THRESHOLD=402653184   # 75% of budget
MEMORY_CRITICAL_THRESHOLD=483183820  # 90% of budget
```

## Key API Routes

### Logo Management

- **`/api/logo`**: Primary logo endpoint
  - Memory-safe retrieval from ImageMemoryManager
  - Query params: `website`, `company`, `forceRefresh`
  - Returns image buffer with appropriate content-type

- **`/api/logo/invert`**: Theme-aware logo inversion
  - GET: Returns inverted logo based on theme
  - HEAD: Checks if inversion needed
  - Stores inverted buffers in ImageMemoryManager

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
Request → UnifiedImageService → ImageMemoryManager → HIT? Return (~1ms)
                ↓                       ↓ MISS
                ↓                  Check S3 → HIT? Cache & Return (~50ms)
                ↓                       ↓ MISS  
                ↓                  Coalesce? → Yes? Wait
                ↓                       ↓ No
                ↓                  External → Fetch & Validate
                ↓                       ↓
                ↓                  >5MB? → Stream to S3
                ↓                       ↓ No
                ↓                  Process & Copy Buffer
                ↓                       ↓
                └──────────────→ Cache → S3 → CDN
```

## Memory Pressure Flow

```
RSS Check → >80%  → Reject new large operations (mem-guard)
          → >75%  → Warning state, continue with logging
          → >90%  → Critical state, reject all new operations
          → >100% → Aggressive cleanup (image cache only)
          → >120% → Emergency flush (all caches)
```

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

- `lib/image-memory-manager.ts` - Buffer cache management
- `lib/services/unified-image-service.ts` - Image operations
- `lib/services/image-streaming.ts` - Large image streaming
- `lib/health/memory-health-monitor.ts` - Memory monitoring

### Data Access

- `lib/data-access/logos.ts` - Logo lifecycle management
- `lib/data-access/logos/external-fetch.ts` - External APIs
- `lib/data-access/logos/image-processing.ts` - Transformations
- `lib/data-access/opengraph.ts` - OpenGraph parsing

### Analysis & Validation

- `lib/imageAnalysis.ts` - Theme suitability analysis
- `lib/imageCompare.ts` - Perceptual hash validation

### Types

- `types/image.ts` - Unified image interfaces
- `types/logo.ts` - Logo-specific types
- `types/cache.ts` - Cache entry types

## Performance Metrics

- Memory cache hit: ~1ms
- S3 cache hit: ~50ms  
- External fetch: 100ms-5s
- Streaming threshold: 5MB
- Memory budget: 512MB
- Max image size: 50MB

## Health Monitoring

- `/api/health` - Overall system health
- `/api/health/metrics` - Detailed memory metrics
- 503 responses when memory critical
- X-System-Status headers for observability
