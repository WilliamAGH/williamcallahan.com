# Security and Middleware Architecture

## Overview

This document outlines the security measures and middleware implementation for williamcallahan.com. It covers Content Security Policy (CSP), request handling, and security headers.

## Table of Contents

1. [Middleware Overview](#middleware-overview)
2. [Content Security Policy (CSP)](#content-security-policy)
3. [Security Headers](#security-headers)
4. [Request Handling](#request-handling)
5. [CORS Configuration](#cors-configuration)
6. [Caching Strategy](#caching-strategy)
7. [Security Best Practices](#security-best-practices)
8. [Monitoring and Logging](#monitoring-and-logging)

## Middleware Overview

The application uses Next.js middleware to handle request processing, security headers, and logging. The middleware runs on all non-static routes and applies security policies consistently.

### Key Features

- **Request Logging**: Logs all incoming requests with metadata
- **Security Headers**: Applies security headers to all responses
- **CSP**: Implements Content Security Policy
- **CORS**: Handles Cross-Origin Resource Sharing
- **Caching**: Configures appropriate cache headers
- **IP Handling**: Extracts real client IP from various proxy headers

## Content Security Policy (CSP)

The Content Security Policy is defined in `lib/constants.ts` and applied in the middleware.

### Key Directives

```typescript
export const CSP_DIRECTIVES = {
  defaultSrc: ["'self'"],
  scriptSrc: [
    "'self'",
    "'unsafe-inline'",
    "'unsafe-eval'",
    "https://umami.iocloudhost.net",
    "https://plausible.iocloudhost.net",
    "https://static.cloudflareinsights.com",
    "https://*.sentry.io",
    // ... other allowed script sources
  ],
  connectSrc: [
    "'self'",
    "https://umami.iocloudhost.net",
    "https://plausible.iocloudhost.net",
    "https://*.ingest.sentry.io",
    // ... other allowed connect sources
  ],
  imgSrc: ["'self'", "data:", "https:", "blob:"],
  styleSrc: ["'self'", "'unsafe-inline'"],
  fontSrc: ["'self'", "data:"],
  frameSrc: ["https://platform.twitter.com", "https://*.x.com"],
  frameAncestors: ["'none'"],
  baseUri: ["'self'"],
  formAction: ["'self'"],
};
```

## Security Headers

The following security headers are applied to all responses:

```http
X-DNS-Prefetch-Control: on
Strict-Transport-Security: max-age=31536000; includeSubDomains
X-Frame-Options: SAMEORIGIN
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: geolocation=(), interest-cohort=()
Content-Security-Policy: [dynamically generated from CSP_DIRECTIVES]
```

## Request Handling

### IP Address Resolution

The middleware extracts the real client IP from various headers in order of priority:

1. `True-Client-IP` (Cloudflare)
2. `CF-Connecting-IP` (Cloudflare)
3. `X-Forwarded-For` (Standard proxy header)
4. `X-Real-IP` (Nginx)

### Request Logging

Each request is logged with the following information:

- Timestamp
- Request path and query parameters
- HTTP method
- Client IP address
- User agent
- Referrer

## CORS Configuration

Cross-Origin Resource Sharing is configured with the following settings:

```typescript
// Preflight response for OPTIONS requests
if (request.method === "OPTIONS") {
  return new NextResponse(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, x-refresh-secret",
      "Access-Control-Max-Age": "86400",
    },
  });
}
```

## Caching Strategy

The middleware applies different caching strategies based on the resource type:

### Static Assets (JS, CSS, Fonts, Images)

```http
Cache-Control: public, max-age=31536000, immutable
```

### Optimized Images (`/_next/image`)

```http
Cache-Control: public, max-age=31536000, immutable
X-Content-Type-Options: nosniff
Accept-CH: DPR, Width, Viewport-Width
```

### HTML Pages

```http
Cache-Control: no-store, no-cache, must-revalidate, proxy-revalidate
```

### Analytics Scripts

```http
Cache-Control: no-store, no-cache, must-revalidate, proxy-revalidate
Pragma: no-cache
Expires: 0
CDN-Cache-Control: no-store, max-age=0
Cloudflare-CDN-Cache-Control: no-store, max-age=0
```

## Security Best Practices

1. **CSP Implementation**: Strict CSP with minimal required sources
2. **HTTPS Enforcement**: HSTS header with 1-year max-age
3. **Clickjacking Protection**: X-Frame-Options set to SAMEORIGIN
4. **MIME Sniffing Protection**: X-Content-Type-Options: nosniff
5. **Referrer Policy**: strict-origin-when-cross-origin
6. **Permissions Policy**: Restricts geolocation and interest cohort APIs
7. **Frame Ancestors**: Prevents embedding in iframes
8. **Secure Cookies**: All cookies are marked as Secure and HttpOnly

## Monitoring and Logging

### Request Logs

Each request is logged with:

- Timestamp
- Request path
- HTTP method
- Client IP
- User agent
- Referrer

### Error Logging

- Server-side errors are captured by Sentry
- Client-side errors are captured by Sentry's browser SDK
- Error boundaries are implemented in React components

### Performance Monitoring

- Page load times
- API response times
- Client-side performance metrics

## Debugging and Troubleshooting

### Common Issues

#### CSP Violations

1. Check browser console for CSP violation reports
2. Update `CSP_DIRECTIVES` in `lib/constants.ts`
3. Test in development mode with `NODE_ENV=development`

#### CORS Issues

1. Verify `Access-Control-Allow-Origin` header
2. Check preflight response headers
3. Ensure proper HTTP methods are allowed

#### Caching Problems

1. Verify `Cache-Control` headers
2. Check CDN configuration
3. Clear browser cache for testing

## Future Improvements

1. **CSP Reporting**: Implement report-uri for violation reporting
2. **Rate Limiting**: Add request rate limiting
3. **Bot Protection**: Implement bot detection and challenge
4. **Security Headers**: Add additional security headers as needed
5. **Request Validation**: Add request validation middleware
