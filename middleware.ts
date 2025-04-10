// middleware.ts

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/**
 * Type definition for server-side request logging
 * @interface RequestLog
 */
interface RequestLog {
  /** ISO timestamp of the request */
  timestamp: string
  /** Type of log entry */
  type: 'server_pageview'
  /** Request data payload */
  data: {
    /** Normalized path without query params */
    path: string
    /** Full request path including query params */
    fullPath: string
    /** HTTP method used */
    method: string
    /** Real client IP from trusted headers */
    clientIp: string
    /** Client's user agent string */
    userAgent: string
    /** Request referrer or 'direct' */
    referer: string
  }
}

/**
 * Gets the real client IP from various headers
 * Prioritizes Cloudflare headers, then standard proxy headers
 * @param request - The Next.js request object
 * @returns The real client IP or 'unknown'
 */
function getRealIp(request: NextRequest): string {
  return request.headers.get('True-Client-IP') ||
         request.headers.get('CF-Connecting-IP') ||
         request.headers.get('X-Forwarded-For')?.split(',')[0] ||
         request.headers.get('X-Real-IP') ||
         'unknown'
}

/**
 * Middleware to handle request logging and security headers
 * Runs on all non-static routes as defined in the matcher
 * @param request - The incoming Next.js request
 * @returns The modified response with added headers
 */
export function middleware(request: NextRequest): NextResponse {
  const response = NextResponse.next()
  const ip = getRealIp(request)

  // Set security headers
  const securityHeaders = {
    'X-DNS-Prefetch-Control': 'on',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    'X-Frame-Options': 'SAMEORIGIN',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Real-IP': ip,
    // Add Permissions-Policy header to control features
    'Permissions-Policy': 'geolocation=(), interest-cohort=()',
    // Update CSP to allow analytics
    'Content-Security-Policy': `
      default-src 'self';
      script-src 'self' 'unsafe-inline' 'unsafe-eval' https://umami.iocloudhost.net https://plausible.iocloudhost.net https://static.cloudflareinsights.com;
      connect-src 'self' https://umami.iocloudhost.net https://plausible.iocloudhost.net https://static.cloudflareinsights.com;
      img-src 'self' data: https://*.iocloudhost.net https://*.popos-sf1.com https://*.popos-sf2.com https://*.popos-sf3.com https://images.unsplash.com https://williamcallahan.com https://icons.duckduckgo.com https://www.google.com https://external-content.duckduckgo.com https://logo.clearbit.com https://dev.williamcallahan.com;
      style-src 'self' 'unsafe-inline';
      font-src 'self' data:;
      frame-ancestors 'none';
      base-uri 'self';
      form-action 'self';
    `.replace(/\s+/g, ' ').trim()
  }

  Object.entries(securityHeaders).forEach(([header, value]) => {
    response.headers.set(header, value)
  })

  // Add caching headers for static assets and analytics scripts
  const url = request.nextUrl.pathname
  const isDev = process.env.NODE_ENV === 'development'

  if (!isDev) {
    if (url.includes('/_next/image')) {
      response.headers.set('Cache-Control', 'public, max-age=31536000, immutable')
      response.headers.set('X-Content-Type-Options', 'nosniff')
      response.headers.set('Accept-CH', 'DPR, Width, Viewport-Width')
    } else if (
      url.includes('/_next/static') ||
      url.endsWith('.jpg') ||
      url.endsWith('.jpeg') ||
      url.endsWith('.png') ||
      url.endsWith('.webp') ||
      url.endsWith('.avif') ||
      url.endsWith('.svg') ||
      url.endsWith('.css') ||
      url.endsWith('.woff2') ||
      // Add caching for analytics scripts
      url.includes('umami.iocloudhost.net/script.js') ||
      url.includes('plausible.iocloudhost.net/js/script.js') ||
      url.includes('static.cloudflareinsights.com/beacon.min.js')
    ) {
      response.headers.set('Cache-Control', 'public, max-age=31536000, immutable')
      response.headers.set('X-Content-Type-Options', 'nosniff')

      if (url.match(/\.(jpe?g|png|webp|avif)$/)) {
        response.headers.set('Accept-CH', 'DPR, Width, Viewport-Width')
      }
    } else if (url === '/' || !url.includes('.')) {
      response.headers.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400')
    }
  } else {
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
    response.headers.set('Pragma', 'no-cache')
    response.headers.set('Expires', '0')
  }

  // Log the request with the real IP
  const log: RequestLog = {
    timestamp: new Date().toISOString(),
    type: 'server_pageview',
    data: {
      path: request.nextUrl.pathname,
      fullPath: request.nextUrl.pathname + request.nextUrl.search,
      method: request.method,
      clientIp: ip,
      userAgent: request.headers.get('user-agent') || 'unknown',
      referer: request.headers.get('referer') || 'direct'
    }
  }

  console.log(JSON.stringify(log))

  return response
}

/**
 * Route matcher configuration
 * Includes image optimization routes and excludes other static files from middleware processing
 */
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - favicon.ico (favicon file)
     * - robots.txt
     * - sitemap.xml
     * But include:
     * - _next/image (image optimization files)
     */
    '/((?!api|_next/static|favicon.ico|robots.txt|sitemap.xml).*)',
    '/_next/image(.*)',
  ],
}
