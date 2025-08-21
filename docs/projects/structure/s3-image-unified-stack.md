# S3 & Image Handling Unified Stack Architecture

## Core Purpose

Comprehensive S3-based storage and image handling system with multi-layered architecture, memory-safe operations, CDN-optimized delivery, and unified service orchestration. This document consolidates the S3 object storage and image handling domains into a single architectural reference.

## Architecture Overview

Data Flow: External Sources → UnifiedImageService → S3 Persistence → CDN Delivery
Components:

- **UnifiedImageService** (`lib/services/unified-image-service.ts:1-1046`): Central orchestrator for all image operations
- **S3 Utils** (`lib/s3-utils.ts:1-762`): Low-level S3 operations with AWS SDK v3
- **Persistence Layer** (`lib/persistence/s3-persistence.ts:1-380`): Unified write interface with ACL management
- **Image Processing** (`lib/image-handling/shared-image-processing.ts:1-197`): Format detection and optimization

## Key Features

- **Memory-Safe Operations**: Stream support for images >5MB, memory pressure detection
- **CDN-First Delivery**: ~50ms CDN vs ~100-200ms direct S3
- **Request Coalescing**: Prevents duplicate concurrent operations
- **Circuit Breaker**: Domain session management prevents infinite loops
- **Format Preservation**: Maintains SVG, GIF, WebP animations

## Data Structures

```typescript
// From types/image.ts
export interface ImageResult extends BaseImageData {
  buffer?: Buffer;
  s3Key?: string;
  s3Url?: string;
  cdnUrl?: string;
  source: ImageSource;
  contentType: string;
}

// From types/logo.ts
export interface LogoResult {
  s3Key?: string;
  url?: string | null;
  cdnUrl?: string;
  source: LogoSource;
  contentType: string;
  buffer?: Buffer;
}
```

## Design Decisions

1. **No Memory Caching**: All images served directly from S3/CDN for scalability
2. **Deterministic Keys**: Domain-based naming prevents duplicates (`lib/utils/s3-key-generator.ts:62`)
3. **Session Management**: 30-minute circuit breaker prevents resource exhaustion (`lib/services/unified-image-service.ts:54-61`)
4. **Stream Threshold**: 5MB images streamed directly to S3 (`lib/services/unified-image-service.ts:715-726`)

## External Integrations

- **AWS SDK v3.840.0**: S3 client with retry logic, exponential backoff
- **DigitalOcean Spaces**: S3-compatible storage with forced public ACLs
- **CloudFront CDN**: Global content delivery
- **Logo Sources**: Google, DuckDuckGo, Clearbit APIs with fallback chain

## Performance & Security

- CDN hit: ~50ms, S3 direct: ~100-200ms
- Memory limit: 50MB per operation
- Stream timeout: 30 seconds
- Request coalescing window: prevents duplicate S3 reads
- **🔴 CRITICAL SSRF**: `/api/cache/images` open proxy vulnerability
- **🔴 Path Traversal**: Multiple endpoints vulnerable

## Operations & Testing

- Health: `/api/health`, `/api/health/metrics`
- Tests: `__tests__/lib/image-processing/`, `__tests__/lib/utils/` (coverage varies)
- Commands: `bun run update-s3`, `bun run migrate-static-images`, `bun run fix:s3-acl-public`

## 🐛 Bugs & Improvements Inventory

### Type/Validation Issues (PRIORITY)

1. **Missing Zod Validation** - `lib/s3-utils.ts:179`: External S3 responses without validation
2. **Type Duplication** - `types/image.ts` & `types/logo.ts`: 80%+ similar interfaces (ImageResult, LogoResult)
3. **No Runtime Validation** - `lib/services/unified-image-service.ts:842-946`: External API responses unvalidated
4. **Type Assertions** - `lib/s3.ts:44`: Unsafe cast bypasses type safety
5. **Similar Source Types** - `types/image.ts:5-16` & `types/logo.ts:65`: ImageSource vs LogoSource

### Environment Issues (CRITICAL)

1. **NEXT*PUBLIC* Misuse** - `lib/services/unified-image-service.ts:48,104,148`: Server code using client prefix
2. **NEXT*PUBLIC* Misuse** - `lib/persistence/s3-persistence.ts:294,296,349,362`: Persistence layer exposure
3. **NEXT*PUBLIC* Misuse** - `lib/s3-utils.ts:39`: Utility code with client prefix

### Security Issues (CRITICAL)

1. **SSRF Vulnerability** - `/api/cache/images`: Open proxy accepting any URL
2. **SSRF Vulnerability** - `/api/og-image/route.ts:282-293`: No URL validation before fetch
3. **Path Traversal** - `/api/twitter-image/[...path]/route.ts`: Regex allows `.` character
4. **No Private IP Blocking** - `lib/services/unified-image-service.ts`: Allows localhost/internal IPs

### Performance Issues

1. **Sequential Loading** - `lib/services/unified-image-service.ts:932-943`: Logo sources checked serially
2. **Full Directory Scans** - `lib/image-handling/image-s3-utils.ts:findImageInS3`: O(n) S3 listing
3. **Unbounded Maps** - `lib/services/unified-image-service.ts:51-62`: Memory leak risk
4. **No Connection Pooling** - Multiple S3 client instances created

### Memory Issues

1. **Unbounded Sets** - `lib/services/unified-image-service.ts:55-56`: sessionProcessedDomains grows indefinitely
2. **No LRU Eviction** - `lib/services/unified-image-service.ts:62`: inFlightLogoRequests Map
3. **Missing Cleanup** - `lib/services/unified-image-service.ts:51`: migrationLocks never cleared

### British English

- `lib/env.ts:11`: "behaviour" → "behavior"
- `lib/rate-limiter.ts:33`: "behaviour" → "behavior"
- `lib/services/memory-aware-scheduler.ts:315-316,323`: "cancelled" → "canceled"
- `types/lib.ts:57`: "cancelled" → "canceled"

## Related Documentation

- `s3-object-storage.mmd` - S3 architecture diagram
- `image-handling.mmd` - Image pipeline visualization
- `caching.md` - Multi-tier caching strategy
- `memory-mgmt.md` - Memory safety protocols
