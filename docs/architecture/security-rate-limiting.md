# Rate Limiting Architecture

## Overview

Rate limiting operates at the proxy layer:

- **Rate limiting** (`sitewide-rate-limit.ts`) uses a **navigation-first** strategy: only `document` and `api` request classes are throttled. `rsc`, `prefetch`, and `image` subrequests pass through to avoid partial-render failures where HTML succeeds but dependent resources are independently blocked.

## Request Classification

Proxy request classes are derived in `src/lib/utils/request-utils.ts` using path + headers:

- `document`: Browser document navigation (`Accept: text/html`, `GET`)
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

### Document vs API Format

- `document`: HTML error page with unambiguous message + status (`429`)
- `api`: JSON schema:
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
