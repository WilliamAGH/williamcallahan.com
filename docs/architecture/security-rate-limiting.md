# Rate Limiting and Sanitization Architecture Map

## Overview

The "rate-limit-and-sanitize" functionality encompasses utilities and mechanisms that support the infrastructure for API operations within the application. This includes rate limiting to prevent abuse and ensure fair usage of API resources, as well as input/output sanitization to maintain data integrity and security.

## Key Files and Responsibilities

- **lib/rate-limiter.ts**: Provides a mechanism for rate limiting operations. It includes:
  - Functionality to check if an operation is allowed based on configurable limits.
  - A waiting mechanism to poll for permit availability with intelligent wait times.
  - Support for multiple rate limiting contexts with predefined configurations for API endpoints and OpenGraph fetches.
- **lib/middleware/sitewide-rate-limit.ts**: Provides proxy-layer, sitewide rate limiting for incoming requests (pages, API routes, and image optimization) to mitigate aggressive crawlers before they trigger memory pressure.
- **lib/utils/api-sanitization.ts**: Handles input/output sanitization for API operations to ensure data integrity and security.

## Logic Flow and Interactions

- **rate-limiter.ts** manages rate limiting by maintaining an in-memory store of rate limit records for different contexts (e.g., per IP for API endpoints or global for outgoing requests). It checks operation allowance synchronously and provides an asynchronous wait mechanism until a slot is available.
- Pre-configured limiters in **rate-limiter.ts** offer defaults for common use cases like API endpoint limiting (5 requests per minute) and OpenGraph fetches (10 requests per second), ensuring balanced resource usage.
- **api-sanitization.ts** complements rate limiting by ensuring that API inputs and outputs are sanitized, preventing injection attacks or data corruption.

## Notes

- Rate limiting is critical for protecting API endpoints from abuse, ensuring fair usage, and maintaining application performance under load.
- The flexibility of rate limiting contexts in **rate-limiter.ts** allows for tailored configurations across different API operations, enhancing control over resource allocation.
- Sanitization ensures that data entering and leaving the system adheres to security standards, protecting against common vulnerabilities.

## Cloudflare Origin Guard (Production)

The following endpoints require valid Cloudflare origin headers in production. Requests missing valid Cloudflare headers are logged and rejected with 403 to prevent direct-to-origin abuse while preserving accurate IP logging:

- `/api/ai/token`
- `/api/ai/chat/[feature]`
- `/api/ai/queue/[feature]`
- `/api/upload`
