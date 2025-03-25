import { NextRequest, NextResponse } from 'next/server'

/**
 * Cache control headers to prevent IP caching
 * @constant
 */
const CACHE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
  'Pragma': 'no-cache',
  'Expires': '0',
} as const

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
 * API Route handler for /api/ip
 * Returns the real client IP address as plain text
 * Uses various headers to determine the true client IP, prioritizing Cloudflare headers
 * @param request - The incoming Next.js request
 * @returns A Next.js response containing the IP address with no-cache headers
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const ip = getRealIp(request)

  return new NextResponse(ip, {
    headers: CACHE_HEADERS
  })
}
