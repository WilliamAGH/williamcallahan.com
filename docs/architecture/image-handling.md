# Image Handling Architecture

**Functionality:** `image-handling`

## Purpose

Deliver every logo, OpenGraph card, bookmark preview, profile photo, and social asset with consistent validation, deterministic storage, CDN-ready URLs, and memory-safe handling. This domain begins when a feature needs an image (component/server fetch) and ends when the asset is persisted, cached, and rendered through Next.js or a raw HTTP response.

## Domain Scope & Non-Goals

| Included                           | Notes                                                                                |
| ---------------------------------- | ------------------------------------------------------------------------------------ |
| Logo ingestion, caching, inversion | UnifiedImageService + `/api/logo`, `/api/logo/invert`, manifest warm-up              |
| Bookmark/OG card imagery           | `/api/og-image`, `/api/assets`, `selectBestImage`, Karakeep fallbacks                |
| Social & 3rd-party proxies         | `/api/twitter-image`, external avatar CDNs enumerated in `next.config.ts`            |
| Static placeholder management      | `placeholder-images.ts`, `static-images.ts`, `data/blog/cover-image-map.json`        |
| Memory, SSRF, circuit protections  | Domain failure tracker, `url-utils`, `image-analysis`, streaming threshold           |
| Image metadata/analysis            | `image-metadata.ts`, `image-analysis.ts`, `image-compare.ts`, `svg-transform-fix.ts` |
| Testing/tooling                    | `__tests__/components/ui/logo-image.test.tsx`, placeholder fixtures                  |

_Not included_: raw S3 object layout (see `s3-object-storage`), CSS/layout of cards, or non-image binary storage.

## Pipeline Phases

```
┌─────────────┐
│Discovery    │  components discover candidate URLs (manifests, Karakeep IDs,
└────┬────────┘  placeholder lookups)
     │
     ▼
┌─────────────┐  selectBestImage, manifest helpers choose canonical source,
│Selection    │  enforce env-based host allowlists, attach context (domain/bid)
└────┬────────┘
     │
     ▼
┌─────────────┐  API routes validate params (Zod, sanitizePath, assetIdSchema),
│Fetch &      │  unify to HTTP GET or service call
│Validation   │
└────┬────────┘
     │
     ▼
┌─────────────┐  shared-image-processing detects format, applies SVG fixes,
│Processing   │  image-analysis inspects brightness, compareSignatures dedups
└────┬────────┘
     │
     ▼
┌─────────────┐  image-s3-utils + s3-utils persist buffers or stream directly,
│Persistence  │  update manifests/blocklists/cache tags
└────┬────────┘
     │
     ▼
┌─────────────┐  cdn-utils builds URLs, Next/Image optimizer or API responses
│Delivery     │  send redirect/bytes with cache + security headers
└─────────────┘
```

## Key Workflows

### Logos (Education, Experience, Investments, Bookmarks)

1. Components render `<LogoImage>` with CDN URL from data layer (`lib/data-access/logos.ts`) or manifest.
2. On failure, `LogoImage` extracts the domain (`extractDomainFromSrc`) and hits `/api/logo?website=...&forceRefresh=true`.
3. `/api/logo` sanitizes inputs, short-circuits to existing `cdnUrl`/`s3Key`, else invokes `UnifiedImageService.getLogo()`.
4. UnifiedImageService uses deterministic `generateS3Key`, checks the logo manifest (`image-manifest-loader.ts`), then fans out to direct, Google, DuckDuckGo, Clearbit sources with retry/circuit protections.
5. `image-analysis.ts` / `image-compare.ts` flag globe icons, `FailureTracker` writes to `LOGO_BLOCKLIST_S3_PATH` on repeated failures.
6. Result is persisted/streamed to S3, CDN URL returned, placeholder fallback used only if every source fails.

> **Logo `<Image>` behavior:** Whenever the resolved `src` points at `/api/cache/images` (or any other `/api/*` proxy), `<LogoImage>` sets `unoptimized` so Next.js skips the built-in optimizer. The proxy already resizes/streams logo bytes, and bypassing the optimizer prevents `_next/image` from rejecting nested `/api` URLs (per [Next.js `unoptimized` guidance](https://nextjs.org/docs/app/api-reference/components/image#unoptimized)).

### Bookmark Cards & Sharing Links

1. `selectBestImage` (bookmarks) or `selectBestOpenGraphImage` (OG fetch path) chooses between CDN hashes, Karakeep `imageAssetId`, `screenshotAssetId`, or standard OG URLs.
2. `/api/assets/[assetId]` (Karakeep proxy) validates UUID + context query params, checks S3 via `HeadObjectCommand`, and writes missing assets using `createMonitoredStream` + `writeBinaryS3`.
3. `/api/og-image` handles S3 keys, asset IDs, direct URLs, and bookmark fallbacks. It uses `openGraphUrlSchema`, `sanitizePath`, `IMAGE_SECURITY_HEADERS`, and `getUnifiedImageService().getImage()` for external fetches.
4. `<OptimizedCardImage>` uses Next/Image to render whichever URL results. If the URL points to `/api/assets` or `/api/og-image`, the API response returns a CDN redirect or raw bytes with 1-year TTLs.

### Social / Twitter Proxy

- `/api/twitter-image/[...path]` ensures paths match `profile_images|media|ext_tw_video_thumb` with strict extension checks, sanitizes segments, preserves query params, and delegates to `getImage()` with type hints for S3 key namespaces (e.g., `twitter-media`).
- Cache headers allow 24h `max-age` plus 7-day `stale-while-revalidate` to avoid hammering Twitter’s CDN.

### Validation & Tooling

- `/api/validate-logo` accepts form uploads or URLs, reuses `getImage()` + `image-analysis.ts` to detect globe placeholders and updates cache via `setLogoValidation`.
- `__tests__/components/ui/logo-image.test.tsx` ensures retries/placeholders behave as expected.

## Data Sources & Manifests

| Artifact                  | Location                                                                           | Usage                                                                       |
| ------------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Logo manifest             | `IMAGE_MANIFEST_S3_PATHS.LOGOS_MANIFEST`, loaded by `image-manifest-loader.ts`     | Domain -> CDN/inverted URLs, reduces cold fetches.                          |
| Blog cover map            | `data/blog/cover-image-map.json`, generated by `scripts/sync-blog-cover-images.ts` | Maps local `/public/images/posts/**` names to S3 keys for MDX frontmatter.  |
| Static image mapping      | `lib/data-access/static-image-mapping.json`                                        | Legacy placeholders resolved via `getStaticImageUrl`.                       |
| Bookmark snapshots        | `bucket/json/bookmarks/*.json`                                                     | Provide `ogImage`, Karakeep IDs, screenshot metadata for selection helpers. |
| Blocklists & retry queues | `LOGO_BLOCKLIST_S3_PATH`, UnifiedImageService upload retry map                     | Prevent repeated failures and ensure eventual persistence.                  |

## Core Modules & Responsibilities

- **`lib/services/unified-image-service.ts`** – orchestrates everything: domain session tracking, memory checks, streaming fallback, CDN URL generation, Next cache invalidation (`revalidateTag`).
- **`lib/image-handling/image-s3-utils.ts`** – idempotent persistence (checks existing S3 keys, handles base64 data), fallback recrawl triggers for Karakeep assets.
- **`lib/image-handling/shared-image-processing.ts`** – format detection, SVG sanitization, metadata-derived content types.
- **`lib/image-handling/image-analysis.ts` / `image-compare.ts`** – brightness estimation, placeholder detection, perceptual hashing for dedupe/globe detection.
- **`lib/image-handling/image-manifest-loader.ts` / `cached-manifest-loader.ts`** – load and cache manifest JSON for logos/OG/blog images; aware of build-phase constraints (`LOAD_IMAGE_MANIFESTS_DURING_BUILD`).
- **`lib/services/image-streaming.ts`** – Node stream -> S3 upload pipeline with timeouts and byte monitoring.
- **`components/ui/logo-image.client.tsx`** – client watchdog: inlined placeholders, dev logging, on-error fetch triggers, CSS inversion toggles.
- **`components/features/*`** – feed selection helpers (bookmarks/blog/investments/education/experience) and ensure width/height/sizes align with Next config.

## Security & Reliability Invariants

1. **SSRF Defense** – `openGraphUrlSchema`, `assetIdSchema`, `sanitizePath`, `isLogoUrl`, and `url-utils` block private IP ranges, non-HTTP schemes, credentials, suspicious ports.
2. **Hostname Allowing** – All remote origins must appear in `CALLAHAN_IMAGE_HOSTS` or explicit `remotePatterns`. CDN URL validation compares parsed host + base path to prevent prefix spoofing before proxying requests. Adding a CDN requires updating env vars + `next.config.ts`.
3. **Memory Headroom** – `getMemoryHealthMonitor().shouldAcceptNewRequests()` gate exists in `getImage`, `getLogo`, streaming fallback, and S3 writes to prevent OOMs.
4. **Streaming Re-fetch** – When a streaming upload consumes the response body and fails, the image service re-fetches before buffering; Response bodies are single-use, so buffering must use a fresh fetch.
5. **Circuit Breaker** – `FailureTracker` + session maps block domains after repeated failures for 30 minutes, preventing infinite loops (e.g., recursive redirects).
6. **Cache Safety** – Hashed filenames, `Cache-Control` invariants, and Next’s `minimumCacheTTL` ensure once persisted assets remain stable. Placeholders always available locally.
7. **SVG Hygiene** – `svg-transform-fix.ts` rewrites transforms; `dangerouslyAllowSVG` is acceptable because only vetted assets are stored and we treat user input as untrusted (validated + sanitized).
8. **Testing Hooks** – `DEV_DISABLE_IMAGE_PROCESSING`, `DEV_STREAM_IMAGES_TO_S3` allow safe local debugging without hammering S3.

## Operational Tasks

| Task                         | Command / File                                                                                                                              | Details                                                                                     |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Sync blog covers -> S3       | `bun scripts/sync-blog-cover-images.ts`                                                                                                     | Hashes local `/public/images/posts/**`, uploads via `writeBinaryS3`, updates manifest JSON. |
| Warm manifests               | Automatic via `instrumentation-node.ts` / `loadImageManifests()`                                                                            | Set `LOAD_IMAGE_MANIFESTS_AT_BOOT=false` if memory constrained; lazy loading still works.   |
| Purge logo cache             | `resetLogoSessionTracking()` / `invalidateLogoCache()`                                                                                      | Use via Node REPL or targeted script; ensures next request refreshes from origin.           |
| Investigate SSRF regressions | Review `url-utils` + `openGraphUrlSchema`; add tests under `__tests__/lib/validators`.                                                      |
| Add new CDN host             | Update env (`CALLAHAN_IMAGE_HOSTS` or `NEXT_PUBLIC_S3_CDN_URL`), rerun `bun run validate` to ensure lint rule `no-hardcoded-images` passes. |

## Integration with Adjacent Domains

- **S3 object storage**: Understand bucket layout, ACLs, and distributed lock behavior in [`s3-object-storage.md`](./s3-object-storage.md).
- **Unified stack map**: The holistic flow (client -> Next -> API -> service -> S3/CDN) lives in [`s3-image-unified-stack.md`](./s3-image-unified-stack.md).
- **Next.js 16 policies**: See `docs/projects/structure/next-js-16-usage.md` for caching, cache components, and outlawed patterns before changing API routes or components.

## Idempotency & Determinism (Deep Dive)

Ensures education and experience domains ALWAYS fetch institution/company logos from S3 CDN idempotently - same domain input always produces same CDN URL output, preventing duplicate fetches and ensuring consistent branding.

### Key Mechanisms

1.  **Deterministic S3 Keys**: `lib/utils/s3-key-generator.ts` generates deterministic keys from domain+source+hash (`unified-image-service.ts:575-582`).
2.  **In-Flight Deduplication**: `unified-image-service.ts:170-177` prevents concurrent fetches for the same domain by sharing Promises.
3.  **Pre-flight S3 Check**: `unified-image-service.ts:201-238` checks existing S3 keys before external fetch to avoid unnecessary API calls.
4.  **Domain Normalization**: `lib/utils/domain-utils.ts` normalizes URLs to consistent domains (case-insensitive) for consistent caching.

### Idempotency Risks & Mitigations

- **Non-Deterministic Hash**: Uses both SHA-256 (preferred) and MD5 (legacy support).
- **Multiple Sources**: Same domain may have different S3 keys for google vs duckduckgo sources.
- **Session Tracking**: `unified-image-service.ts:48-52` prevents repeated failures in the same session (30min reset).

Keep this document synchronized with real code: every new image entry point, validator, or S3 directory must be recorded here with file references so future debugging starts from truth instead of guesswork.

## Next.js Optimizer Guardrails

- **Optimizer only touches CDN URLs.** The only values that flow through `<Image>`'s optimizer are HTTPS URLs that already live on our CDN and conform to `images.remotePatterns`. Any `/api/*` proxy (e.g., `/api/cache/images`, `/api/logo`, `/api/og-image`) sets `unoptimized` so the Image component treats the resource like a regular `<img>` and we avoid `_next/image` rejecting the request as “not allowed.” ([Next.js Image Component docs](https://nextjs.org/docs/app/api-reference/components/image))
- **`next.config.ts` is the source of truth.** `images.localPatterns` **must** keep `/api/cache/images` and `/api/assets` listed, and we only add real CDN hostnames to `images.remotePatterns`. This satisfies the [Next.js Image Optimization requirements](https://nextjs.org/docs/app/building-your-application/optimizing/images) and ensures the optimizer never fetches untrusted origins.
- **API routes always stream bytes.** `/api/cache/images` resolves CDN redirects server-side, decodes double-encoded `url` params, and streams the body so `_next/image` never receives a 302 or malformed query string. If the CDN request fails, we return an explicit 5xx with context.
- **Streaming fallback for empty buffers.** When the image service streams directly to S3 and returns an empty buffer, `/api/cache/images` treats it as a CDN-backed response and streams the CDN bytes instead of returning a 0-byte body.
- **Placeholders stay static.** Anything under `/images/**` in `public/` is imported statically so Next infers width/height and we skip runtime optimization entirely, per the Image component spec.

Document every policy change here **before** merging code. If a future regression appears, first check this section and `next-js-16-usage.md` to keep the rules consistent.
