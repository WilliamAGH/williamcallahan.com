# S3 Object Storage Architecture

**Functionality:** `s3-object-storage`

## Core Objective

Centralized S3-compatible object storage with layered abstraction: low-level utilities, Bun compatibility layer, and domain-specific operations. Optimized for CDN delivery with memory-safe integration.

## Architecture Diagram

See `s3-object-storage.mmd` for visual data flow.

## Read/Write Strategy

### Read Operations

1. **JSON**: Always bypasses CDN (prevents stale metadata)
2. **Images**: CDN first (~50ms) → S3 fallback (~100-200ms)
3. **404 Handling**: Returns `null` gracefully

### Write Operations

- Direct S3 writes with configurable ACL
- Content-Type auto-inference
- Immediate CDN availability for public assets

## Key Files

### Core Infrastructure

- **`lib/s3-utils.ts`**: Low-level S3 operations
  - AWS SDK v3 commands
  - CDN fallback logic
  - 3 retries with 100ms delay
  - Type conversions

- **`lib/s3.ts`**: Bun compatibility layer
  - Mimics Bun S3 API
  - Environment portability

### Specialized Modules

- **`lib/services/unified-image-service.ts`**: Central image service
  - All image operations consolidated here
  - Direct S3 persistence
  - CDN URL generation
  - Domain session management

- **`lib/image-handling/image-s3-utils.ts`**: S3 image utilities
  - Generic image persistence with idempotent keys
  - Fallback handling for failed fetches
  - OpenGraph image operations
  - Domain-based filename generation
  
- **`lib/image-handling/shared-image-processing.ts`**: Image processing
  - Format detection and conversion
  - SVG/animation preservation
  - Consistent processing logic

## Configuration

```bash
# Required
S3_BUCKET=your-bucket
S3_ACCESS_KEY_ID=your-key
S3_SECRET_ACCESS_KEY=your-secret

# Recommended  
S3_REGION=us-east-1
S3_PUBLIC_CDN_URL=https://cdn.domain.com
S3_SERVER_URL=https://s3.amazonaws.com
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

## Critical Issues

### ✅ FIXED (2025-06)

- Default public ACLs → Now explicit parameter
- Retry logic → 3 attempts with backoff

### High Priority

- **Full Directory Scans**: `findImageInS3` lists entire directories
  - Fix: Implement prefix-based key structure
  
- **Race Condition**: Concurrent requests trigger duplicate listings
  - Fix: Promise-based initialization

### Medium Priority  

- **Duplicate Clients**: Both `s3.ts` and `s3-utils.ts` create clients
- **Brittle Logo Selection**: String matching for "best" logo

## Performance

- CDN hit: ~50ms
- S3 direct: ~100-200ms  
- S3 write: ~200-500ms
- Directory scan: O(n) - needs optimization

## Architecture Flow

```
Application → s3.ts (Bun API) → s3-utils.ts (AWS SDK)
                                      ↓
                              Domain Operations
                              (logos, images, etc)
```

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

## Social Media Avatar Persistence

### Profile Image Handling

When OpenGraph data is fetched, profile images are automatically persisted:

1. **OpenGraph Extraction**: `lib/opengraph/parser.ts` extracts platform-specific profile images
2. **Automatic Persistence**: `lib/opengraph/fetch.ts` persists profile images to `social-avatars/`
3. **Twitter Proxy**: `app/api/twitter-image/` persists Twitter profile images when proxied
4. **Fallback Handling**: External avatars (GitHub, Bluesky) are persisted through og-image API

### Storage Strategy

**Directory Structure**:

- `social-avatars/github/` - GitHub user avatars
- `social-avatars/twitter/` - Twitter/X profile images  
- `social-avatars/linkedin/` - LinkedIn profile photos
- `social-avatars/bluesky/` - Bluesky avatars
- `social-banners/` - Platform banner/header images

**Naming Convention**:

- Profile images: `social-avatars/{platform}/{username-or-hash}.{ext}`
- Banner images: `social-banners/{platform}/{hash}.{ext}`
- Uses idempotency keys to prevent duplicate uploads
