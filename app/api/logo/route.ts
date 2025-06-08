/**
 * Logo Fetching API Route
 * @module app/api/logo
 * @description
 * Server-side API endpoint for fetching and validating company logos
 * This route handles logo fetching, validation, and caching to ensure
 * we only serve valid company logos and not generic globe icons
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getLogo, serveLogoFromS3 } from '@/lib/data-access/logos';
import { ServerCacheInstance } from '@/lib/server-cache';
import type { LogoSource } from '@/types/logo';

// Configure dynamic API route with caching
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const searchParams = request.nextUrl.searchParams;
  const website = searchParams.get('website');
  const company = searchParams.get('company'); // company can be used as a fallback for domain
  const refresh = searchParams.get('refresh') === 'true';

  if (!website && !company) {
    return NextResponse.json(
      { error: 'Website or company name required' },
      { status: 400 }
    );
  }

  // A more robust way to determine the domain
  let domain = '';
  if (website) {
    // Start with a simple regex for domain-like patterns
    const domainMatch = website.match(/^(?:https?:\/\/)?(?:www\.)?([^/]+)/);
    domain = domainMatch ? domainMatch[1] : '';

    // If initial regex fails, fall back to URL parsing
    if (!domain) {
      try {
        domain = new URL(website.startsWith('http') ? website : `http://${website}`).hostname.replace(/^www\./, '');
      } catch {
        // As a last resort, treat the whole string as a potential domain if it's simple
        if (!website.includes('/') && website.includes('.')) {
          domain = website;
        } else {
          console.warn(`[API Logo] Could not determine domain from website: ${website}`);
        }
      }
    }
  } else if (company) {
    // Keep the company-based domain generation as a fallback
    domain = `${company.toLowerCase().replace(/[^a-z0-9-]/g, '')}.com`;
    console.log(`[API Logo] Attempting domain from company name: ${company} -> ${domain}`);
  }

  // If domain is still empty after all attempts, it's a bad request
  if (!domain) {
    return NextResponse.json({ error: 'Could not determine a valid domain from the provided `website` or `company` parameter.' }, { status: 400 });
  }

  try {
    // Check if we already have this in cache before fetching
    const cacheHit = !refresh && ServerCacheInstance.getLogoFetch(domain) !== undefined;

    // We need to handle refresh differently since getLogo doesn't support options
    let logoResult: { buffer: Buffer; source: LogoSource; contentType: string } | null = null;

    if (refresh) {
      // If refresh is requested, clear the cache entry first
      ServerCacheInstance.clearLogoFetch(domain);
      // Then get logo normally (will trigger fresh fetch)
      logoResult = await getLogo(domain);
    } else {
      // Use regular path - check cache, then S3, then external if needed
      if (cacheHit) {
        logoResult = await getLogo(domain);          // uses cache
      } else {
        // Try S3 first, then external via getLogo if S3 fails
        logoResult = await serveLogoFromS3(domain);
        if (!logoResult) {
          logoResult = await getLogo(domain);  // Attempt external fetch if not in S3
        }
      }
    }

    if (logoResult) {
      // Return the logo with cache headers
      return new NextResponse(logoResult.buffer, {
        status: 200,
        headers: {
          'Content-Type': logoResult.contentType,
          'Cache-Control': 'public, max-age=31536000', // Cache for 1 year
          'x-logo-source': logoResult.source || '',
          'x-cache': cacheHit ? 'HIT' : 'MISS' // Add cache hit/miss header for debugging
        }
      });
    }
    // If getLogo returns null, it means it failed to fetch from all sources (cache, volume, external)
    // Logo not available in S3
    // The 'else' is removed as per Biome's suggestion because the previous 'if' block returns.
    return NextResponse.json(
      { error: 'Logo not found' },
      {
        status: 404,
        headers: {
          'x-cache': cacheHit ? 'HIT' : 'MISS'
        }
      }
    );
  } catch (error) {
    console.error('[API Logo] Unexpected error in GET handler:', error);
    return new NextResponse(null, {
      status: 500, // Internal Server Error for unexpected issues
      headers: {
        'x-logo-error': 'Internal server error while fetching logo'
      }
    });
  }
}
