# S3 Object Storage Architecture

**Functionality:** `s3-object-storage`

## Core Purpose

Provides a comprehensive S3-compatible object storage system with multi-layered architecture, memory-safe operations, and CDN-optimized delivery. Serves as the backbone for all persistent storage needs including images, JSON data, and static assets.

## Architecture Overview

### Data Flow

```
Application → S3 Client Wrapper → AWS SDK v3 → S3/DigitalOcean Spaces
     ↓              ↓                  ↓              ↓
Unified Image   Persistence      CDN Utils      Memory Safety
  Service         Layer                          Controls
```

### Visual Diagram

See `s3-object-storage.mmd` for detailed data flow visualization.

## Read/Write Strategy

### Read Operations

1. **JSON**: Always bypasses CDN (prevents stale metadata)
2. **Images**: CDN first (~50ms) → S3 fallback (~100-200ms)
3. **404 Handling**: Returns `null` gracefully

### Write Operations

- Direct S3 writes with configurable ACL
- Content-Type auto-inference
- Immediate CDN availability for public assets

## Key Components

### Core Infrastructure

- **`lib/s3-utils.ts`** (762 lines): Low-level S3 operations
  - AWS SDK v3 commands with retry logic (3 attempts, 100ms delay)
  - CDN fallback for non-JSON content (~50ms CDN vs ~100-200ms direct)
  - Memory protection with 50MB read limit and pressure detection
  - Request coalescing for duplicate reads
  - Stream handling with 30s timeout protection
  - Type-safe JSON operations with safe parsing

- **`lib/s3.ts`** (125 lines): Bun compatibility layer
  - Wraps AWS SDK to mimic Bun's S3 API
  - Provides unified interface for both Bun and webpack environments
  - Implements file(), list() methods for compatibility

- **`lib/persistence/s3-persistence.ts`** (380 lines): Centralized persistence
  - Unified write operations with ACL management
  - Content category classification (PublicAsset, PublicData, PrivateData, Html)
  - Guarantees public-read ACL for DigitalOcean Spaces compatibility
  - Specialized methods for JSON, binary, and HTML persistence
  - OpenGraph override management

### Specialized Services

- **`lib/services/unified-image-service.ts`** (1000+ lines): Central image orchestration
  - Memory-safe logo fetching from multiple sources (Google, DuckDuckGo, Clearbit)
  - Session-based domain tracking to prevent duplicate processing
  - Automatic retry with exponential backoff
  - Failure tracking with S3-persisted blocklist
  - Request deduplication for concurrent fetches
  - CDN URL generation and validation

- **`lib/image-handling/image-s3-utils.ts`**: Generic image persistence
  - Idempotent storage using content-based or custom keys
  - Automatic format detection and content-type inference
  - Base64 data URI support
  - Duplicate detection before upload
  - Fallback image handling for failed fetches

- **`lib/utils/s3-key-generator.ts`**: Consistent S3 key generation
  - Type-based key patterns (logo, opengraph, avatar, banner)
  - Domain-based filename generation for deduplication
  - Hash-based keys for content integrity
  - Extension detection and normalization

- **`lib/services/image-streaming.ts`**: Direct S3-to-client streaming
  - Memory-efficient large image delivery
  - CDN redirect for optimal performance
  - No server-side buffering

## Configuration

### Environment Variables

```bash
# Required - Core S3 Configuration
S3_BUCKET=your-bucket-name
S3_ACCESS_KEY_ID=your-access-key
S3_SECRET_ACCESS_KEY=your-secret-key

# Recommended - Performance & Compatibility
S3_REGION=us-east-1              # Default region
S3_SERVER_URL=https://s3.amazonaws.com  # S3 endpoint (or DigitalOcean Spaces URL)
NEXT_PUBLIC_S3_CDN_URL=https://cdn.domain.com  # Public CDN URL for client-side
S3_CDN_URL=https://cdn.domain.com  # Fallback CDN URL

# Optional - Advanced Settings
S3_SESSION_TOKEN=token            # For temporary credentials
DRY_RUN=true                     # Test mode without actual S3 operations
IS_DATA_UPDATER=true             # Batch mode for synchronous persistence
```

### AWS SDK Configuration

- **Version**: AWS SDK v3.840.0 (latest as of 2025)
- **Client Options**:
  - Force path style for S3-compatible services
  - 5 retry attempts with exponential backoff
  - Automatic region detection

## Memory Integration

- **No Memory Caching**: All images served directly from S3/CDN
- **Immediate Persistence**: Images uploaded to S3 on first fetch
- **CDN-First Delivery**: All responses redirect to CDN URLs
- **Metadata Only**: ServerCache stores only S3 keys and metadata
- **Stream Support**: Large images (>5MB) streamed directly to S3
- **Zero Buffer Storage**: No image buffers kept in memory

## Storage Organization

### Key Principles

1. **Separation of Concerns**: JSON metadata is strictly separated from binary files
2. **Type-based Organization**: All JSON files under `json/`, all images under `images/`
3. **Environment Suffixes**: Development and test environments use suffixes (e.g., `-dev`, `-test`)
4. **Consistent Naming**: Descriptive names for readability and debugging

```
bucket/
├── json/                   # All JSON metadata and data files
│   ├── search/             # Search indexes
│   │   ├── posts-index.json
│   │   ├── investments-index.json
│   │   ├── experience-index.json
│   │   ├── education-index.json
│   │   ├── bookmarks-index.json
│   │   └── build-metadata.json
│   ├── bookmarks/          # Bookmark data
│   │   ├── bookmarks.json
│   │   ├── bookmarks-dev.json
│   │   ├── refresh-lock.json
│   │   └── refresh-lock-dev.json
│   ├── blog/               # Blog content for search indexing
│   ├── education/          # Education data
│   ├── experience/         # Experience data
│   ├── github-activity/    # GitHub activity data
│   │   ├── aggregated.json
│   │   ├── aggregated-weekly.json
│   │   ├── trailing-year.json
│   │   └── all-time.json
│   ├── image-data/         # Image metadata (NOT image files!)
│   │   ├── logos/
│   │   │   ├── manifest.json
│   │   │   └── failed-domains.json
│   │   └── opengraph/
│   │       └── manifest.json
├── images/                 # Actual image files
│   ├── logos/              # Company logos (descriptive naming: company_source_hash.ext)
│   │   └── inverted/       # Theme-inverted logos
│   ├── opengraph/          # OpenGraph images (hash-based naming)
│   ├── social-avatars/     # Social media profile images
│   │   ├── github/         # GitHub user avatars
│   │   ├── twitter/        # Twitter/X profile images
│   │   ├── linkedin/       # LinkedIn profile images
│   │   ├── bluesky/        # Bluesky avatars
│   │   └── discord/        # Discord avatars
│   ├── social-banners/     # Social media banner/header images
│   ├── blog/               # Blog images
│   └── other/              # Miscellaneous images
└── opengraph/              # OpenGraph metadata (URL hash-based) INVALID -- REMOVE THIS ONCE CONFIRMED NOT IN USE
    └── metadata/           # JSON metadata files for each URL INVALID -- REMOVE THIS ONCE CONFIRMED NOT IN USE
```

### Storage Rules

**NEVER store:**

- JSON files in `images/` directories
- Binary files in `json/` directories  
- Unrelated files in domain-specific directories
- Cache files without proper expiration handling

**ALWAYS:**

- Use environment suffixes for non-production data
- Follow the established naming conventions
- Update manifests when adding new images
- Clean up obsolete files during migrations

## 🐛 Bugs & Improvements Inventory

### Type/Validation Issues (HIGH PRIORITY)

1. **Missing Zod Validation** - `lib/s3-utils.ts:179`: External S3 responses parsed without validation
   - Impact: Potential runtime errors from malformed S3 metadata
   - Fix: Add Zod schema for S3 response validation

2. **Type Assertion Risk** - `lib/s3.ts:44`: Unsafe cast of AWS client to wrapper interface
   - Impact: Type safety bypass could hide incompatibilities
   - Fix: Proper type guards or factory pattern

3. **Implicit Any** - `lib/persistence/s3-persistence.ts:179`: JSON.parse without type parameter
   - Impact: Loss of type safety for override data
   - Fix: Use generic type parameter with validation

### Performance Issues (HIGH PRIORITY)

4. **Full Directory Scans** - `lib/image-handling/image-s3-utils.ts:findImageInS3`
   - Impact: Lists entire S3 directories (O(n) complexity)
   - Current: Can scan 1000s of objects per lookup
   - Fix: Implement deterministic key structure, use HEAD requests

5. **Memory Leaks Risk** - `lib/services/unified-image-service.ts:52-53`
   - Impact: Unbounded growth of session tracking sets
   - Current: Sets grow indefinitely during long-running processes
   - Fix: Implement LRU eviction or time-based cleanup

### Architectural Issues (MEDIUM PRIORITY)

6. **Duplicate S3 Clients** - Multiple client instantiations
   - `lib/s3.ts:38`: Creates AWS S3 client
   - `lib/s3-utils.ts:78`: Creates another AWS S3 client
   - Impact: Inefficient connection pooling, inconsistent config
   - Fix: Singleton pattern or dependency injection

7. **Race Conditions** - `lib/s3-utils.ts:44`: In-flight request map
   - Impact: Concurrent modifications during request lifecycle
   - Fix: Use proper async locking mechanism

8. **Missing Error Context** - Multiple locations
   - Impact: Difficult debugging without request context
   - Fix: Add request ID and operation context to errors

### Security & Reliability (MEDIUM PRIORITY)

9. **No Request Signing Validation** - All S3 operations
   - Impact: No verification of S3 response authenticity
   - Fix: Implement signature verification for critical operations

10. **Unbounded Retry Queue** - `lib/services/unified-image-service.ts:74`
    - Impact: Memory exhaustion from failed upload retries
    - Current: Map can grow without limit
    - Fix: Implement max queue size with FIFO eviction

### Code Quality (LOW PRIORITY)

11. **Console Logging in Production** - Throughout S3 modules
    - Impact: Log noise, potential info disclosure
    - Fix: Use proper logging framework with levels

12. **Magic Numbers** - `lib/s3-utils.ts:36-41`
    - Examples: 50MB limit, 100ms retry delay, 30s timeout
    - Fix: Extract to named constants with documentation

### ✅ FIXED Issues (2025)

- ✅ Default public ACLs → Now explicit parameter with content categorization
- ✅ Basic retry logic → Implemented 3 attempts with 100ms backoff
- ✅ Memory pressure detection → Added coordinated health monitoring
- ✅ Request coalescing → Prevents duplicate S3 reads

## Performance Characteristics

### Read Operations

- **CDN Hit**: ~50ms (cached content)
- **CDN Miss → S3**: ~150-250ms total
- **S3 Direct**: ~100-200ms
- **Large Files (>5MB)**: Streamed to prevent memory spikes

### Write Operations  

- **S3 Upload**: ~200-500ms (varies by size)
- **With Retry**: Up to 3x base time
- **Memory Check**: <1ms overhead

### Bottlenecks

- **Directory Scans**: O(n) with unbounded listing
- **Concurrent Requests**: No connection pooling optimization
- **Large Payloads**: Full buffering before write

### Memory Usage

- **Read Limit**: 50MB per operation
- **Stream Timeout**: 30 seconds
- **Request Coalescing**: Reduces duplicate memory allocation
- **Pressure Detection**: Backs off when RSS > 70% of limit

## Detailed Architecture Flow

### Request Flow

```
1. Application Request
   ↓
2. Domain Service (e.g., UnifiedImageService)
   ↓
3. Persistence Layer (s3-persistence.ts)
   ↓
4. S3 Client Wrapper (s3.ts for Bun compatibility)
   ↓
5. S3 Utils (s3-utils.ts with AWS SDK)
   ↓
6. AWS S3 / DigitalOcean Spaces
```

### Data Flow Patterns

**JSON Data**: App → Direct S3 (bypass CDN) → Validate → Parse
**Images**: App → CDN First → S3 Fallback → Stream/Buffer → Deliver
**Uploads**: App → Memory Check → Process → S3 Upload → CDN Purge

## OpenGraph Image Persistence Flow

### Bookmark Processing (via data-updater.ts)

When `scripts/data-updater.ts` runs with bookmarks enabled:

1. **Fetch from Karakeep/Hoarder API**: Gets bookmarks with image URLs
2. **Enrich with OpenGraph**: `lib/bookmarks/enrich-opengraph.ts` processes each bookmark
3. **Persist to S3**: In batch mode (`IS_DATA_UPDATER=true`):
   - External image URLs are downloaded immediately
   - Stored in `images/opengraph/` with domain-based filenames
   - Returns S3 CDN URL synchronously
   - Uses bookmark ID as idempotency key to prevent duplicates

### Image Storage Strategy

**Filename Generation**:

- Based on domain hash: `domain.com` → `hash.png`
- Idempotent: Same domain always maps to same filename
- Prevents duplicate downloads for same domain

**Persistence Logic**:
```typescript
// In batch mode (data-updater)
if (useBatchMode) {
  const s3Url = await persistImageAndGetS3Url(
    imageUrl,           // External URL from Karakeep
    OPENGRAPH_IMAGES_S3_DIR,  // images/opengraph/
    "Karakeep",         // Log context
    bookmark.id,        // Idempotency key
    bookmark.url        // Page URL for context
  );
  bookmark.ogImage = s3Url; // Update to use CDN URL
}
```

### Runtime vs Batch Mode

- **Batch Mode** (data-updater): Synchronous persistence, immediate S3 URL
- **Runtime Mode** (web requests): Async background persistence, returns original URL

## Social Media Asset Management

### Profile Image Pipeline

Automated persistence during OpenGraph enrichment:

1. **Extraction**: `lib/opengraph/parser.ts` identifies platform-specific images
2. **Persistence**: `lib/opengraph/fetch.ts` schedules background S3 upload
3. **Platform Proxies**:
   - `app/api/twitter-image/[...path]/route.ts` - Twitter/X images
   - `app/api/github-avatar/[username]/route.ts` - GitHub avatars
4. **Fallback**: Generic og-image API handles unknown platforms

### Storage Organization

```
images/
├── social-avatars/
│   ├── github/       # e.g., octocat.jpg
│   ├── twitter/      # e.g., jack.jpg
│   ├── linkedin/     # e.g., professional-id.jpg
│   ├── bluesky/      # e.g., user.at.bsky.jpg
│   └── discord/      # e.g., user-id.png
└── social-banners/   # Platform header images
```

### Deduplication Strategy

- **Username-based Keys**: Predictable paths for profile images
- **Content Hashing**: Prevents duplicate uploads of same image
- **Platform Namespacing**: Avoids conflicts between services
- **Idempotency**: Same profile always maps to same S3 key

## Related Documentation

- **[`image-handling.md`](./image-handling.md)**: Complete image processing architecture
- **[`opengraph.md`](./opengraph.md)**: OpenGraph metadata extraction details
- **[`caching.md`](./caching.md)**: Multi-tier caching strategy
- **[`memory-mgmt.md`](./memory-mgmt.md)**: Memory safety protocols
- **[`linting-formatting.md`](./linting-formatting.md)**: Type safety requirements

## Operations Guide

### Manual S3 Operations

```bash
# List all images in a directory
aws s3 ls s3://bucket/images/logos/ --recursive

# Check object metadata
aws s3api head-object --bucket bucket --key images/logo.png

# Force CDN refresh (DigitalOcean Spaces)
curl -X DELETE "https://api.digitalocean.com/v2/cdn/endpoints/{id}/cache" \
  -H "Authorization: Bearer $DO_API_TOKEN"

# Test S3 connectivity
bun run test:s3-connection
```

### Monitoring & Debugging

1. **Memory Pressure**: Check `/api/health` endpoint
2. **S3 Errors**: Enable `DEBUG=s3*` environment variable
3. **Failed Uploads**: Review `images/logos/failed-domains.json`
4. **Performance**: Use AWS CloudWatch or DigitalOcean monitoring

### Common Issues

1. **"Missing S3 configuration"**: Ensure all required env vars are set
2. **"Insufficient memory headroom"**: Increase memory limits or reduce concurrent operations
3. **"Stream timeout"**: Check network connectivity and S3 endpoint health
4. **CDN stale content**: JSON bypasses CDN; use cache headers for other content
