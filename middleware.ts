// middleware.ts

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { nowPacific } from './lib/dateTime'

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
         request.ip ||
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

  const path = request.nextUrl.pathname;

  // Set security and caching headers
  const headers: Record<string, string> = {
    // Security headers
    'X-DNS-Prefetch-Control': 'on',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    'X-Frame-Options': 'SAMEORIGIN',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Real-IP': ip,
  }

  // Add cache headers for images and static assets
  if (path.match(/\.(jpg|jpeg|png|gif|webp|svg)$/i)) {
    headers['Cache-Control'] = 'public, max-age=31536000, immutable'; // 1 year
    headers['Vary'] = 'Accept'; // Vary header for content negotiation
  } else if (path.startsWith('/_next/static/css/')) {
    // CSS files - shorter cache time to allow style updates
    headers['Cache-Control'] = 'public, max-age=604800, immutable' // 7 days
  } else if (path.startsWith('/_next/static/')) {
    // Other static assets - longer cache time
    headers['Cache-Control'] = 'public, max-age=604800, immutable' // 1 week
  } else if (path.includes('cloudflareinsights.com') || path.includes('umami.iocloudhost.net') || path.includes('plausible.iocloudhost.net')) {
    // Analytics domains - allow CORS and caching
    headers['Access-Control-Allow-Origin'] = '*'
    headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
    headers['Access-Control-Allow-Headers'] = 'Content-Type'
    headers['Cache-Control'] = 'public, max-age=3600' // 1 hour
  }

  // Add CORS headers for analytics domains
  const referer = request.headers.get('referer')
  if (referer?.includes('cloudflareinsights.com') || referer?.includes('umami.iocloudhost.net') || referer?.includes('plausible.iocloudhost.net')) {
    headers['Access-Control-Allow-Origin'] = '*'
    headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
    headers['Access-Control-Allow-Headers'] = 'Content-Type'
  }

  // Handle analytics script proxying
  if (path === '/js/script.js') {
    return NextResponse.rewrite(new URL('https://umami.iocloudhost.net/script.js'));
  }
  if (path === '/beacon.min.js') {
    return NextResponse.rewrite(new URL('https://static.cloudflareinsights.com/beacon.min.js'));
  }

  Object.entries(headers).forEach(([header, value]) => {
    response.headers.set(header, value)
  })

  // Log the request with the real IP
  const log: RequestLog = {
    timestamp: nowPacific(),
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
 * Excludes static files and API routes from middleware processing
 */
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - favicon.ico (favicon file)
     * - robots.txt
     * - sitemap.xml
     * Note: We want to process _next/static for cache headers
     */
    '/((?!api|favicon.ico|robots.txt|sitemap.xml).*)',
  ],
}
