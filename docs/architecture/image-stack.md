# S3 & Image Unified Stack

**Functionality:** `s3-image-unified-stack`

## Mission & Boundaries

Provide a single, verifiable description of how UI components, Next.js runtime features, API routes, shared services, and DigitalOcean Spaces cooperate to fetch, validate, process, persist, and deliver every image rendered on williamcallahan.com. This document is the canonical “map” that ties together the `image-handling` and `s3-object-storage` domains; update it first whenever a new image flow or storage rule appears.

## Canonical Flow Map

```
┌───────────────┐      ┌────────────────────┐      ┌─────────────────────────┐
│Client Surfaces│      │Next/Image Runtime   │      │API Surface (app/api/*)  │
│LogoImage,      ├──HTTP│/_next/image,        ├──RPC │logo, logo/invert         │
│OptimizedCard...│      │remotePatterns guard │      │cache/images, og-image,  │
└──────┬────────┘      └──────────┬──────────┘      │twitter-image, assets     │
       │                          │                 └──────────┬──────────────┘
       │                          │                            │calls
       ▼                          ▼                            ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                   UnifiedImageService & Helpers                            │
│ lib/services/unified-image-service.ts                                      │
│  • Request dedupe • domain circuit breaker • image/logo routing            │
│  • fetchWithTimeout + DEFAULT_IMAGE_HEADERS                                │
│  • maybeStreamImageToS3 (lib/services/image-streaming.ts)                  │
│  • shared-image-processing.ts / image-analysis.ts / image-compare.ts      │
│  • cdn-utils.ts + hash-utils.ts + url-utils.ts                             │
└──────────┬─────────────────────────────────────────────────────────────────┘
           │ writes/reads via
           ▼
┌────────────────────────────────────────────────────────────────────────────┐
│S3 Access Layer                                                             │
│ lib/s3/* (AWS SDK v3 client, object/json/binary helpers, errors/config)    │
│ lib/image-handling/image-s3-utils.ts (idempotent persists, manifests)      │
│ lib/persistence/s3-persistence.ts (JSON/Binary ACL control)                │
└──────────┬─────────────────────────────────────────────────────────────────┘
           │stores keys under
           ▼
┌────────────────────┐      ┌──────────────────────────┐      ┌──────────────┐
│DigitalOcean Spaces │──────│CDN (NEXT_PUBLIC_S3_CDN_URL)│────│Browser Cache │
│ buckets/images/**  │      │+ Next minimumCacheTTL     │      │(per response)│
└────────────────────┘      └──────────────────────────┘      └──────────────┘
```

## Layer Inventory

| Layer              | Primary Modules                                                                                                                                                           | Responsibilities                                                                                                                                                                                                                                |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Client rendering   | `components/ui/logo-image.client.tsx`, `components/features/*/bookmark-card.client.tsx`, `components/features/home/profile-image.tsx`                                     | Choose image source, trigger retries, call `/api/logo` on failure, honor placeholders, rely on `<Image>` with config-mandated widths/qualities.                                                                                                 |
| Next runtime       | `next.config.ts` (`images.localPatterns/remotePatterns/qualities/formats`)                                                                                                | Define which URLs `_next/image` may fetch, enforce `minimumCacheTTL`, `dangerouslyAllowSVG`, and remote host allowlists derived from env-driven CALLAHAN hosts.                                                                                 |
| HTTP surface       | `app/api/logo`, `app/api/logo/invert`, `app/api/cache/images`, `app/api/og-image`, `app/api/assets/[assetId]`, `app/api/twitter-image/[...path]`, `app/api/validate-logo` | Normalize params, validate with Zod schemas, send cache headers, short-circuit to CDN, and delegate to the service or S3 utils.                                                                                                                 |
| Service core       | `lib/services/unified-image-service.ts`, `lib/services/image-streaming.ts`, `lib/image-handling/*.ts`, `lib/utils/*.ts`                                                   | Domain-aware routing (logos vs OG vs generic), memory/circuit safeguards, stream >5 MB downloads directly to S3, metadata extraction, inversion analysis, manifest lookups, deterministic S3 key generation, CDN URL building, SSRF prevention. |
| Persistence        | `lib/s3/*`, `lib/image-handling/image-s3-utils.ts`, `lib/persistence/s3-persistence.ts`, `lib/data-access/images.server.ts`                                               | Execute AWS SDK reads/writes with SDK retries, lock coordination, JSON and binary helpers, cache tagging. No CDN fallback inside S3 IO.                                                                                                         |
| Storage & delivery | DigitalOcean Spaces buckets + CDN edge + browser cache                                                                                                                    | Keep immutable assets, respect `Cache-Control` configured via Next + API responses, propagate hashed keys for safe long-lived caching.                                                                                                          |

## Lifecycle Examples

### 1. Bookmark Card Preview

1. `selectBestImage()` (`lib/bookmarks/bookmark-helpers.ts`) prefers CDN URLs, then `/api/assets/{id}` with context query params, finally OG fallbacks.
2. `<OptimizedCardImage>` renders the chosen URL via `<Image>`; `next/image` validates against `remotePatterns` before calling `_next/image`.
3. `_next/image` either serves from its cache or fetches the remote URL (e.g., `/api/assets/...`).
4. `/api/assets/[assetId]` validates UUID + query context, checks S3 using `HeadObjectCommand`, streams upstream content with `createMonitoredStream`, and persists via `writeBinaryS3` if missing.
5. UnifiedImageService is not involved unless the upstream asset requires additional processing; CDN URLs are returned immediately for repeat views.

### 2. Logo Rendering & Auto-Healing

1. `<LogoImage>` receives a CDN path (`/logos/foo_com_google_ab12cd34.png`). If loading fails, it derives the domain via `extractDomainFromSrc()`, fires `/api/logo?website=foo.com&forceRefresh=true`, and retries with a cache buster.
2. `/api/logo` normalizes `website`/`company` (rejects non-FQDN company fallbacks), then calls `getLogo()` on UnifiedImageService.
3. UnifiedImageService checks `ServerCacheInstance`, manifest entries, and existing S3 objects (`generateS3Key` per source). If missing and writes allowed, it fans out to Google/DuckDuckGo/Clearbit, analyzes the buffer, streams to S3 if large, and records CDN URLs.
4. Response is always a redirect to CDN (or placeholder via `getStaticImageUrl`). Future loads hit the CDN and skip the service entirely.

### 3. OG Image Fetch via `/api/og-image`

1. Route inspects `url`, `assetId`, `bookmarkId`, performing validation via `openGraphUrlSchema` and bookmark manifests.
2. Karakeep asset IDs redirect to `/api/assets/{id}`; raw S3 keys are checked with `HeadObjectCommand` before redirecting to CDN.
3. If an external URL must be fetched, the route builds a normalized request, then relies on UnifiedImageService’s `getImage()` for processing/persistence.
4. Headers enforce long-lived caching plus `IMAGE_SECURITY_HEADERS`.

## Data Artifacts & Mapping

| Artifact                                                         | Purpose                                                          | Produced by                                        | Consumed by                                             |
| ---------------------------------------------------------------- | ---------------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------- |
| `static-image-mapping.json` (`lib/data-access/static-images.ts`) | Maps legacy `/public/images/**` to hashed CDN URLs.              | `scripts/sync-blog-cover-images.ts` (during CI)    | Placeholder utilities, SEO defaults, API fallbacks.     |
| Logo manifest (`IMAGE_MANIFEST_S3_PATHS.LOGOS_MANIFEST`)         | Cached set of known domains -> CDN URLs (and inverted variants). | Instrumentation warm-up via `loadImageManifests()` | UnifiedImageService, `/api/logo`, analytics dashboards. |
| Bookmark/OG JSON snapshots (`bucket/json/**`)                    | Provide data for API selection + caching.                        | Background batch processors                        | `/api/og-image`, bookmark rendering.                    |
| Domain blocklist (`LOGO_BLOCKLIST_S3_PATH`)                      | Prevents repeated fetch attempts against failing domains.        | `FailureTracker` inside UnifiedImageService        | All logo requests.                                      |

## Cache & CDN Rules

- **Next Image Optimizer**: `qualities: [75,80,90,100]`, `minimumCacheTTL: 7 days`, local patterns for `/api/assets`, `/api/logo`, `/api/logo/invert`, `/api/og-image` ensure `_next/image` can only wrap approved endpoints.
- **API Responses**: Logos default to `301` (immutable CDN), cache/images to `Cache-Control: public, max-age=31536000, immutable`, Twitter proxy to `stale-while-revalidate` for a week.
- **Manifests & Data**: `cacheLife("Images", "weeks")` and granular `cacheTag` names allow targeted invalidation via `revalidateTag()`.
- **CDN + Browser**: hashed keys (e.g., `logos/foo_com_google_ab12cd34.png`) guarantee safe `max-age=31536000` across CDN and browser caches.

## Security & Validation Checklist

1. **URL Guardrails** – `openGraphUrlSchema`, `assetIdSchema`, `sanitizePath()`, and the SSRF blockers inside `url-utils` ensure only HTTP/S public hosts are reachable.
2. **Host Allowlists** – Remote hosts must exist in `CALLAHAN_IMAGE_HOSTS`, derived env hosts, or explicit social/CDN patterns defined in `next.config.ts`.
3. **Private Network Blocking** – UnifiedImageService rejects private IPs before fetch; `ImageAnalysis` enforces buffer size limits (<512 KB for validation endpoints).
4. **Content-Type Enforcement** – `IMAGE_SECURITY_HEADERS`, `guessImageContentType`, and `processImageBufferSimple` stop non-image payloads from reaching clients.
5. **Memory Pressure Controls** – `getMemoryHealthMonitor()` gates fetches/uploads; streaming path keeps peak usage bounded.
6. **Placeholder Safety** – If any stage fails, we redirect to data URI or `/images/opengraph-placeholder.png` via `getStaticImageUrl` to avoid broken UI.

## Operations & Runbooks

| Task                         | Command / File                                                                                                                     | Notes                                                                                                    |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Refresh blog cover mappings  | `bun scripts/sync-blog-cover-images.ts`                                                                                            | Uploads `/public/images/posts/**`, regenerates `data/blog/cover-image-map.json`, warns about collisions. |
| Validate Next image config   | `bun run validate` + manual review of `next.config.ts`                                                                             | Ensure new CDNs/domains are added to `remotePatterns`.                                                   |
| Inspect manifests at runtime | `instrumentation-node.ts` logs manifest counts after `loadImageManifests()`                                                        | Verify via `console.log` or `bun run dev` startup output.                                                |
| Purge specific CDN asset     | Use `invalidateImageCache('images/...')` or delete S3 key; Next/Image caches must also be cleared if `_next/image` served the URL. |
| Investigate logo issues      | Hit `/api/logo?website=foo.com&forceRefresh=true` and inspect headers (`x-logo-error`, `x-logo-domain`).                           |

## Cross-References

- **Image domain details** -> [`docs/architecture/image-handling.md`](./image-handling.md)
- **Raw storage policies** -> [`docs/architecture/s3-storage.md`](./s3-storage.md)
- **CSP + Next.js guardrails** -> `docs/standards/nextjs-framework.md`

Keep this document synchronized with the other two structure docs whenever you introduce a new image input, a new storage directory, or change CDN/Next settings.

## Next.js Optimizer Contract

1. **CDN URLs go through `/_next/image` for optimization.** Images from our CDN (`s3-storage.callahan.cloud`, `*.digitaloceanspaces.com`, `*.callahan.cloud`) MUST use direct URLs without `unoptimized` so Next.js performs resize + WebP conversion. Sharp reduces 2MB images to ~50KB.

2. **API routes set `unoptimized`.** Only `/api/logo`, `/api/cache/images` (for external URLs), and `/api/og-image` use `unoptimized` because these routes already process/stream the image.

3. **`sizes` prop is mandatory.** Every `<Image>` component MUST include a `sizes` prop that reflects actual display dimensions. Without it, srcset generation is suboptimal.

4. **`remotePatterns` is the allowlist.** Every CDN hostname must be in `next.config.ts` `images.remotePatterns`. PRs adding hosts must update this config.

5. **NEVER proxy CDN images.** Using `buildCachedImageUrl()` on CDN URLs routes them through `/api/cache/images` which requires `unoptimized`, defeating optimization entirely. Use `getOptimizedImageSrc()` instead.

6. **Static imports stay static.** Assets in `public/` are statically imported so Next infers width/height.

Any change to these rules must update this section, `image-handling.md`, and `docs/standards/nextjs-framework.md` in the same PR.
