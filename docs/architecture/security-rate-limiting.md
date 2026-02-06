# Rate Limiting and Load-Shedding Architecture

## Overview

The proxy now enforces a **navigation-first** strategy to prevent partial page renders:

- `document` and `api` requests can be throttled/shed.
- `rsc`, `prefetch`, and `image` subrequests are not independently blocked at the proxy.

This avoids a state where HTML succeeds but RSC/image/prefetch resources fail independently and produce ambiguous UI behavior.

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

### Service Busy (`503`)

- HTTP: `503 Service Unavailable`
- Headers:
  - `Retry-After` (delta seconds)
  - `Cache-Control: no-store`
- User-facing message:
  - `The server is temporarily under heavy load. Please wait a few minutes and try again.`

### Document vs API Format

- `document`: HTML error page with unambiguous message + status (`429` or `503`)
- `api`: JSON schema:
  - `code`: `RATE_LIMITED | SERVICE_UNAVAILABLE`
  - `message`: user-safe message
  - `retryAfterSeconds`: integer
  - `retryAfterAt`: ISO timestamp
  - `status`: `429 | 503`

## Components and Files

- Proxy entrypoint: `src/proxy.ts`
- Sitewide throttling: `src/lib/middleware/sitewide-rate-limit.ts`
- Memory shedding: `src/lib/middleware/memory-pressure.ts`
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
