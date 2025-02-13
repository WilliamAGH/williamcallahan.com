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
import { ServerCacheInstance } from '../../../lib/serverCache';
import { LOGO_SOURCES, GENERIC_GLOBE_PATTERNS, LOGO_SIZES } from '../../../lib/constants';
import type { LogoSource } from '../../../types/logo';
import sharp from 'sharp';
import fs from 'fs/promises';
import path from 'path';
import { createHash } from 'crypto';

/**
 * Result of a logo fetch and validation operation
 * @interface
 */
interface LogoValidationResult {
  /** Whether the validation was successful */
  valid: boolean;
  /** The image buffer if validation was successful */
  buffer?: Buffer;
  /** The error message if validation failed */
  error?: string;
}

/**
 * Result of a logo fetch operation from multiple sources
 * @interface
 */
interface LogoFetchResult {
  /** Whether the fetch was successful */
  valid: boolean;
  /** The image buffer if fetch was successful */
  buffer?: Buffer;
  /** The source of the logo if fetch was successful */
  source?: LogoSource;
  /** The error message if fetch failed */
  error?: string;
}

// Cache for placeholder SVG
let placeholderSvg: Buffer | null = null;

/**
 * Get placeholder SVG content
 * @returns {Promise<Buffer>} Placeholder SVG buffer
 */
async function getPlaceholder(): Promise<Buffer> {
  if (!placeholderSvg) {
    placeholderSvg = await fs.readFile(path.join(process.cwd(), 'public/images/company-placeholder.svg'));
  }
  return placeholderSvg;
}

/**
 * Generate a hash for the domain to use as filename
 * @param {string} domain - Domain to hash
 * @returns {string} Hashed filename
 */
function getDomainHash(domain: string): string {
  return createHash('md5').update(domain).digest('hex');
}

/**
 * Get the path for storing a logo
 * @param {string} domain - Domain the logo is for
 * @param {string} source - Source of the logo (google, clearbit, etc.)
 * @returns {string} Path to store the logo
 */
function getLogoPath(domain: string, source: string): string {
  const hash = getDomainHash(domain);
  return path.join(process.cwd(), 'public', 'logos', `${hash}-${source}.png`);
}

/**
 * Ensure the logos directory exists
 * @returns {Promise<boolean>} Whether the directory is available and writable
 */
async function ensureLogosDirectory(): Promise<boolean> {
  const logosDir = path.join(process.cwd(), 'public', 'logos');
  try {
    // Try to access or create the directory
    try {
      await fs.access(logosDir);
    } catch {
      await fs.mkdir(logosDir, { recursive: true });
    }

    // Verify we can write to the directory
    const testFile = path.join(logosDir, '.write-test');
    await fs.writeFile(testFile, '');
    await fs.unlink(testFile);
    return true;
  } catch (error) {
    console.warn('Logo directory not writable:', error);
    return false;
  }
}

/**
 * Try to read a logo from disk
 * @param {string} logoPath - Path to the logo file
 * @returns {Promise<Buffer | null>} Logo buffer or null if not found/readable
 */
async function readLogoFromDisk(logoPath: string): Promise<Buffer | null> {
  try {
    return await fs.readFile(logoPath);
  } catch {
    return null;
  }
}

/**
 * Try to write a logo to disk
 * @param {string} logoPath - Path to write the logo
 * @param {Buffer} buffer - Logo data to write
 * @returns {Promise<boolean>} Whether the write was successful
 */
async function writeLogoToDisk(logoPath: string, buffer: Buffer): Promise<boolean> {
  try {
    await fs.writeFile(logoPath, buffer);
    return true;
  } catch (error) {
    console.warn('Failed to write logo to disk:', error);
    return false;
  }
}

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
 * @param {string} baseUrl - Base URL for validation endpoint
 * @returns {Promise<LogoValidationResult>} Validation result
 */
async function fetchAndValidateImage(url: string, baseUrl: string): Promise<LogoValidationResult> {
  // Check URL pattern first for early rejection
  if (isGenericGlobeIcon(url)) {
    console.debug(`Blocked generic globe icon URL: ${url}`);
    return { valid: false, error: 'Failed to fetch logo' };
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
      return { valid: false, error: 'Failed to fetch logo' };
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer || buffer.byteLength === 0) {
      if (process.env.NODE_ENV === 'development') {
        console.debug(`Empty image buffer from ${url}`);
      }
      return { valid: false, error: 'Failed to fetch logo' };
    }

    // Get image metadata
    const metadata = await sharp(buffer).metadata();
    const isSvg = metadata.format === 'svg';

    // For SVGs, we don't need size validation
    if (!isSvg && !await isImageLargeEnough(buffer)) {
      if (process.env.NODE_ENV === 'development') {
        console.debug(`Image too small from ${url}`);
      }
      return { valid: false, error: 'Failed to fetch logo' };
    }

    // For SVGs, keep as is. For other formats, convert to PNG
    const processedBuffer = isSvg ? buffer : await sharp(buffer).png().toBuffer();

    // Create form data with the image
    const formData = new FormData();
    formData.append('image', new Blob([processedBuffer], { type: isSvg ? 'image/svg+xml' : 'image/png' }));

    // Send to validation API using absolute URL
    try {
      const validateUrl = new URL('/api/validate-logo', baseUrl);
      const response2 = await fetch(validateUrl.toString(), {
        method: 'POST',
        body: formData,
        next: { revalidate: 3600 } // Cache for 1 hour
      });

      if (!response2.ok) {
        if (process.env.NODE_ENV === 'development') {
          console.debug('Logo validation API error:', response2.status);
        }
        return { valid: false, error: 'Failed to fetch logo' };
      }

      const { isGlobeIcon } = await response2.json();
      if (isGlobeIcon) {
        return { valid: false, error: 'Failed to fetch logo' };
      }
      return { valid: true, buffer: processedBuffer };
    } catch (error) {
      // In case of validation error, assume the logo is valid if we have a buffer
      return { valid: true, buffer: processedBuffer };
    }
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        if (process.env.NODE_ENV === 'development') {
          console.debug(`Timeout fetching image from ${url}`);
        }
        return { valid: false, error: 'Failed to fetch logo' };
      }
      console.error(`Error validating image from ${url}:`, error.message);
      return { valid: false, error: 'Failed to fetch logo' };
    }
    return { valid: false, error: 'Failed to fetch logo' };
  }
}

/**
 * Try to fetch a logo from multiple sources
 * @param {string} domain - Domain to fetch logo for
 * @param {string} baseUrl - Base URL for validation endpoint
 * @returns {Promise<LogoFetchResult>} Result
 */
async function tryLogoSources(domain: string, baseUrl: string): Promise<LogoFetchResult> {
  // Try Google HD (256px)
  const googleHdResult = await fetchAndValidateImage(LOGO_SOURCES.google.hd(domain), baseUrl);
  if (googleHdResult.valid && googleHdResult.buffer) {
    return { ...googleHdResult, source: 'google' };
  }

  // Try Clearbit HD (256px)
  const clearbitHdResult = await fetchAndValidateImage(LOGO_SOURCES.clearbit.hd(domain), baseUrl);
  if (clearbitHdResult.valid && clearbitHdResult.buffer) {
    return { ...clearbitHdResult, source: 'clearbit' };
  }

  // Try Google MD (128px)
  const googleMdResult = await fetchAndValidateImage(LOGO_SOURCES.google.md(domain), baseUrl);
  if (googleMdResult.valid && googleMdResult.buffer) {
    return { ...googleMdResult, source: 'google' };
  }

  // Try Clearbit MD (128px)
  const clearbitMdResult = await fetchAndValidateImage(LOGO_SOURCES.clearbit.md(domain), baseUrl);
  if (clearbitMdResult.valid && clearbitMdResult.buffer) {
    return { ...clearbitMdResult, source: 'clearbit' };
  }

  // Try DuckDuckGo HD as last resort
  const ddgHdResult = await fetchAndValidateImage(LOGO_SOURCES.duckduckgo.hd(domain), baseUrl);
  if (ddgHdResult.valid && ddgHdResult.buffer) {
    return { ...ddgHdResult, source: 'duckduckgo' };
  }

  return { valid: false, error: 'Failed to fetch logo' };
}

/**
 * GET handler for logo fetching
 * @param {NextRequest} request - Incoming request
 * @returns {Promise<NextResponse>} API response
 */
// Configure dynamic API route with caching
export const dynamic = 'force-dynamic';
export const revalidate = 3600;

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
    } else if (company) {
      domain = company.toLowerCase().replace(/\s+/g, '');
    } else {
      throw new Error('Website or company name required');
    }

    // Check if filesystem storage is available
    const hasFileSystem = await ensureLogosDirectory();

    // Check cache first
    const cached = ServerCacheInstance.getLogoFetch(domain);
    if (cached) {
      // If we have a cached error, return 404
      if (cached.error) {
        return new NextResponse(null, {
          status: 404,
          headers: {
            'x-logo-error': cached.error
          }
        });
      }

      // If we have a cached buffer, return it
      if (cached.buffer) {
        const contentType = cached.buffer[0] === 0x3c ? 'image/svg+xml' : 'image/png';
        return new NextResponse(cached.buffer, {
          headers: {
            'Content-Type': contentType,
            'Cache-Control': 'public, max-age=31536000',
            'x-logo-source': cached.source || ''
          }
        });
      }
    }

    // Check filesystem if available
    if (hasFileSystem) {
      for (const source of ['google', 'clearbit', 'duckduckgo'] as const) {
        const logoPath = getLogoPath(domain, source);
        const buffer = await readLogoFromDisk(logoPath);
        if (buffer) {
          // Update memory cache with the stored logo
          ServerCacheInstance.setLogoFetch(domain, {
            url: null,
            source,
            buffer
          });
          return new NextResponse(buffer, {
            headers: {
              'Content-Type': 'image/png',
              'Cache-Control': 'public, max-age=31536000',
              'x-logo-source': source
            }
          });
        }
      }
    }

    // Try to fetch logo from sources
    const result = await tryLogoSources(domain, request.nextUrl.origin);
    if (result.valid && result.buffer && result.source) {
      // Try to store on filesystem if available
      if (hasFileSystem) {
        const logoPath = getLogoPath(domain, result.source);
        await writeLogoToDisk(logoPath, result.buffer);
      }

      // Update memory cache
      ServerCacheInstance.setLogoFetch(domain, {
        url: null,
        source: result.source,
        buffer: result.buffer
      });

      const contentType = result.buffer[0] === 0x3c ? 'image/svg+xml' : 'image/png';
      return new NextResponse(result.buffer, {
        status: 200,
        headers: {
          'Content-Type': contentType,
          'Cache-Control': 'public, max-age=31536000',
          'x-logo-source': result.source || ''
        }
      });
    }

    // Cache the failure to prevent retrying too soon
    ServerCacheInstance.setLogoFetch(domain, {
      url: null,
      source: null,
      error: 'Failed to fetch logo'
    });

    // Return error response
    return new NextResponse(null, {
      status: 404,
      headers: {
        'x-logo-error': 'Failed to fetch logo'
      }
    });
  } catch (error) {
    console.error('Error in logo API:', error);
    return new NextResponse(null, {
      status: 404,
      headers: {
        'x-logo-error': 'Failed to fetch logo'
      }
    });
  }
}
