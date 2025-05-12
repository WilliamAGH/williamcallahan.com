/**
 * Logo Fetching API Route
 * @module app/api/logo
 * @description
 * Server-side API endpoint for fetching and validating company logos.
 * This route handles logo fetching, validation, and caching to ensure
 * we only serve valid company logos and not generic globe icons.
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getLogo, serveLogoFromS3 } from '@/lib/data-access'; // Update to support both methods
import { ServerCacheInstance } from '@/lib/server-cache'; // Add cache import
import type { LogoSource } from '@/types/logo'; // Import LogoSource type

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

  try {
    // Declare domain with an empty string default value
    let domain = '';

    // Process website parameter if available
    if (website) {
      try {
        // Normalize domain: remove protocol, www, and path
        // TypeScript needs reassurance that website is a string here
        const websiteStr = website;
        domain = new URL(websiteStr).hostname.replace(/^www\./, '');
      } catch {
        // If URL parsing fails, try to extract domain from the string
        // Since we're in this block, we know website cannot be null
        const websiteStr = website;
        const domainParts = websiteStr.replace(/^https?:\/\/(www\.)?/, '').split('/');
        domain = domainParts[0] || '';
      }
    }
    // Otherwise process company parameter
    else if (company) {
      // Use company name to form a potential domain
      // Since we've checked company is not null here, we can safely use it as a string
      const companyStr: string = company;
      domain = companyStr.toLowerCase().replace(/[^a-z0-9]/g, '') + '.com';
      console.log(`[API Logo] Attempting domain from company name: ${companyStr} -> ${domain}`);
    }

    // Extra safeguard in case domain wasn't set (though our initial check should prevent this)
    if (!domain) {
      return NextResponse.json({ error: 'Internal error: domain could not be determined' }, { status: 500 });
    }

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
    } else {
      // If getLogo returns null, it means it failed to fetch from all sources (cache, volume, external)
      // Logo not available in S3
      return NextResponse.json(
        { error: 'Logo not found' },
        {
          status: 404,
          headers: {
            'x-cache': cacheHit ? 'HIT' : 'MISS'
          }
        }
      );
    }
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
