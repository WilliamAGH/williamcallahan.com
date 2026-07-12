# Rate Limiting Architecture

## Overview

Rate limiting operates at the proxy layer and applies profiles by request class:

- `document`, `rsc`, `prefetch`, and `image` share the bounded `page` profile so spoofable framework headers cannot bypass or multiply the allowance.
- `api` uses the `api` profile, except `/api/tunnel`, which uses the higher-volume `sentryTunnel` profile.
- `OPTIONS`, health checks, and the `other` request class are not throttled.

## In-Memory Store Bounds

`src/lib/rate-limiter.ts` owns the in-memory lifecycle policy:

- Direct client lookups and counter updates use a `Map` instead of materializing the whole store.
- Incremental cleanup scans at most `RATE_LIMIT_STORE_CLEANUP_BATCH_SIZE` entries every `RATE_LIMIT_STORE_CLEANUP_INTERVAL` operations using a persistent cursor. No background interval is created.
- Each namespace is capped by `RATE_LIMIT_STORE_MAX_ENTRIES`; a new client at capacity evicts the oldest tracked client.

## Request Classification

Proxy request classes are derived in `src/lib/utils/request-utils.ts` using path + headers:

- `document`: Browser document navigation (`Accept: text/html`, `GET` or `HEAD`)
- `api`: `/api/*`
- `rsc`: Flight requests (`_rsc` query, `rsc: 1`, or `text/x-component`)
- `prefetch`: Next prefetch hints (`next-router-prefetch`, `purpose=prefetch`, `sec-purpose=prefetch`)
- `image`: `/_next/image`
- `other`: everything else

## Deterministic Response Contracts

### Rate Limited (`429`)

- HTTP: `429 Too Many Requests` (RFC 6585)
- Headers:
  - `Retry-After` (delta seconds; RFC 9110)
  - `Cache-Control: no-store`
  - Optional: `X-RateLimit-Scope`, `X-RateLimit-Limit`, `X-RateLimit-Window`
- User-facing message:
  - `You've reached a rate limit. Please wait a few minutes and try again.`

### Document vs Subrequest/API Format

- `document`: HTML error page with unambiguous message + status (`429`)
- `api`, `rsc`, `prefetch`, and `image`: JSON schema:
  - `code`: `RATE_LIMITED`
  - `message`: user-safe message
  - `retryAfterSeconds`: integer
  - `retryAfterAt`: ISO timestamp
  - `status`: `429`

## Components and Files

- Proxy entrypoint: `src/proxy.ts`
- Sitewide throttling: `src/lib/middleware/sitewide-rate-limit.ts`
- Shared response builders: `src/lib/utils/api-utils.ts`
- Schema contract: `src/types/schemas/api.ts`

## Observability

Each proxy-level throttle/shed emits structured logs with deterministic fields:

- `type`
- `path`
- `requestClass`
- `retryAfter`
- `ipBucket` (hashed IP bucket, not raw IP)
- `handled: true`

These events are expected control-flow signals and should be treated separately from crash diagnostics.
