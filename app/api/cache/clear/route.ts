/**
 * Cache Clear API Route
 * @module app/api/cache/clear
 * @description
 * Server-side API endpoint for clearing server caches.
 * This is useful for development and testing.
 */

import { NextRequest, NextResponse } from 'next/server';
import { ServerCacheInstance } from '../../../../lib/server-cache';

/**
 * POST handler for cache clearing
 * @param {NextRequest} request - Incoming request
 * @returns {Promise<NextResponse>} API response
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // Clear all caches
    ServerCacheInstance.clearAllLogoFetches();

    return NextResponse.json({
      message: 'Cache cleared successfully',
      stats: ServerCacheInstance.getStats()
    });
  } catch (error) {
    console.error('Error clearing cache:', error);
    return NextResponse.json(
      { error: 'Failed to clear cache' },
      { status: 500 }
    );
  }
}

/**
 * GET handler for cache stats
 * @param {NextRequest} request - Incoming request
 * @returns {Promise<NextResponse>} API response
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    return NextResponse.json({
      stats: ServerCacheInstance.getStats()
    });
  } catch (error) {
    console.error('Error getting cache stats:', error);
    return NextResponse.json(
      { error: 'Failed to get cache stats' },
      { status: 500 }
    );
  }
}
