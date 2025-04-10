/**
 * Health Check API Route
 * @module app/api/health
 * @description
 * Server-side API endpoint for health checking.
 * Returns basic health information about the server.
 */

import { NextResponse } from 'next/server';
import { ServerCacheInstance } from '../../../lib/server-cache';

// Make the endpoint dynamic to avoid caching
export const dynamic = 'force-dynamic';

/**
 * GET handler for health checking
 * @returns {Promise<NextResponse>} API response with health status
 */
export async function GET(): Promise<NextResponse> {
  return NextResponse.json(
    {
      status: 'ok',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV,
      version: process.env.npm_package_version || '0.0.0',
      cacheStats: ServerCacheInstance.getStats()
    },
    {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    }
  );
}