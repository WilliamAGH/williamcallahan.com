/**
 * Logo Fetching API Route
 * @module app/api/logo
 * @description
 * Server-side API endpoint for fetching and validating company logos.
 * This route handles logo fetching, validation, and caching to ensure
 * we only serve valid company logos and not generic globe icons.
 */

import { NextRequest, NextResponse } from 'next/server';
import { ServerCache } from '../../../lib/server-cache';
import { LOGO_SOURCES, GENERIC_GLOBE_PATTERNS, API_BASE_URL, LOGO_SIZES } from '../../../lib/constants';
import sharp from 'sharp';

/**
 * Check if a URL matches known generic globe icon patterns
 * @param {string} url - URL to check
 * @returns {boolean} True if URL matches a generic globe icon pattern
 */
function isGenericGlobeIcon(url: string): boolean {
  return GENERIC_GLOBE_PATTERNS.some(pattern => pattern.test(url));
}

/**
 * Check if an image meets size requirements
 * @param {Buffer} buffer - Image buffer to check
 * @returns {Promise<boolean>} Whether the image is large enough
 */
async function isImageLargeEnough(buffer: Buffer): Promise<boolean> {
  try {
    const metadata = await sharp(buffer).metadata();
    // For vector formats (SVG), size check is not needed
    if (metadata.format === 'svg') return true;

    return !!(metadata.width && metadata.height &&
      metadata.width >= LOGO_SIZES.MD && metadata.height >= LOGO_SIZES.MD);
  } catch {
    return false;
  }
}

/**
 * Fetch and validate an image from a URL
 * @param {string} url - URL to fetch
 * @returns {Promise<{valid: boolean, buffer?: Buffer, error?: string}>} Validation result
 */
async function fetchAndValidateImage(url: string): Promise<{
  valid: boolean;
  buffer?: Buffer;
  error?: string;
}> {
  // Check URL pattern first for early rejection
  if (isGenericGlobeIcon(url)) {
    console.debug(`Blocked generic globe icon URL: ${url}`);
    return { valid: false, error: 'Generic globe icon detected' };
  }

  try {
    // Fetch the image with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

    const response = await fetch(url, {
      signal: controller.signal,
      next: { revalidate: 3600 } // Cache for 1 hour
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      if (process.env.NODE_ENV === 'development') {
        console.debug(`Failed to fetch image from ${url}: ${response.status}`);
      }
      return { valid: false, error: 'Failed to fetch image' };
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer || buffer.byteLength === 0) {
      if (process.env.NODE_ENV === 'development') {
        console.debug(`Empty image buffer from ${url}`);
      }
      return { valid: false, error: 'Empty image buffer' };
    }

    // Get image metadata
    const metadata = await sharp(buffer).metadata();
    const isSvg = metadata.format === 'svg';

    // For SVGs, we don't need size validation
    if (!isSvg && !await isImageLargeEnough(buffer)) {
      if (process.env.NODE_ENV === 'development') {
        console.debug(`Image too small from ${url}`);
      }
      return { valid: false, error: 'Image too small' };
    }

    // For SVGs, keep as is. For other formats, convert to PNG
    const processedBuffer = isSvg ? buffer : await sharp(buffer).png().toBuffer();

    // Create form data with the image
    const formData = new FormData();
    formData.append('image', new Blob([processedBuffer], { type: isSvg ? 'image/svg+xml' : 'image/png' }));

    // Send to validation API using absolute URL
    const validationUrl = new URL('/api/validate-logo', API_BASE_URL).toString();
    const validationResponse = await fetch(validationUrl, {
      method: 'POST',
      body: formData,
      next: { revalidate: 3600 } // Cache for 1 hour
    });

    if (!validationResponse.ok) {
      if (process.env.NODE_ENV === 'development') {
        console.debug('Logo validation API error:', validationResponse.status);
      }
      return { valid: false, error: 'Validation failed' };
    }

    const { isGlobeIcon } = await validationResponse.json();
    return { valid: !isGlobeIcon, buffer: !isGlobeIcon ? processedBuffer : undefined };
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        if (process.env.NODE_ENV === 'development') {
        console.debug(`Timeout fetching image from ${url}`);
      }
        return { valid: false, error: 'Request timeout' };
      }
      console.error(`Error validating image from ${url}:`, error.message);
      return { valid: false, error: error.message };
    }
    return { valid: false, error: 'Unknown error' };
  }
}

/**
 * Try to fetch a logo from multiple sources
 * @param {string} domain - Domain to fetch logo for
 * @returns {Promise<{valid: boolean, buffer?: Buffer, source?: string, error?: string}>} Result
 */
async function tryLogoSources(domain: string): Promise<{
  valid: boolean;
  buffer?: Buffer;
  source?: string;
  error?: string;
}> {
  // Try Google HD (256px)
  const googleHdResult = await fetchAndValidateImage(LOGO_SOURCES.google.hd(domain));
  if (googleHdResult.valid && googleHdResult.buffer) {
    return { ...googleHdResult, source: 'google' };
  }

  // Try Clearbit HD (256px)
  const clearbitHdResult = await fetchAndValidateImage(LOGO_SOURCES.clearbit.hd(domain));
  if (clearbitHdResult.valid && clearbitHdResult.buffer) {
    return { ...clearbitHdResult, source: 'clearbit' };
  }

  // Try Google MD (128px)
  const googleMdResult = await fetchAndValidateImage(LOGO_SOURCES.google.md(domain));
  if (googleMdResult.valid && googleMdResult.buffer) {
    return { ...googleMdResult, source: 'google' };
  }

  // Try Clearbit MD (128px)
  const clearbitMdResult = await fetchAndValidateImage(LOGO_SOURCES.clearbit.md(domain));
  if (clearbitMdResult.valid && clearbitMdResult.buffer) {
    return { ...clearbitMdResult, source: 'clearbit' };
  }

  // Try DuckDuckGo HD as last resort
  const ddgHdResult = await fetchAndValidateImage(LOGO_SOURCES.duckduckgo.hd(domain));
  if (ddgHdResult.valid && ddgHdResult.buffer) {
    return { ...ddgHdResult, source: 'duckduckgo' };
  }

  // Return the most relevant error
  const error = googleHdResult.error || clearbitHdResult.error || googleMdResult.error ||
                clearbitMdResult.error || ddgHdResult.error || 'No valid logo found';
  return { valid: false, error };
}

/**
 * GET handler for logo fetching
 * @param {NextRequest} request - Incoming request
 * @returns {Promise<NextResponse>} API response
 */
// Force static generation
export const dynamic = 'force-static';
export const revalidate = false;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const searchParams = request.nextUrl.searchParams;
  const website = searchParams.get('website');
  const company = searchParams.get('company');

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
        domain = new URL(website).hostname.replace('www.', '');
      } catch {
        // If URL parsing fails, try using the website string directly
        domain = website.replace(/^https?:\/\/(www\.)?/, '').split('/')[0];
      }
    } else {
      domain = company!.toLowerCase().replace(/\s+/g, '');
    }

    // Check cache first
    const cached = ServerCache.getLogoFetch(domain);
    if (cached) {
      // If we have a cached error, return placeholder
      if (cached.error) {
        return NextResponse.redirect(new URL('/images/company-placeholder.svg', request.url), {
          headers: {
            'x-logo-source': ''
          }
        });
      }

      // If we have a cached buffer, return it
      if (cached.buffer) {
        const contentType = cached.buffer[0] === 0x3c ? 'image/svg+xml' : 'image/png';
        return new NextResponse(cached.buffer, {
          headers: {
            'Content-Type': contentType,
            'Cache-Control': 'public, max-age=31536000', // 1 year
            'x-logo-source': cached.source || ''
          }
        });
      }
    }

    // Only try sources if we haven't recently failed
    const result = await tryLogoSources(domain);
    if (result.valid && result.buffer) {
      ServerCache.setLogoFetch(domain, {
        url: null,
        source: result.source as any,
        buffer: result.buffer
      });

      const contentType = result.buffer[0] === 0x3c ? 'image/svg+xml' : 'image/png';
      return new NextResponse(result.buffer, {
        headers: {
          'Content-Type': contentType,
          'Cache-Control': 'public, max-age=31536000',
          'x-logo-source': result.source || ''
        }
      });
    }

    // Cache the failure to prevent retrying too soon
    ServerCache.setLogoFetch(domain, {
      url: null,
      source: null,
      error: result.error || 'Failed to fetch logo'
    });

    // Return placeholder
    return NextResponse.redirect(new URL('/images/company-placeholder.svg', request.url), {
      headers: {
        'x-logo-source': ''
      }
    });
  } catch (error) {
    console.error('Error in logo API:', error);
    return NextResponse.redirect(new URL('/images/company-placeholder.svg', request.url), {
      headers: {
        'x-logo-source': ''
      }
    });
  }
}
