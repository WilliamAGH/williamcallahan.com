// middleware.ts

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Simple request logging middleware
 * Logs the method, pathname, and search params of each request,
 * excluding static assets, images, and JavaScript files
 */
export function middleware(request: NextRequest) {
  const { method, nextUrl: { pathname, search } } = request

  // Skip logging for:
  // - Static assets and API routes
  // - Image file extensions
  // - JavaScript files
  // - Image directory
  const skipPatterns = [
    '/_next',
    '/api',
    /\.(png|jpe?g|svg|js)$/,
    '/images/'
  ]

  const shouldSkip = skipPatterns.some(pattern =>
    typeof pattern === 'string'
      ? pathname.startsWith(pattern)
      : pattern.test(pathname)
  )

  if (!shouldSkip) {
    console.log(`[Request] ${method} ${pathname}${search}`)
  }

  return NextResponse.next()
}

/**
 * Configure which paths the middleware runs on
 * This will run on all paths except static files and api routes
 */
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
}
