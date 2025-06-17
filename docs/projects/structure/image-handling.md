# Image Handling Architecture

**Functionality:** `image-handling`

## Core Objective

To provide a robust and centralized system for fetching, analyzing, processing, and serving images, with a primary focus on company logos and OpenGraph images. This functionality ensures visual consistency, performance, and adaptability across different application themes (light and dark).

## Recently Resolved Issues (2025-06)

### ✅ FIXED: Unified OG Image Handling
- **Previous Issue**: Multiple endpoints handled OpenGraph images inconsistently
- **Solution**: Created `/api/og-image` as single source of truth for ALL OG images
- **Impact**: Consistent image handling across bookmarks, blog posts, and external integrations

### ✅ FIXED: Animated Image Preservation
- **Previous Issue**: GIF and animated WebP files were converted to static PNG
- **Solution**: Updated `processImageBuffer` to detect and preserve animated formats
- **Impact**: Animated logos and images now display correctly

### ✅ FIXED: NextResponse.redirect Errors
- **Previous Issue**: Relative URLs caused "URL is malformed" errors
- **Solution**: All redirects now use absolute URLs via `new URL(path, request.url).toString()`
- **Impact**: Proper fallback handling without errors

### ✅ FIXED: Clean Error Logging
- **Previous Issue**: Expected errors showed full stack traces
- **Solution**: Differentiate between expected and unexpected errors
- **Impact**: Cleaner logs, easier debugging

## Critical Security Vulnerabilities

### 🔴 CRITICAL Issues Requiring Immediate Fix

1. **Server-Side Request Forgery (SSRF) - Multiple Locations**
   - **Location**: `app/api/cache/images/route.ts:73` - Open proxy allowing any URL
   - **Location**: `app/api/logo/invert/route.ts:29` - Allows internal API access via `/api` paths
   - **Location**: `lib/data-access/logos/external-fetch.ts:91` - User-controlled domains
   - **Risk**: Attackers can scan internal networks, access metadata services, use server as proxy
   - **Fix**: Implement DNS resolution with private IP blocking, remove `/api` special handling

2. **Path Traversal Vulnerabilities**
   - **Location**: `app/api/twitter-image/[...path]/route.ts:80` - Regex allows `.` character
   - **Location**: `app/api/assets/[assetId]/route.ts:51` - Unsanitized assetId parameter
   - **Location**: `lib/data-access/logos/s3-operations.ts:41` - S3 key construction
   - **Risk**: Access to unintended resources, arbitrary file read/write
   - **Fix**: Explicit `..` blocking, path normalization, sanitize IDs

3. **Denial of Service via Large Images**
   - **Location**: `app/api/cache/images/route.ts:111` - No size limits
   - **Location**: `app/api/logo/invert/route.ts` - No size limits
   - **Risk**: Memory exhaustion, CPU overload
   - **Fix**: Check Content-Length header, enforce 10MB limit

4. **SVG XSS Vulnerability**
   - **Risk**: Malicious SVG files can execute scripts
   - **Fix**: Implement server-side SVG sanitization

5. **SSRF via Open Redirects**
   - **Location**: `app/api/og-image/route.ts:71` - fetch follows redirects
   - **Risk**: Bypass host validation via redirects on allowed domains
   - **Fix**: Set `redirect: 'error'` in fetch options

## Architecture Diagram

See `image-handling.mmd` for a visual diagram of the image processing pipeline.

## Architectural Overview & Flow

The image handling pipeline is a multi-step process that takes a domain or URL and produces an optimized, theme-appropriate image.

1. *Multi-Source Fetching**: For a given domain or URL, the system attempts to fetch an image from a prioritized list of external providers (e.g., Google, Clearbit for logos) or by parsing `og:image` tags from web pages.

2. *Validation & Placeholder Fallback**: Fetched images are validated against known generic placeholder icons using perceptual hashing (`lib/imageCompare.ts`). If an image is invalid or not found, a default placeholder is used to ensure UI consistency.

3. *Analysis & Processing**: Valid images are processed using the Sharp library (`lib/imageAnalysis.ts`). This includes:
    - Theme Analysis**: Calculating image brightness to determine suitability for light or dark themes.
    - Color Inversion**: Automatically generating a color-inverted version if contrast is low for an alternate theme.
    - Format Standardization**: Converting all images to a standard format like WebP for optimization.

4. *Delivery**: Processed images are delivered to the UI, with caching and persistence handled by core underlying systems.

## Core Systems Interaction

This system acts as an orchestrator, relying on several other core functionalities:

- **Caching (`caching.md`)**: All processed image data, fetch results (both success and failure), and analysis metadata are stored in an in-memory `ServerCacheInstance`. This significantly reduces latency on subsequent requests by avoiding redundant processing and network calls.
  - **Multi-Tier Architecture**: Memory Cache (~1ms) → S3 Storage (~10-50ms) → External APIs (100ms-5s)
  - **TTL Strategy**: Success results cached for 30 days, failures for 1 day
  - **Request Coalescing**: Prevents duplicate concurrent fetches for the same resource
  - **Known Issues**: No memory limits (#115), no S3 refresh mechanism for stale logos

- **Storage (`s3-object-storage.md`)**: All final image assets (both original and inverted versions) are persisted in an S3 bucket. All S3 operations are delegated to the `s3-object-storage` functionality, which handles the complexities of uploading files with public-read access and managing content types.

## Key API Routes

The functionality is exposed through several dedicated API endpoints:

### Logo Management
- **`/api/logo`**: Primary endpoint for fetching company logos
  - Orchestrates fetch → validate → process → cache → store pipeline
  - Query params: `website`, `company`, `forceRefresh`
  - Uses unified `getLogo()` from data access layer
  - Returns image buffer with appropriate content-type
  - **Active Usage**: Investment cards use this endpoint for dynamic logo fetching

- **`/api/logo/invert`**: Theme-aware logo inversion
  - GET: Returns inverted logo image based on theme
  - HEAD: Checks if inversion is needed without processing
  - Query params: `url`, `theme` (light/dark)
  - Caches both analysis results and inverted images

### Image Proxying & Caching
- **`/api/cache/images`**: Generic image optimization and caching
  - **🔴 CRITICAL**: Open proxy vulnerability - accepts any URL
  - Processes images with Sharp for optimization
  - Supports format conversion (webp, avif, png, jpg)
  - Query params: `url`, `width`, `format`

- **`/api/assets/[assetId]`**: External service asset proxy
  - Proxies requests to bookmarks API for screenshots
  - **🔴 SECURITY**: Path traversal vulnerability in assetId
  - Streams responses to avoid memory overhead
  - Protects bearer token from client exposure

### OpenGraph & Social Images
- **`/api/og-image`**: Universal OpenGraph image endpoint (2025-06 complete rewrite)
  - **NEW**: Single source of truth for ALL OpenGraph images across the application
  - Multi-input support:
    - S3 keys (e.g., `opengraph/images/example.png`) → CDN redirect
    - Karakeep asset IDs (e.g., `abc-123-def`) → Asset proxy
    - External URLs (e.g., `https://github.com`) → Fetch & persist
  - Hierarchy: Memory cache → S3 storage → External fetch → Karakeep fallback
  - Security enhancements:
    - Fixed SSRF vulnerabilities with proper validation
    - Domain allowlisting (development allows localhost)
    - 10MB size limits with Content-Length checks
    - Content-Type validation
    - 10s timeout protection
  - Performance optimizations:
    - Response streaming with background S3 persistence
    - Response cloning for non-blocking uploads
    - S3 existence cache (5-minute TTL)
  - Contextual fallbacks:
    - Person placeholder for profile URLs
    - OpenGraph card placeholder for OG-specific failures
    - Company placeholder as default
  - Preserves animated formats (GIF, WebP)
  - Query params: `url`, `assetId`, `bookmarkId`

### Internal Utilities
- **`/api/twitter-image/[...path]`**: Twitter image proxy (referenced but not found)
- **`/api/validate-logo`**: Logo validation endpoint (referenced but not found)

## Key Files & Responsibilities

### Fetching & Data Access

- **`lib/logo-fetcher.ts`**: Fetches logos from external sources
- **`lib/data-access/logos.ts`**: Manages data access lifecycle for logos
  - Multi-stage caching (memory, S3, external)
  - Retry logic with exponential backoff
  - Request coalescing
- **`lib/data-access/opengraph.ts`**: Fetches and parses OpenGraph data
- **`lib/data-access/logos/external-fetch.ts`**: External API integration
- **`lib/data-access/logos/config.ts`**: Logo source configuration

### Analysis & Processing

- **`lib/imageAnalysis.ts`**: Analyzes image properties using Sharp
  - Brightness calculation for theme suitability
  - Color analysis for inversion decisions
- **`lib/imageCompare.ts`**: Perceptual hash comparison
  - Detects generic placeholders
  - **Issue**: Returns false for both errors and mismatches
- **`lib/data-access/logos/image-processing.ts`**: Image transformations
  - Format conversion (SVG → PNG)
  - Color inversion
  - Resizing and optimization

### Core Logic & Integration

- **`lib/logo.ts`**: Client-side logo management
- **`lib/logo.server.ts`**: Server-side helpers
  - **Issue**: Overlapping functionality with logo-fetcher.ts
- **`lib/hooks/use-logo.ts`**: React hook for component integration
- **`components/ui/logo-image.client.tsx`**: Logo display component
  - **Issue**: Missing `sizes` prop for Next.js Image

### Utilities

- **`lib/utils/opengraph-utils.ts`**: OpenGraph image utilities
- **`lib/utils/svg-transform-fix.ts`**: SVG correction utilities
- **`lib/hooks/use-fix-svg-transforms.ts`**: React hook for SVG fixes
  - **Issue**: MutationObserver performance concerns

### Type Definitions

- **`types/logo.ts`**: TypeScript interfaces for logos

### Static Assets

- **`public/images/*`**: Static image files
  - Company logos and placeholders
  - Social media banners and profile images
  - Blog post images and screenshots
  - Reference icons for perceptual hashing

- **`public/logos/*`**: Cached logo files
  - Named with hash-source pattern (e.g., `hash-google.png`)
  - Persisted locally for build-time optimization

- **`public/fonts/*`**: Font files (directory not present)

## Architectural Issues

1. **Circular Dependencies**
   - `logo-fetcher.ts` and `logo.server.ts` contain overlapping functionality
   - `normalizeDomain` function duplicated across files
   - Complex conditional logic based on `IS_BUILD_PHASE`

2. **Ambiguous Error Handling**
   - `imageCompare.ts` returns `false` for both mismatches and errors
   - Makes debugging difficult and hides processing failures

3. **Race Conditions**
   - S3 logo key cache initialization not atomic
   - Multiple concurrent requests trigger redundant S3 API calls

4. **Performance Concerns**
   - MutationObserver in `useFixSvgTransforms` observes entire subtrees
   - No debouncing for frequent DOM updates
   - Redundant content type detection

## Data Flow

```
Domain/URL → Check Memory Cache → HIT? Return (~1ms)
     ↓              ↓ MISS
     ↓         Check S3 → HIT? Cache in Memory & Return (~10-50ms)
     ↓              ↓ MISS  
     ↓         Check In-Flight? → Yes? Wait for Promise
     ↓              ↓ No
     ↓         External APIs → Fetch & Validate → Analyze → Process
     ↓                                                         ↓
     ↓                                                    Store in S3
     ↓                                                         ↓
     └────────────────────────────────────────────> Cache in Memory → Serve
```

### Investment Card Logo Loading

1. **Server Component Render**: `InvestmentCard` component calls `getLogo(domain)`
2. **Cache Check**: Memory cache checked first (ServerCacheInstance)
3. **S3 Fallback**: If memory miss, checks S3 for previously stored logo
4. **External Fetch**: If S3 miss, fetches from external APIs
5. **Caching**: Successful fetches cached for 30 days, failures for 1 day
6. **Build-Time Prefetch**: Scripts populate S3 during build to minimize runtime fetches

## Security Recommendations

1. **Immediate Actions Required**:
   - Implement allow-list for image URLs instead of accepting any URL
   - Add DNS resolution to block private IPs (10.x, 172.16.x, 192.168.x, 127.x)
   - Implement size limits (10MB) via Content-Length header checks
   - Add path sanitization to prevent traversal attacks
   - Disable redirect following or validate final URLs

2. **Best Practices**:
   - Use dedicated image CDN instead of proxying
   - Implement rate limiting on all image endpoints
   - Add request signing for internal image operations
   - Log all image requests for security monitoring
   - Implement SVG sanitization library

3. **Architecture Improvements**:
   - Consolidate duplicate functionality in logo files
   - Fix ambiguous error handling in imageCompare
   - Add atomic operations for S3 cache initialization
   - Implement request coalescing for concurrent fetches (partially implemented)
   - Add performance monitoring and alerting
   - Implement logo refresh mechanism for stale S3 entries
   - Add memory limits to ServerCacheInstance (Issue #115)
