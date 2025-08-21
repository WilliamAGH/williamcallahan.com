# S3 Object Storage Architecture

**Functionality:** `s3-object-storage`

## Core Purpose

Provides a comprehensive S3-compatible object storage system with multi-layered architecture, memory-safe operations, and CDN-optimized delivery. Serves as the backbone for all persistent storage needs including images, JSON data, and static assets.

**Last Updated**: 2025-07-03 - Major security hardening (SSRF/path traversal prevention), performance optimizations (parallel operations, batch S3 checks), comprehensive Zod validation, and type consolidation.

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

- **`lib/s3-utils.ts`** (800+ lines): Low-level S3 operations
  - AWS SDK v3 commands with retry logic (5 attempts, 100ms delay)
  - CDN fallback for non-JSON content (~50ms CDN vs ~100-200ms direct)
  - Memory protection with 50MB read limit and pressure detection
  - Request coalescing for duplicate reads
  - Stream handling with 30s timeout protection
  - Type-safe JSON operations with safe parsing
  - NEW (2025-08): S3-based distributed lock abstraction
    - Create-only writes using `If-None-Match: "*"`
    - `LockStore` interface for alternative backends and deterministic tests
    - Default `s3LockStore` plus optional injection in `acquireDistributedLock`/`releaseDistributedLock`/`cleanupStaleLocks`
    - `s3Json` wrapper export to simplify targeted spying in tests (ESM-safe)
  - **NEW**: Path sanitization to prevent directory traversal attacks
  - **NEW**: S3 key validation with Zod schemas

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
  - **NEW**: SSRF protection with URL validation before external fetches
  - **NEW**: Uses server-only env vars (S3*CDN_URL) instead of NEXT_PUBLIC* in server code
  - **NEW**: Parallel logo analysis and inversion operations

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
S3_CDN_URL=https://direct-cdn.domain.com  # Direct CDN URL (server-side priority)
NEXT_PUBLIC_S3_CDN_URL=https://cdn.domain.com  # Public CDN URL for client-side only

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

## Security Measures (NEW 2025-07)

### URL Validation & SSRF Prevention

- **Comprehensive URL Validation**: All external URLs validated with Zod schemas
- **Private IP Blocking**: Prevents access to internal networks (127._, 10._, 172.16-31._, 192.168._, ::1, fc00::/7)
- **Protocol Restrictions**: Only HTTP/HTTPS allowed, no file://, ftp://, or javascript:
- **Domain Allowlisting**: Sensitive endpoints restricted to known safe domains
- **Credential Stripping**: URLs with embedded credentials rejected
- **Port Restrictions**: Only standard web ports allowed (80, 443, 8080, 3000)

### Path Traversal Protection

- **Path Sanitization**: All file paths normalized to prevent `../` attacks
- **S3 Key Validation**: Strict patterns enforced for S3 keys
- **Asset ID Validation**: UUID format required for asset IDs
- **Null Byte Protection**: Null bytes stripped from all paths

### Security Headers

```typescript
const IMAGE_SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-XSS-Protection": "1; mode=block",
  "Content-Security-Policy": "default-src 'none'; img-src 'self' data: https:; style-src 'unsafe-inline'",
};
```

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

### Type/Validation Issues (CRITICAL)

1. **Missing Zod Validation** - `lib/s3-utils.ts:179`: External S3 responses parsed without validation
   - Impact: Potential runtime errors from malformed S3 metadata
   - Fix: Add Zod schema for S3 response validation
   - **UPDATE (2025-07)**: Partial fix - Added `types/schemas/` directory with initial schemas for education, experience, and other data types. S3 response validation still pending.

2. **Type Duplication** - `types/image.ts` & `types/logo.ts`: 80%+ similar interfaces
   - Examples: ImageResult vs LogoResult, ImageSource vs LogoSource
   - Impact: Maintenance burden, inconsistency risk
   - Fix: Create shared base interfaces with extends
   - **UPDATE (2025-07)**: Partially addressed - Created `BaseMediaResult` interface for shared properties. Full consolidation still in progress.

3. **No Runtime Validation** - `lib/services/unified-image-service.ts:842-946`: External API responses
   - Impact: Unvalidated data from Google/DuckDuckGo/Clearbit APIs
   - Fix: Zod schemas for each external service response
   - **UPDATE (2025-07)**: Added comprehensive Zod validation for external data in `types/schemas/` directory. URL validation added with security checks.

4. **Type Assertion Risk** - `lib/s3.ts:44`: Unsafe cast of AWS client to wrapper interface
   - Impact: Type safety bypass could hide incompatibilities
   - Fix: Proper type guards or factory pattern

5. **Implicit Any** - `lib/persistence/s3-persistence.ts:179`: JSON.parse without type parameter
   - Impact: Loss of type safety for override data
   - Fix: Use generic type parameter with validation

### Environment Issues (CRITICAL)

6. **NEXT*PUBLIC* Misuse** - Server-side code using client prefix:
   - `lib/services/unified-image-service.ts:48,104,148`
   - `lib/persistence/s3-persistence.ts:294,296,349,362`
   - `lib/s3-utils.ts:39`
   - Impact: Unnecessarily exposes CDN URL to client bundle
   - Fix: Use `S3_CDN_URL` for server-side code
   - **✅ FIXED (2025-07)**: All server-side code now uses `S3_CDN_URL` with proper fallback to `NEXT_PUBLIC_S3_CDN_URL`. Client bundle size reduced.

### Security Issues (CRITICAL - IMMEDIATE ACTION REQUIRED)

7. **SSRF Vulnerability** - Multiple endpoints:
   - `/api/cache/images`: Open proxy accepting any URL
   - `/api/og-image/route.ts:282-293`: No URL validation
   - `lib/services/unified-image-service.ts:842-946`: No private IP blocking
   - Impact: Server can be used to attack internal resources
   - Fix: Implement URL allowlist, block private IP ranges
   - **✅ FIXED (2025-07)**: Implemented comprehensive URL validation in `lib/utils/url-utils.ts` with:
     - Private IP range blocking (127._, 10._, 172.16-31._, 192.168._, ::1, fc00::/7)
     - Protocol restrictions (HTTP/HTTPS only)
     - Domain allowlisting for sensitive endpoints
     - Zod validation schemas for all URL inputs

8. **Path Traversal** - Multiple locations:
   - `/api/twitter-image/[...path]/route.ts`: Regex allows `.` character
   - `/api/assets/[assetId]/route.ts`: Unsanitized parameter
   - `lib/utils/s3-key-generator.ts:62`: User input in paths
   - Impact: Potential access to unauthorized files
   - Fix: Path normalization, explicit `..` blocking
   - **✅ FIXED (2025-07)**: All path inputs now sanitized with:
     - Explicit `..` and `.\` blocking
     - Path normalization to prevent bypasses
     - Alphanumeric + hyphen validation for IDs
     - S3 key generation hardened against injection

### Performance Issues (HIGH PRIORITY)

9. **Sequential Operations** - `lib/services/unified-image-service.ts:932-943`
   - Impact: Logo sources checked serially (30+ seconds worst case)
   - Fix: Promise.all for parallel source checking
   - **✅ FIXED (2025-07)**: Implemented parallel fetching with Promise.allSettled() for all logo sources. Reduced worst-case time from 30s to ~6s.

10. **Full Directory Scans** - `lib/image-handling/image-s3-utils.ts:findImageInS3`
    - Impact: Lists entire S3 directories (O(n) complexity)
    - Current: Can scan 1000s of objects per lookup
    - Fix: Implement deterministic key structure, use HEAD requests
    - **✅ FIXED (2025-07)**: Replaced directory scans with direct HEAD requests using deterministic keys. Added batch existence checking for multiple S3 objects.

11. **Memory Leaks Risk** - Unbounded collections:
    - `lib/services/unified-image-service.ts:51`: migrationLocks Map
    - `lib/services/unified-image-service.ts:55-56`: session Sets
    - `lib/services/unified-image-service.ts:62`: inFlightLogoRequests Map
    - Impact: Memory exhaustion in long-running processes
    - Fix: Implement LRU eviction or periodic cleanup

### Architectural Issues (MEDIUM PRIORITY)

12. **Duplicate S3 Clients** - Multiple client instantiations:
    - `lib/s3.ts:38`: Creates AWS S3 client
    - `lib/s3-utils.ts:78`: Creates another AWS S3 client
    - Impact: Inefficient connection pooling, inconsistent config
    - Fix: Singleton pattern or dependency injection

13. **Race Conditions** - `lib/s3-utils.ts:44`: In-flight request map
    - Impact: Concurrent modifications during request lifecycle
    - Fix: Use proper async locking mechanism

14. **Missing Error Context** - Multiple locations
    - Impact: Difficult debugging without request context
    - Fix: Add request ID and operation context to errors

### Code Quality (LOW PRIORITY)

15. **Console Logging in Production** - Throughout S3 modules
    - Impact: Log noise, potential info disclosure
    - Fix: Use proper logging framework with levels

16. **Magic Numbers** - `lib/s3-utils.ts:36-41`
    - Examples: 50MB limit, 100ms retry delay, 30s timeout
    - Fix: Extract to named constants with documentation

### British English (IMMEDIATE FIX)

17. **Spelling Corrections Required**:
    - `lib/env.ts:11`: "behaviour" → "behavior"
    - `lib/rate-limiter.ts:33`: "behaviour" → "behavior"
    - `lib/services/memory-aware-scheduler.ts:315-316,323`: "cancelled" → "canceled"
    - `types/lib.ts:57`: "cancelled" → "canceled"
    - **✅ FIXED (2025-07)**: All British spellings converted to American English throughout the codebase.

### ✅ FIXED Issues (2025-07)

- ✅ **SSRF Vulnerability**: Comprehensive URL validation with private IP blocking
- ✅ **Path Traversal**: All paths sanitized, S3 keys validated
- ✅ **NEXT*PUBLIC* Misuse**: Server code uses S3_CDN_URL, client uses NEXT_PUBLIC_S3_CDN_URL
- ✅ **Sequential Operations**: Parallel logo fetching, batch S3 checks
- ✅ **Type Safety**: BaseMediaResult interface consolidates image/logo types
- ✅ **British Spellings**: All converted to American English
- ✅ **Zod Validation**: External data validated with schemas in /types/schemas/
- ✅ Default public ACLs → Now explicit parameter with content categorization
- ✅ Basic retry logic → Implemented 5 attempts with 100ms backoff
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
    imageUrl, // External URL from Karakeep
    OPENGRAPH_IMAGES_S3_DIR, // images/opengraph/
    "Karakeep", // Log context
    bookmark.id, // Idempotency key
    bookmark.url, // Page URL for context
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

## Deployment Automation & Automatic Data Population (Integrated)

The platform automatically prepares and maintains S3 JSON data across environments during builds and container starts. This consolidates the guidance previously tracked in temporary deployment docs.

### Environment Detection

- Source of truth: `lib/config/environment.ts`
- URL-based detection first (`API_BASE_URL` or `NEXT_PUBLIC_SITE_URL`), with safe `NODE_ENV` fallback
- Suffix strategy for S3 keys via `getEnvironmentSuffix()`:
  - production: "" (no suffix)
  - test: "-test"
  - development/local: "-dev"

### Docker Entrypoint Orchestration

- File: `scripts/entrypoint.sh`
- On container start:
  - Creates cache directories and performs sanity checks
  - Verifies that slug-mapping data exists in S3; if missing, runs immediate population via `scripts/data-updater.ts`
  - Falls back to `scripts/ensure-slug-mappings.ts` on failure
  - Starts scheduler for ongoing updates; finally starts the Next.js server

### Scheduler Cadence

- File: `lib/server/scheduler.ts`
- Default schedules (Pacific Time):
  - Bookmarks: Every 2 hours
  - GitHub Activity: Daily at midnight
  - Logos: Weekly on Sunday

### Build Hooks Overview

- `package.json` scripts coordinate postbuild/postdeploy side effects:
  - `postbuild`: Verifies slug mappings
  - `postdeploy`: Performs initialization
  - `postinstall`: Initializes CSP hashes

### Container Startup Flow

1. Entrypoint executes
2. Initial data population if required (bookmarks/slug mapping)
3. Scheduler boots in the background
4. Next.js server starts serving traffic

### Environment-Specific Behavior

- Development and local use the `-dev` suffix; production uses no suffix
- Example keys:
  - dev: `json/bookmarks/slug-mapping-dev.json`
  - prod: `json/bookmarks/slug-mapping.json`

### Redundancy & Fallbacks

- Multiple save paths for resilience:
  ```ts
  await saveSlugMapping(bookmarks, true, true); // Save to all paths
  ```
- Fallback load order:
  1. Environment-specific primary path
  2. All environment variants
  3. Dynamic regeneration when necessary

### Manual Intervention

```bash
# Inside container – force data update
bun scripts/data-updater.ts --bookmarks --force

# Check status / S3 health
bun scripts/debug-slug-mapping.ts
bun scripts/fix-s3-env-suffix.ts
```

### Monitoring

- Container health checks hit `/api/health`
- Scheduler logs to container stdout
- Verification commands:
  ```bash
  ps aux | grep scheduler
  docker logs <container-id> | grep Scheduler
  bun scripts/debug-slug-mapping.ts
  ```

### What Could Go Wrong?

- 404 on Bookmarks after deploy → Entrypoint repopulates; manual fallback: `ensure-slug-mappings.ts --force --all-paths`
- Scheduler not running → Restart container (scheduler auto-starts)
- Wrong environment detected → Set `API_BASE_URL` or `NEXT_PUBLIC_SITE_URL` correctly (see `lib/config/environment.ts`)
- S3 connection failed → Verify `S3_*` env variables are present
