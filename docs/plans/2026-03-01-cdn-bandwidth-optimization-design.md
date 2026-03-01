# CDN & S3 Bandwidth Optimization Design

**Date**: 2026-03-01
**Problem**: >500 GB/month DigitalOcean Spaces bandwidth; many requests bypass CDN.

## Root Causes

1. **Cloudflare Free doesn't cache `/_next/image`** — URLs lack file extensions,
   so CF passes every request through to the Next.js server
2. **`/api/assets` uses AWS SDK `GetObjectCommand`** — every Karakeep bookmark
   image hits S3 origin directly, bypassing ALL CDN layers
3. **Missing CDN-specific cache headers** — image routes set `Cache-Control` but
   not `CDN-Cache-Control` or `Cloudflare-CDN-Cache-Control`
4. **Short cache durations** — `/api/assets` at 7 days, `/api/og-image` at 24h
   for near-immutable content
5. **Cache Components underutilized** — `cacheComponents: true` is enabled but
   image-heavy pages don't leverage `"use cache"` with long `cacheLife`

## Architecture

```
Current:
  Browser → CF (pass-through) → Next.js /_next/image → DO Spaces CDN → S3
  Browser → CF (pass-through) → /api/assets → AWS SDK → S3 origin (NO CDN)

After:
  Browser → CF (CACHED) → Next.js /_next/image → DO Spaces CDN → S3
  Browser → CF (CACHED) → /api/assets → fetch(CDN URL) → DO Spaces CDN → S3
```

## Changes

### 1. Cloudflare Cache Rules (deployed via Rulesets API)

| Rule             | Match                                   | Action           | Edge TTL |
| ---------------- | --------------------------------------- | ---------------- | -------- |
| Image optimizer  | `/_next/image*`                         | Cache Everything | 1 year   |
| Image API routes | `/api/cache/images*` OR `/api/assets/*` | Cache Everything | 7 days   |
| OG image         | `/api/og-image*`                        | Cache Everything | 1 day    |

**Config**: `infra/cloudflare/cache-rules.json`
**Deploy**: `bun run deploy:cf-cache-rules` (or `deploy:cf-cache-rules:dry-run` to preview)
**Env**: Requires `CF_ZONE_ID` and `CLOUDFLARE_API_KEY` (Bearer token with Cache Rules edit)

### 2. Convert `/api/assets` from S3-SDK to CDN-stream

Replace `GetObjectCommand` byte streaming with `fetch(cdnUrl)` streaming.
Keep `HeadObjectCommand` for existence checks. Follow the pattern already
established in `/api/cache/images/route.ts`.

**File**: `src/app/api/assets/[assetId]/route.ts`

### 3. CDN-specific cache headers

Add `IMAGE_CDN_CACHE_HEADERS` constant alongside `IMAGE_SECURITY_HEADERS`:

```typescript
export const IMAGE_CDN_CACHE_HEADERS = {
  "CDN-Cache-Control": "public, max-age=31536000, immutable",
  "Cloudflare-CDN-Cache-Control": "public, max-age=31536000, immutable",
} as const;
```

Apply to: `/api/cache/images`, `/api/assets`, `/api/og-image`, `/api/logo`,
`/api/twitter-image`.

### 4. Cache duration alignment

| Route                 | Current     | New                       |
| --------------------- | ----------- | ------------------------- |
| `/api/assets`         | 7d + 1d SWR | 1yr immutable             |
| `/api/og-image`       | 24h         | 7d + 1d SWR               |
| `/api/logo` (success) | none (301)  | 1yr immutable on redirect |
| `minimumCacheTTL`     | 7d          | 30d                       |

### 5. Cache Components for image-heavy pages

Use `"use cache"` + `cacheLife` + `cacheTag` to pre-render pages with image
URLs baked into the static shell. On-demand invalidation via `revalidateTag`.

### 6. Deferred: Replace DO Spaces CDN with Cloudflare

Change `s3-storage.callahan.cloud` from DNS-only CNAME → DO Spaces CDN to
CF-proxied CNAME → S3 origin. Only if bandwidth remains high after above.

## Env Vars

Existing (unchanged):

- `NEXT_PUBLIC_S3_CDN_URL=https://s3-storage.callahan.cloud` (CDN URL, used everywhere)
- `S3_SERVER_URL=https://sfo3.digitaloceanspaces.com` (S3 origin, AWS SDK only)
- `S3_CDN_URL` in `.env` is unused in code (confusing; can be removed)
- `CLOUDFLARE_API_KEY` (Bearer token for CF API)

New (for cache rules deployment only):

- `CF_ZONE_ID` — Cloudflare Zone ID (from CF dashboard > Overview > right sidebar)

## Expected Impact

| Change                                 | Bandwidth reduction |
| -------------------------------------- | ------------------- |
| CF Cache Rule for `/_next/image`       | 40-60%              |
| `/api/assets` CDN streaming            | 15-20%              |
| CDN cache headers + duration increases | 10-15%              |
| Cache Components for pages             | 5-10%               |
| **Total**                              | **~80%**            |
