# SEO Architecture

**Functionality:** `seo`

## Core Purpose

Provides comprehensive search engine optimization through metadata generation, structured data (JSON-LD), dynamic sitemap/robots.txt, automated submissions, and a universal OpenGraph image API with multi-tier fallback. Features Zod validation for metadata quality and idempotent operations throughout.

**Last Updated**: 2025-07 - Enhanced Zod validation schemas, URL security improvements, and environment variable corrections.

## Architecture Overview

### Data Flow

```
1. Content (Blog/Pages) → Metadata Generation → Next.js Head
2. External URLs → OG Fetch → Multi-tier Fallback → S3 Persistence
3. Sitemap Build → Automated Submission → Search Engines
4. Social Crawlers → og-image API → Optimized Delivery
```

### Key Design Decisions

1. **Universal OG Image API** - Single endpoint normalizes all image sources
2. **Idempotent Persistence** - Hash-based keys prevent duplicate uploads
3. **Environment-Aware** - Async for web runtime, sync for batch processing
4. **X.com Mitigation** - vxtwitter.com proxy for reliable Twitter cards

## Key Components

### Core Infrastructure

- **`lib/seo/index.ts`** (387 lines): Central orchestration and barrel exports
  - Re-exports all SEO utilities with single import point
  - Core functions: `getStaticPageMetadata`, `getBlogPostMetadata`, `getProfilePageMetadata`
  - Integrates metadata, validation, and schema generation
  - Type-safe metadata construction with Next.js 15 compatibility

- **`lib/seo/metadata.ts`** (293 lines): Metadata generation engine
  - Creates platform-specific metadata (Twitter, OpenGraph, Dublin Core)
  - Character limit enforcement per platform requirements
  - Fallback chains for missing metadata
  - Integration points for JSON-LD schema graph

- **`data/metadata.ts`** (213 lines): Single source of truth
  - All site-wide constants (name, author, social handles)
  - Image registry with TODO tracking for missing assets
  - Environment-aware URL construction
  - Type-safe exports with validation

## Image Asset Management

### Centralized Registry

All SEO images defined in `data/metadata.ts` via `SEO_IMAGES` constant:

| Constant                       | Purpose                                                   | Path                              |
| ------------------------------ | --------------------------------------------------------- | --------------------------------- |
| `SEO_IMAGES.ogDefault`         | Site-wide default OpenGraph & Twitter card (1200×630 PNG) | `/images/og/default-og.png`       |
| `SEO_IMAGES.ogLogo`            | Optional logo-only card                                   | `/images/og/logo-og.png`          |
| `SEO_IMAGES.ogBookmarks`       | Bookmarks collection card                                 | `/images/og/bookmarks-og.png`     |
| `SEO_IMAGES.ogProjects`        | Projects collection card                                  | `/images/og/projects-og.png`      |
| `SEO_IMAGES.ogBlogIndex`       | Blog index card                                           | `/images/og/blog-og.png`          |
| `SEO_IMAGES.ogDynamicFallback` | Fallback returned by `/api/og-image`                      | `/images/og/dynamic-fallback.png` |
| `SEO_IMAGES.faviconIco`        | Favicon (ICO multi-size)                                  | `/favicon.ico`                    |
| `SEO_IMAGES.faviconSvg`        | Favicon SVG (hi-DPI)                                      | `/favicon.svg`                    |
| `SEO_IMAGES.appleTouch`        | Apple touch icon 180×180                                  | `/apple-touch-icon.png`           |
| `SEO_IMAGES.android192`        | Android/manifest 192×192                                  | `/android-chrome-192x192.png`     |
| `SEO_IMAGES.android512`        | Android/manifest 512×512                                  | `/android-chrome-512x512.png`     |

**Missing Assets** (Build will warn):

- `/images/og/dynamic-fallback.png` - TODO in `data/metadata.ts:89`
- `/favicon.svg` - TODO in `data/metadata.ts:94`

**URL Processing**: All relative paths converted to absolute HTTPS URLs via `ensureAbsoluteUrl()` ensuring crawler compatibility.

### Structured Data Generation

- **`lib/seo/schema.ts`** (456 lines): JSON-LD schema graph builder
  - Generates interconnected Schema.org entities
  - Entity creators: `Person`, `Article`, `WebSite`, `WebPage`, `ProfilePage`, `CollectionPage`
  - Automatic `@graph` relationship linking
  - Date/time formatting for search engines
  - Author and publisher entity deduplication

- **`types/seo/schema.ts`** (234 lines): Schema.org type definitions
  - Comprehensive interfaces for all entity types
  - Type-safe `SchemaParams` for generation
  - Strict compliance with Schema.org specifications
  - Support for extensions (breadcrumbs, search actions)

### OpenGraph Implementation

- **`lib/seo/opengraph.ts`** (178 lines): OpenGraph metadata builder
  - Article-specific OpenGraph with publish/modified times
  - Multi-image support with fallback chains
  - Platform-specific formatting (Twitter vs Facebook)
  - Integration with og-image API endpoints

- **`lib/seo/og-validation.ts`** (289 lines): Validation & cache management
  - Image dimension validation (min 144x144, optimal 1200x630)
  - Required tag verification with helpful errors
  - Cache-busting URL generation for forced refreshes
  - Platform compliance checks (Twitter Cards, OpenGraph Protocol)

- **`types/seo/opengraph.ts`** (141 lines): OpenGraph type system
  - Zod schemas for external data validation
  - Type-safe interfaces: `ArticleOpenGraph`, `ProfileOpenGraph`, `WebsiteOpenGraph`
  - Karakeep fallback data structures
  - Cache entry schemas with timestamps

### OpenGraph Validation & Cache Management

#### Validation System

The OpenGraph validation system ensures all social media metadata meets platform requirements and provides consistent previews across Twitter, Facebook, LinkedIn, and other social platforms.

**Core Features:**

- **Image Validation**: Checks dimensions (minimum 144x144px, recommended 1200x630px), format compatibility, and URL accessibility
- **Metadata Validation**: Verifies required tags (`og:title`, `og:description`, `og:image`, `og:url`) and character limits
- **Cache Busting**: Generates cache-busted URLs to force social media crawlers to refresh content
- **Platform Compliance**: Follows Twitter Cards and OpenGraph protocol specifications

#### Testing & Continuous Validation

**Automated Testing:**

- **`__tests__/lib/seo/og-validation.test.ts`**: Comprehensive test suite that runs in CI/CD
  - Validates all page metadata for consistency
  - Tests image URL processing and cache busting
  - Verifies asset consistency and fallback dimensions
  - Warns about missing image files without failing builds

**Manual Cache Clearing:**

- **`scripts/validate-opengraph-clear-cache.ts`**: Utility for forcing Twitter cache refresh
  - Validates OpenGraph metadata for key pages
  - Submits cache clearing requests to Twitter's Card Validator API
  - Handles rate limiting and API response errors gracefully
  - Takes 5-10 minutes for changes to propagate across Twitter's CDN

#### Usage Examples

```bash
# Run OpenGraph validation tests
bun run test __tests__/lib/seo/og-validation.test.ts

# Manual cache clearing after metadata updates
bun run scripts/validate-opengraph-clear-cache.ts

# Add to package.json for convenience
{
  "scripts": {
    "validate-opengraph": "bun run scripts/validate-opengraph-clear-cache.ts"
  }
}
```

#### Integration with Metadata Generation

The validation system integrates seamlessly with the existing metadata pipeline:

```typescript
// Automatic validation in development
import { validateOpenGraphMetadata } from "@/lib/seo/og-validation";

// In lib/seo/opengraph.ts - validation runs automatically in development
if (process.env.NODE_ENV === "development") {
  const validation = validateOpenGraphMetadata(ogMetadata);
  if (!validation.isValid) {
    console.error("OpenGraph validation errors:", validation.errors);
  }
}
```

## Universal OpenGraph Image API

### Overview

The `/api/og-image` endpoint serves as the single source of truth for ALL OpenGraph images in the application, providing a unified interface that handles multiple image sources with comprehensive fallback logic.

### Image Source Hierarchy

The API processes images through a strict priority hierarchy:

1. **Memory Cache** (removed) - Now relies on HTTP cache headers and CDN
2. **S3 Storage** - Pre-persisted images for optimal performance
3. **External Fetch** - Direct HTTP fetch with retry logic
4. **Karakeep Fallback** - Bookmarking service assets (for bookmarks)
5. **Domain Fallback** - Platform-specific default images
6. **Generic Fallback** - Site-wide default OpenGraph image

### API Parameters

- **`url`** (required): S3 key, external URL, or domain URL
- **`assetId`** (optional): Karakeep asset ID for priority handling
- **`bookmarkId`** (optional): Enables domain-specific fallbacks

### Key Features

#### Idempotent Image Persistence

The system ensures reliable, idempotent image storage through:

- **Idempotency Keys**: Generated from URL hash to prevent duplicate S3 uploads
- **Background Persistence**: Non-blocking image uploads to S3
- **Environment-Aware**: `IS_DATA_UPDATER=true` enables synchronous persistence for batch jobs

```typescript
// Example from og-image/route.ts
const urlHash = url.replace(/[^a-zA-Z0-9.-]/g, "_");
const idempotencyKey = `og-image-${urlHash}`;
scheduleImagePersistence(url, OPENGRAPH_IMAGES_S3_DIR, "OG-Image-API", idempotencyKey, url);
```

#### Docker Environment Fix

The API includes a critical fix for Docker environments where `request.url` contains `0.0.0.0`:

```typescript
// Uses getBaseUrl() instead of request.url for redirects
const baseUrl = getBaseUrl();
return NextResponse.redirect(new URL(assetUrl, baseUrl).toString(), { status: 302 });
```

### Reliability Issues with X.com/Twitter

#### Known Issues

1. **Direct Fetch Failures**: X.com frequently blocks or rate-limits OpenGraph scrapers
2. **Inconsistent Metadata**: Twitter's OpenGraph tags are often incomplete or missing
3. **Cache Staleness**: Twitter aggressively caches images, making updates unreliable
4. **API Deprecation**: Twitter's API changes have broken traditional OpenGraph fetching

#### Mitigation Strategies

1. **Proxy Services**: Uses `vxtwitter.com` as fallback (fxtwitter.com deprecated as of 2025)
2. **Multi-Tier Retry**: Attempts direct fetch first, then proxy, then Karakeep fallback
3. **S3 Persistence**: Stores successful fetches to avoid repeated failures
4. **Cache Busting**: Implements versioned URLs to force re-fetches

```typescript
// From lib/opengraph/fetch.ts
if (normalizedUrl.includes("twitter.com/") || normalizedUrl.includes("x.com/")) {
  const proxyUrl = normalizedUrl.replace(/https:\/\/(twitter\.com|x\.com)/, "https://vxtwitter.com");
  // Only use vxtwitter.com - fxtwitter.com returns empty metadata for profiles as of 2025
}
```

### Image Persistence Flow

```
External URL → Fetch → Validate → Transform → S3 Upload → CDN Serve
                 ↓ (fail)
             Proxy Fetch
                 ↓ (fail)
            Karakeep Assets
                 ↓ (fail)
            Domain Fallback
```

### Performance Optimizations

1. **302 Redirects**: Avoids proxying image data through the API
2. **S3 CDN Priority**: Always prefers direct CDN URLs when available
3. **Background Processing**: Non-blocking persistence for web runtime
4. **Idempotent Storage**: Prevents duplicate uploads and wasted bandwidth

### Site Indexing & Submission

#### Generation

- **`app/robots.ts`**: Dynamically generates the `robots.txt` file using a server-side route handler
  - Production: Allows all crawlers, blocks sensitive paths (`/api/`, `/debug/`)
  - Non-production: Blocks all crawlers to prevent indexing of staging sites
- **`app/sitemap.ts`**: Dynamically generates the `sitemap.xml` file at build time
  - Includes: Blog posts, tags, bookmarks, static pages
  - Priorities: Home (1.0), Investments/Projects (0.9), Experience/Education (0.8), Blog/Bookmarks (0.7)
  - Uses frontmatter dates for `lastModified` when available

#### Automated Submission

- **`scripts/submit-sitemap.ts`**: Programmatically submits sitemaps to search engines
  - **Google Search Console**: Uses Webmasters API v3 with Service Account authentication
  - **Bing IndexNow**: Simple GET request with API key verification
  - Features:
    - Production-only execution (checks `NODE_ENV` and `SITE_URL`)
    - Rate limiting (1 second delay between submissions)
    - Retry mechanism with exponential backoff
    - Command line options: `--sitemaps-only`, `--individual-only`, `--all`
- **`scripts/scheduler.ts`**: Orchestrates automated tasks
  - Bookmark refresh: Every 2 hours → triggers sitemap submission
  - **Distributed-Lock Aware**: Before starting a refresh it attempts to acquire the `bookmarks/refresh-lock*.json` object in S3. If another
    instance already holds the lock the scheduler skips this cycle to avoid double-refreshing and duplicate sitemap submissions.
  - GitHub activity: Daily at midnight PT
  - Logo updates: Weekly on Sunday at 1 AM PT
  - Uses `node-cron` with jitter for load distribution

### Metadata Validation

- **`types/seo/metadata.ts`**: Now includes comprehensive Zod validation schemas alongside type definitions:
  - **SEO_LIMITS**: Constants defining optimal character lengths for various metadata fields
  - **Validation Schemas**: `metadataSchema`, `profilePageMetadataSchema`, `collectionPageMetadataSchema`, etc.
  - **Validation Functions**: `validateMetadata()`, `validatePageMetadata()`, `safeValidateMetadata()`
  - **Benefits**: Ensures metadata adheres to SEO best practices, enforces character limits, validates URLs, and provides helpful error messages
  - **UPDATE (2025-07)**: Enhanced with URL security validation to prevent SSRF attacks in metadata URLs

### Supporting Files

- **`lib/seo/constants.ts`**: Centralizes constant values, such as standard field names for metadata, to ensure consistency.
- **`lib/seo/utils.ts`**: Provides helper functions for date formatting (`formatSeoDate`) and URL normalization (`ensureAbsoluteUrl`).
- **`components/seo/json-ld.tsx`**: A simple React component that renders the `JSON-LD` schema into a `<script>` tag in the page's head.
- **Type Definitions (`types/seo/*.ts`)**: A suite of type files that ensure type safety across the entire SEO module. `types/seo.ts` serves as an aggregator, re-exporting types from the other files in its directory.

## Data Flow for a Blog Post

1. `[slug]/page.tsx` calls `getBlogPostMetadata` from `lib/seo/index.ts`.
2. `getBlogPostMetadata` fetches post data and calls `createArticleMetadata` in `lib/seo/metadata.ts`.
3. `createArticleMetadata` orchestrates calls to:
   - `generateSchemaGraph` (`lib/seo/schema.ts`) to build the `JSON-LD` graph.
   - `createArticleOgMetadata` (`lib/seo/opengraph.ts`) to get OpenGraph data.
   - `formatSeoDate` (`lib/seo/utils.ts`) to format timestamps.
4. The aggregated metadata is returned as a `Next.js` `Metadata` object to the page, which Next.js then uses to render the final `<head>` section of the HTML document.

This modular architecture ensures a clear separation of concerns, making the SEO system robust and maintainable.

## Example Usage

### Importing from the Barrel Export

```typescript
// Import everything SEO-related from one place
import { SITE_NAME, createArticleMetadata, validateMetadata, SEO_LIMITS } from "@/lib/seo";

// Validate metadata configuration
const validationResult = safeValidateMetadata(metadata);
if (!validationResult.success) {
  console.error("Metadata validation errors:", validationResult.errors);
}
```

### Validating Page Metadata

```typescript
import { validatePageMetadata } from "@/lib/seo";

// This will throw if validation fails
const validatedHomeMetadata = validatePageMetadata("home", {
  title: "My Site",
  description: "A great website",
  dateCreated: "2024-01-01T00:00:00Z",
  dateModified: "2024-01-01T00:00:00Z",
  bio: "Welcome to my site",
});
```

## Sitemap Generation Details

### Content Sources

The `app/sitemap.ts` file aggregates content from multiple sources:

1. **Static Pages**: Manually defined routes with fixed priorities
2. **Blog Posts**: Fetched from `data/blog/posts.ts` with frontmatter dates
3. **Blog Tags**: Dynamically generated from unique post tags
4. **Bookmarks**: Retrieved from cache or API with domain groupings
5. **Bookmark Tags**: Extracted from bookmark metadata
   - Main tag pages: `/bookmarks/tags/[tagSlug]`
   - Paginated tag pages: `/bookmarks/tags/[tagSlug]/page/[n]`
6. **Paginated Pages**:
   - Bookmark list pages: `/bookmarks/page/[n]`
   - Tag-filtered pages: `/bookmarks/tags/[tagSlug]/page/[n]`

### URL Construction

```typescript
// Example URL patterns generated
https://site.com/                    // Home (priority: 1.0)
https://site.com/blog/post-slug      // Blog posts (priority: 0.7)
https://site.com/blog/tags/tag-slug  // Blog tags (priority: 0.6)
https://site.com/bookmarks/[slug]              // Individual bookmarks (priority: 0.65)
https://site.com/bookmarks/page/2              // Paginated bookmarks (priority: 0.65)
https://site.com/bookmarks/tags/react-native   // Bookmark tags (priority: 0.6)
https://site.com/bookmarks/tags/ai-and-ml/page/2 // Paginated tag pages (priority: 0.55)
```

## Automated Submission Workflow

### Architecture

```mermaid
graph TD
    subgraph "Data Sources"
        A[Blog Posts] --> B[app/sitemap.ts]
        C[Bookmarks API] --> B
        D[Static Routes] --> B
    end

    subgraph "Build Process"
        B -->|Next.js Build| E[/sitemap.xml]
    end

    subgraph "Scheduler (scripts/scheduler.ts)"
        F[node-cron] -->|Every 2 hours| G[Bookmark Refresh]
        G -->|On Success| H[Submit Sitemap]
    end

    subgraph "Submission (scripts/submit-sitemap.ts)"
        H --> I{Production Check}
        I -->|Yes| J[Rate Limiter]
        J --> K[Google Client]
        J --> L[Bing Client]
    end

    subgraph "External APIs"
        K -->|Service Account| M[Google Search Console]
        L -->|API Key| N[Bing IndexNow]
    end

    style F fill:#f9f,stroke:#333,stroke-width:2px
    style I fill:#ccf,stroke:#333,stroke-width:2px
```

### Environment Configuration

| Variable                                | Description                   | Example                                                           | Required For      |
| --------------------------------------- | ----------------------------- | ----------------------------------------------------------------- | ----------------- |
| `GOOGLE_PROJECT_ID`                     | GCP project identifier        | `my-project-123`                                                  | Google submission |
| `GOOGLE_SEARCH_INDEXING_SA_EMAIL`       | Service account email         | `sa@project.iam.gserviceaccount.com`                              | Google submission |
| `GOOGLE_SEARCH_INDEXING_SA_PRIVATE_KEY` | Full private key with headers | `"-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"` | Google submission |
| `INDEXNOW_KEY`                          | Bing IndexNow API key         | `abc123def456`                                                    | Bing submission   |
| `SITE_URL`                              | Production site URL           | `https://williamcallahan.com`                                     | All submissions   |
| `NODE_ENV`                              | Environment indicator         | `production`                                                      | Production check  |

### Setup Requirements

#### Google Search Console

1. Enable "Google Search Console API" in GCP
2. Create Service Account with JSON key
3. Add Service Account email to Search Console property with "Owner" permission
4. Store credentials in environment variables

#### Bing IndexNow

1. Generate unique key for `INDEXNOW_KEY`
2. Create verification file: `public/[KEY].txt` containing only the key
3. Ensure file is accessible at `https://site.com/[KEY].txt`

### Execution Flow

1. **Trigger**: Scheduler runs bookmark refresh every 2 hours
2. **Success Hook**: On successful refresh, triggers sitemap submission
3. **Production Check**: Verifies `NODE_ENV=production` and valid `SITE_URL`
4. **Rate Limiting**: 1-second delay between API calls
5. **Submission**:
   - Google: POST to Webmasters API with sitemap URL
   - Bing: POST request to IndexNow with JSON payload
6. **Error Handling**: Retry with exponential backoff on failure

## Operations & Maintenance

### Monitoring

- **Submission Logs**: Check console output from scheduler process
- **Google Search Console**: Verify sitemap status in web interface
- **Bing Webmaster Tools**: Monitor IndexNow submission results

### Manual Testing

```bash
# Test sitemap generation
bun run build
curl http://localhost:3000/sitemap.xml

# Test submission (dry run)
NODE_ENV=development bun run scripts/submit-sitemap.ts

# Force production submission (use with caution)
NODE_ENV=production SITE_URL=https://williamcallahan.com bun run scripts/submit-sitemap.ts --sitemaps-only
```

### Common Issues

1. **Missing Environment Variables**: Check all required vars are set
2. **Invalid Service Account**: Verify JSON key formatting and permissions
3. **IndexNow 403 Error**: Ensure verification file is publicly accessible
4. **Stale Sitemap**: Build process must complete before submission

## Special Character Handling in URLs

### Tag Slug Generation

The `tagToSlug` function handles special characters in tags to generate SEO-friendly URLs:

| Original Tag | Generated Slug | URL Path                      |
| ------------ | -------------- | ----------------------------- |
| `AI & ML`    | `ai-and-ml`    | `/bookmarks/tags/ai-and-ml`   |
| `C++`        | `c-plus-plus`  | `/bookmarks/tags/c-plus-plus` |
| `C#`         | `c-sharp`      | `/bookmarks/tags/c-sharp`     |
| `.NET`       | `dotnet`       | `/bookmarks/tags/dotnet`      |
| `Node.js`    | `nodedotjs`    | `/bookmarks/tags/nodedotjs`   |
| `Vue@3`      | `vue-at-3`     | `/bookmarks/tags/vue-at-3`    |

### URL Safety

- All generated slugs are URL-safe (lowercase alphanumeric with hyphens)
- Unicode control characters are stripped
- Leading/trailing special characters are handled gracefully
- Empty or whitespace-only tags are filtered out

## External Dependencies & Versions

### Production Dependencies

| Package               | Version | Purpose      | Usage in SEO                                |
| --------------------- | ------- | ------------ | ------------------------------------------- |
| `next`                | 15.1.5  | Framework    | Metadata API, App Router, dynamic routes    |
| `react`               | 19.1.0  | UI library   | Server components for SEO tags              |
| `zod`                 | 3.25.67 | Validation   | Metadata validation, external data parsing  |
| `cheerio`             | 1.1.0   | HTML parsing | OpenGraph tag extraction from HTML          |
| `node-cron`           | 4.2.0   | Scheduling   | Automated sitemap submission (2hr interval) |
| `@aws-sdk/client-s3`  | 3.840.0 | S3 client    | OG image persistence, metadata storage      |
| `google-auth-library` | 10.1.0  | Google APIs  | Search Console API authentication           |
| `schema-dts`          | 1.1.5   | Schema types | TypeScript types for Schema.org             |

### Platform-Specific Requirements

#### Google Search Console

- Service Account with JSON key required
- Search Console API v3 enabled in GCP
- Owner permission on verified property

#### Bing IndexNow

- API key stored as `INDEXNOW_KEY`
- Verification file at `/public/[KEY].txt`
- No authentication beyond key verification

#### S3 Configuration

- Bucket with public read access for images
- CloudFront CDN configured (`NEXT_PUBLIC_S3_CDN_URL` for client, `S3_CDN_URL` for server)
- Proper CORS headers for image serving

## Comprehensive OpenGraph Architecture

### Data Flow Overview

```
1. Page Request → Next.js Metadata API
2. Metadata Generation → Schema.org JSON-LD + OpenGraph tags
3. Image Resolution → og-image API → Multi-tier fallback
4. Social Platform → Crawler → Cache → Display
```

### Critical Design Decisions

#### 1. Universal Image API (`/api/og-image`)

**Problem**: Multiple image sources (S3, external URLs, Karakeep assets) with varying reliability
**Solution**: Single endpoint that normalizes all sources with intelligent fallback
**Trade-offs**: Additional hop for some images, but ensures reliability and consistency

#### 2. Idempotent Persistence

**Problem**: Duplicate S3 uploads wasting bandwidth and storage
**Solution**: Hash-based idempotency keys ensuring each unique image uploaded once
**Trade-offs**: Slightly more complex key generation, but prevents resource waste

#### 3. Environment-Aware Processing

**Problem**: Memory constraints in edge runtime vs batch processing needs
**Solution**: `IS_DATA_UPDATER` flag switches between async (web) and sync (batch) modes
**Trade-offs**: Different code paths, but optimizes for each environment

#### 4. X.com/Twitter Proxy Strategy

**Problem**: Direct OpenGraph fetching frequently blocked by X.com
**Solution**: Fallback to vxtwitter.com proxy service
**Trade-offs**: Dependency on third-party service, but enables reliable Twitter previews

### Memory and Performance Characteristics

- **Image Processing**: Streaming transforms to avoid large buffer allocations
- **Background Persistence**: Non-blocking in web runtime to maintain low latency
- **S3 Direct Serving**: 302 redirects avoid proxying image bytes through API
- **Cache Headers**: Proper HTTP caching reduces redundant fetches

### Monitoring and Operations

#### Health Indicators

- S3 image persistence success rate
- OpenGraph fetch success/failure by domain
- Cache hit rates for persisted images
- API response times and error rates

#### Manual Operations

```bash
# Validate and clear social media caches
bun run scripts/validate-opengraph-clear-cache.ts

# Refresh all bookmark OpenGraph images
bun run scripts/refresh-opengraph-images.ts

# Force sitemap resubmission
NODE_ENV=production bun run scripts/submit-sitemap.ts --all
```

## Performance Characteristics

### Response Times

- **Metadata Generation**: <5ms server-side
- **OG Image API**: ~50-200ms (CDN hit) / ~300-500ms (external fetch)
- **Sitemap Generation**: ~100-200ms for 1000+ URLs
- **Cache Propagation**: 5-10 minutes for social platforms

### Memory Usage

- **No memory caching** for OG images (relies on HTTP/CDN)
- **Streaming HTML parsing** for external OpenGraph
- **Batch processing** uses sync mode to control memory

## 🐛 Bugs & Improvements Inventory

### Type/Validation Issues (HIGH PRIORITY)

1. **Duplicate Type Definition** - `types/seo/metadata.ts:33-38`
   - Impact: `ArticleMetadata` extends `ExtendedMetadata` but redefines `other` property
   - Fix: Remove duplicate property, rely on base type

2. **Missing Zod Validation** - `app/api/og-image/route.ts:159`
   - Impact: S3 data parsed without runtime validation
   - Current: `readJsonS3<UnifiedBookmark[]>(BOOKMARKS_JSON_S3_KEY)`
   - Fix: Add `UnifiedBookmarkSchema.array().parse()` after read
   - **⚠️ PARTIAL FIX (2025-07)**: Created schema directory at `types/schemas/` with initial validation schemas. Full S3 response validation still pending.

3. **Confusing Type Re-exports** - `types/seo/metadata.ts:18-30`
   - Impact: Aliased imports create confusion (e.g., `ProfilePageSchema as ProfileSchema`)
   - Fix: Use direct imports without aliasing

### Performance Issues (MEDIUM PRIORITY)

4. **Synchronous Cheerio Parsing** - `lib/opengraph/parser.ts:58-172`
   - Impact: Large HTML documents block event loop
   - Current: Synchronous `cheerio.load(html)`
   - Fix: Consider streaming HTML parser for large documents

5. **No Request Deduplication** - `lib/opengraph/fetch.ts`
   - Impact: Duplicate OG fetches for same URL
   - Fix: Implement request coalescing like S3 utils

### Missing Features (LOW PRIORITY)

6. **No Dynamic OG Images** - Throughout
   - Impact: Can't generate custom OG images per page
   - Current: Static images only
   - Future: Consider @vercel/og or satori integration

7. **Limited Schema.org Types** - `lib/seo/schema.ts`
   - Impact: No support for Product, Event, Recipe schemas
   - Fix: Add commonly needed schema types

### Code Quality

8. **Missing Image Assets** - `data/metadata.ts`
   - `/images/og/dynamic-fallback.png` (line 89)
   - `/favicon.svg` (line 94)

### ✅ VERIFIED SECURE

- ✅ **Environment Variables**: All use server-only patterns
  - **UPDATE (2025-07)**: Server code now properly uses `S3_CDN_URL` instead of `NEXT_PUBLIC_S3_CDN_URL`
- ✅ **No Hydration Issues**: SEO is server-side only
- ✅ **No Memory Leaks**: Removed memory caching for OG images
- ✅ **Async Handling**: No blocking operations found
- ✅ **URL Validation**: All external URLs validated against SSRF attacks
- ✅ **Path Traversal Protection**: All file paths sanitized

## Operations & Monitoring

### Health Indicators

- **OG Fetch Success Rate**: Track by domain in logs
- **S3 Persistence**: Monitor failed uploads in error logs
- **Sitemap Submission**: Check scheduler logs for API responses
- **Cache Hit Rates**: Available via CDN analytics

### Manual Operations

```bash
# Validate OpenGraph metadata
bun test __tests__/lib/seo/og-validation.test.ts

# Clear social media caches (Twitter/X)
bun run scripts/validate-opengraph-clear-cache.ts

# Force sitemap resubmission
NODE_ENV=production bun run scripts/submit-sitemap.ts --all

# Refresh bookmark OpenGraph images
bun run scripts/refresh-opengraph-images.ts

# Check for missing SEO assets
grep -n "TODO" data/metadata.ts
```

### Common Issues & Solutions

1. **"OG image not updating"**
   - Run cache clear script
   - Check S3 for persisted image
   - Verify og-image API response

2. **"Sitemap not indexed"**
   - Check Google Search Console for errors
   - Verify robots.txt allows crawling
   - Ensure production environment vars set

3. **"Twitter card broken"**
   - Fallback to vxtwitter.com proxy active
   - Check Twitter Card Validator
   - May need manual cache clear

4. **"Missing favicon/OG image"**
   - Create assets marked TODO in data/metadata.ts
   - Follow exact filename conventions
   - Deploy to public/ directory

## Related Documentation

- **[`opengraph.md`](./opengraph.md)**: Deep dive into OG system
- **[`s3-object-storage.md`](./s3-object-storage.md)**: Image persistence details
- **[`caching.md`](./caching.md)**: Cache strategies for SEO
- **[`react-server-client.md`](./react-server-client.md)**: Server component patterns
