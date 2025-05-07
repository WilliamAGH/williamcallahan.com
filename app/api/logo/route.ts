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
import { getLogo } from '@/lib/data-access'; // Use the new data-access layer

// Configure dynamic API route with caching
export const dynamic = 'force-dynamic';
export const revalidate = 3600; // Revalidate every hour

export async function GET(request: NextRequest): Promise<NextResponse> {
  const searchParams = request.nextUrl.searchParams;
  const website = searchParams.get('website');
  const company = searchParams.get('company'); // company can be used as a fallback for domain

  if (!website && !company) {
    return NextResponse.json(
      { error: 'Website or company name required' },
      { status: 400 }
    );
  }

  try {
    let domain: string;
    if (website) {
      try {
        // Normalize domain: remove protocol, www, and path
        domain = new URL(website).hostname.replace(/^www\./, '');
      } catch {
        // If URL parsing fails, try to extract domain from the string
        domain = website.replace(/^https?:\/\/(www\.)?/, '').split('/')[0];
      }
    } else if (company) {
      // Use company name to form a potential domain (e.g., "Example Inc" -> "exampleinc.com")
      // This is a heuristic and might not always be accurate.
      // A more robust solution might involve a search or a pre-defined mapping.
      domain = company.toLowerCase().replace(/[^a-z0-9]/g, '') + '.com';
      console.log(`[API Logo] Attempting domain from company name: ${company} -> ${domain}`);
    } else {
      // This case should be caught by the initial check, but as a safeguard:
      return NextResponse.json({ error: 'Internal error: domain could not be determined' }, { status: 500 });
    }

    // Use the centralized getLogo function
    // Pass request.nextUrl.origin as the baseUrlForValidation if your getLogo needs it
    // for constructing absolute URLs for internal validation APIs.
    const logoResult = await getLogo(domain, request.nextUrl.origin);

    if (logoResult && logoResult.buffer) {
      return new NextResponse(logoResult.buffer, {
        status: 200,
        headers: {
          'Content-Type': logoResult.contentType,
          'Cache-Control': 'public, max-age=31536000', // Cache for 1 year
          'x-logo-source': logoResult.source || 'unknown'
        }
      });
    } else {
      // If getLogo returns null, it means it failed to fetch from all sources (cache, volume, external)
      // The data-access layer should have already cached the failure.
      return new NextResponse(null, {
        status: 404,
        headers: {
          'x-logo-error': 'Failed to fetch logo from all sources'
        }
      });
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
