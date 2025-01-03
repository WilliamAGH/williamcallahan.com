/**
 * Logo Inversion API Route
 * @module app/api/logo/invert
 * @description
 * Server-side API endpoint for inverting logo images based on theme.
 * This route handles image inversion, caching, and serving inverted logos.
 */

import { NextResponse } from 'next/server';
import type{ NextRequest } from 'next/server';
import { ServerCacheInstance } from '../../../../lib/server-cache';
import { analyzeImage, invertImage, needsInversion } from '../../../../lib/imageAnalysis';

/**
 * Safely parse and validate URL
 * @param {string} urlString - URL string to parse
 * @returns {string} Validated URL string
 */
function validateUrl(urlString: string): string {
  try {
    // If it's a relative URL starting with /api, keep it relative
    if (urlString.startsWith('/api')) {
      return urlString;
    }
    // Otherwise, ensure it's a valid URL
    return new URL(urlString).toString();
  } catch {
    throw new Error(`Invalid URL: ${urlString}`);
  }
}

/**
 * GET handler for logo inversion
 * @param {NextRequest} request - Incoming request
 * @returns {Promise<NextResponse>} API response with inverted image
 */
// Enable dynamic rendering to allow API calls during server-side rendering
export const dynamic = 'force-dynamic';
export const revalidate = 3600; // Cache for 1 hour

export async function GET(request: NextRequest): Promise<NextResponse> {
  const searchParams = request.nextUrl.searchParams;
  const urlParam = searchParams.get('url');
  const isDarkTheme = searchParams.get('theme') === 'dark';

  if (!urlParam) {
    return NextResponse.json(
      { error: 'URL parameter required' },
      {
        status: 400,
        headers: {
          'Cache-Control': 'no-store'
        }
      }
    );
  }

  try {
    const url = validateUrl(urlParam);

    // Get cached inverted version if available
    const cacheKey = `${url}-${isDarkTheme ? 'dark' : 'light'}`;
    const cached = ServerCacheInstance.getInvertedLogo(cacheKey);
    if (cached?.buffer) {
      return new NextResponse(cached.buffer, {
        headers: {
          'Content-Type': 'image/png',
          'Cache-Control': 'public, max-age=31536000',
        }
      });
    }

    // Fetch the original image
    const response = await fetch(url, {
      next: { revalidate: 3600 } // Cache for 1 hour
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: 'Failed to fetch image' },
        {
          status: response.status,
          headers: {
            'Cache-Control': 'no-store'
          }
        }
      );
    }

    const buffer = Buffer.from(await response.arrayBuffer());

    // Check if we need to invert
    const shouldInvert = await needsInversion(buffer, isDarkTheme);
    if (!shouldInvert) {
      // Return original image if no inversion needed
      return new NextResponse(buffer, {
        headers: {
          'Content-Type': response.headers.get('Content-Type') || 'image/png',
          'Cache-Control': 'public, max-age=31536000',
        }
      });
    }

    // Analyze image for transparency
    const analysis = await analyzeImage(buffer);

    // Create inverted version
    const inverted = await invertImage(buffer);

    // Cache the result
    ServerCacheInstance.setInvertedLogo(cacheKey, inverted, analysis);

    // Return inverted image
    return new NextResponse(inverted, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=31536000',
      }
    });
  } catch (error) {
    console.error('Error inverting logo:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to process image' },
      {
        status: 500,
        headers: {
          'Cache-Control': 'no-store'
        }
      }
    );
  }
}

/**
 * HEAD handler for checking if inversion is needed
 * @param {NextRequest} request - Incoming request
 * @returns {Promise<NextResponse>} API response with inversion status
 */
export async function HEAD(request: NextRequest): Promise<NextResponse> {
  const searchParams = request.nextUrl.searchParams;
  const urlParam = searchParams.get('url');
  const isDarkTheme = searchParams.get('theme') === 'dark';

  if (!urlParam) {
    return new NextResponse(null, {
      status: 400,
      headers: {
        'Cache-Control': 'no-store'
      }
    });
  }

  try {
    const url = validateUrl(urlParam);

    // Check cache first
    const cacheKey = `${url}-analysis`;
    const cached = ServerCacheInstance.getLogoAnalysis(cacheKey);
    if (cached) {
      const needsInv = isDarkTheme ? cached.needsDarkInversion : cached.needsLightInversion;
      return new NextResponse(null, {
        headers: {
          'X-Needs-Inversion': needsInv.toString(),
          'X-Has-Transparency': cached.hasTransparency.toString(),
          'X-Brightness': cached.brightness.toString(),
          'Cache-Control': 'public, max-age=31536000'
        }
      });
    }

    // Fetch and analyze image
    const response = await fetch(url, {
      next: { revalidate: 3600 } // Cache for 1 hour
    });

    if (!response.ok) {
      return new NextResponse(null, {
        status: response.status,
        headers: {
          'Cache-Control': 'no-store'
        }
      });
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const analysis = await analyzeImage(buffer);

    // Cache the analysis
    ServerCacheInstance.setLogoAnalysis(cacheKey, analysis);

    return new NextResponse(null, {
      headers: {
        'X-Needs-Inversion': (isDarkTheme ? analysis.needsDarkInversion : analysis.needsLightInversion).toString(),
        'X-Has-Transparency': analysis.hasTransparency.toString(),
        'X-Brightness': analysis.brightness.toString(),
        'Cache-Control': 'public, max-age=31536000'
      }
    });
  } catch (error) {
    console.error('Error analyzing logo:', error);
    return new NextResponse(null, {
      status: 500,
      headers: {
        'Cache-Control': 'no-store'
      }
    });
  }
}
