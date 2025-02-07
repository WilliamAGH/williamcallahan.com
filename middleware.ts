// middleware.ts

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const {
    method,
    nextUrl: { pathname, search },
  } = request
  const clientIp = request.headers.get('cf-connecting-ip') || 'unknown'
  const userAgent = request.headers.get('user-agent') || 'unknown'
  const referer = request.headers.get('referer') || 'direct'

  // Normalize paths just like client-side
  const normalizedPath = pathname
    .replace(/\/blog\/[^/]+/, '/blog/:slug')
    .replace(/\/investments.*/, '/investments')
    .replace(/\/education.*/, '/education')
    .replace(/\/experience.*/, '/experience')
    .replace(/\/bookmarks.*/, '/bookmarks')

  // Skip only true static assets
  const skipPatterns = ['/_next/static', '/_next/image', /\.(ico|png|jpe?g|svg)$/]

  const shouldTrack = !skipPatterns.some((pattern) =>
    typeof pattern === 'string'
      ? pathname.startsWith(pattern)
      : pattern.test(pathname)
  )

  if (shouldTrack) {
    // Log comprehensive request data
    console.log(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        type: 'server_pageview',
        data: {
          path: normalizedPath,
          fullPath: `${pathname}${search}`,
          method,
          clientIp,
          userAgent,
          referer,
        },
      })
    )
  }

  return NextResponse.next()
}

// Update matcher to catch more routes
export const config = {
  matcher: [
    // Include everything except static assets
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}
