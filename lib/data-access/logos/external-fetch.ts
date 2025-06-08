/**
 * External Logo Fetching
 *
 * @module data-access/logos/external-fetch
 */

import type { LogoSource } from '@/types';
import { LOGO_SOURCES } from '@/lib/constants';
import { getDomainVariants } from '@/lib/utils/domain-utils';
import { processImageBuffer, validateLogoBuffer } from './image-processing';
import { isDebug } from '@/lib/utils/debug';

/**
 * Gets browser-like headers to avoid bot detection.
 */
function getBrowserHeaders(): Record<string, string> {
  const userAgents: string[] = [
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15'
  ];
  
  return {
    'User-Agent': userAgents[Math.floor(Math.random() * userAgents.length)],
    'Accept': 'image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Referer': 'https://www.google.com/',
    'Sec-Fetch-Dest': 'image',
    'Sec-Fetch-Mode': 'no-cors',
    'Sec-Fetch-Site': 'cross-site'
  };
}

/**
 * Extracts favicon from HTML content.
 */
async function extractFaviconFromHtml(domain: string): Promise<{ buffer: Buffer; source: LogoSource } | null> {
  try {
    const controller: AbortController = new AbortController();
    const timeoutId: NodeJS.Timeout = setTimeout(() => controller.abort(), 5000);
    let response: Response;
    try {
      response = await fetch(`https://${domain}`, {
        signal: controller.signal,
        headers: getBrowserHeaders()
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) return null;
    const html: string = await response.text();

    // Look for favicon links in order of preference
    const faviconPatterns: RegExp[] = [
      /<link[^>]+rel=["'](?:icon|shortcut icon|apple-touch-icon)["'][^>]+href=["']([^"']+)["']/gi,
      /<link[^>]+href=["']([^"']+)["'][^>]+rel=["'](?:icon|shortcut icon|apple-touch-icon)["']/gi
    ];

    for (const pattern of faviconPatterns) {
      let match: RegExpExecArray | null;
      // biome-ignore lint/suspicious/noAssignInExpressions: Need to iterate through regex matches
      while ((match = pattern.exec(html)) !== null) {
        let faviconUrl: string | undefined = match[1];

        if (!faviconUrl) continue;

        // Handle relative URLs
        if (faviconUrl.startsWith('//')) {
          faviconUrl = `https:${faviconUrl}`;
        } else if (faviconUrl.startsWith('/')) {
          faviconUrl = `https://${domain}${faviconUrl}`;
        } else if (!faviconUrl.startsWith('http')) {
          faviconUrl = `https://${domain}/${faviconUrl}`;
        }

        // Try to fetch the favicon
        try {
          const faviconController: AbortController = new AbortController();
          const faviconTimeoutId: NodeJS.Timeout = setTimeout(() => faviconController.abort(), 3000);
          let faviconResponse: Response;
          try {
            faviconResponse = await fetch(faviconUrl, {
              signal: faviconController.signal,
              headers: getBrowserHeaders()
            });
          } finally {
            clearTimeout(faviconTimeoutId);
          }

          if (faviconResponse.ok) {
            const buffer: Buffer = Buffer.from(await faviconResponse.arrayBuffer());
            if (buffer.byteLength > 100 && await validateLogoBuffer(buffer, faviconUrl)) {
              console.log(`[DataAccess/Logos] Extracted favicon for ${domain} from HTML.`);
              return { buffer, source: 'unknown' };
            }
          }
        } catch {
          // Continue to next favicon candidate
        }
      }
    }

    // Try default favicon.ico as last resort
    try {
      const faviconController: AbortController = new AbortController();
      const faviconTimeoutId: NodeJS.Timeout = setTimeout(() => faviconController.abort(), 3000);
      let faviconResponse: Response;
      try {
        faviconResponse = await fetch(`https://${domain}/favicon.ico`, {
          signal: faviconController.signal,
          headers: getBrowserHeaders()
        });
      } finally {
        clearTimeout(faviconTimeoutId);
      }

      if (faviconResponse.ok) {
        const buffer: Buffer = Buffer.from(await faviconResponse.arrayBuffer());
        if (buffer.byteLength > 100 && await validateLogoBuffer(buffer, `https://${domain}/favicon.ico`)) {
          console.log(`[DataAccess/Logos] Found default favicon.ico for ${domain}.`);
          return { buffer, source: 'unknown' };
        }
      }
    } catch {
      // Favicon.ico not found
    }

  } catch (error) {
    // Handle domain resolution and network errors more gracefully
    if (error instanceof Error) {
      // Check direct error message for various connection issues
      if (error.message.includes('ENOTFOUND') || 
          error.message.includes('getaddrinfo') ||
          error.message.includes('Unable to connect') ||
          error.message.includes('ConnectionRefused') ||
          error.message.includes('ECONNREFUSED')) {
        if (isDebug) console.log(`[DataAccess/Logos] Connection failed for ${domain} (${error.message.split('\n')[0]}).`);
        return null;
      }
      
      // Check for fetch failed with DNS/connection errors in cause (Node.js 18+ fetch API)
      if (error.message.includes('fetch failed') && error.cause && 
          typeof error.cause === 'object' && 'code' in error.cause) {
        const causeCode = error.cause.code;
        if (causeCode === 'ENOTFOUND') {
          if (isDebug) console.log(`[DataAccess/Logos] Domain ${domain} not found (DNS resolution failed).`);
          return null;
        }
        if (causeCode === 'ConnectionRefused' || causeCode === 'ECONNREFUSED') {
          if (isDebug) console.log(`[DataAccess/Logos] Connection refused for ${domain}.`);
          return null;
        }
      }
      
      if (error.name === 'AbortError') {
        if (isDebug) console.log(`[DataAccess/Logos] Timeout extracting favicon from HTML for ${domain}.`);
        return null;
      }
    }
    
    // For any non-object errors or unhandled cases, still be graceful
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (isDebug) console.warn(`[DataAccess/Logos] Error extracting favicon from HTML for ${domain}:`, errorMessage);
  }

  return null;
}

/**
 * Fetches a company logo from external providers (Google, DuckDuckGo).
 *
 * @param domain - The domain for which to retrieve the logo
 * @returns Promise with processed logo buffer and source, or null if no valid logo found
 * @remark Only returns logos passing validation checks with 5-second timeout per source
 */
export async function fetchExternalLogo(domain: string): Promise<{ buffer: Buffer; source: LogoSource } | null> {
  const domainVariants: string[] = getDomainVariants(domain);

  for (const testDomain of domainVariants) {
    const sources: { name: LogoSource; urlFn: (d: string) => string }[] = [
      { name: 'google', urlFn: LOGO_SOURCES.google.hd },
      { name: 'google', urlFn: LOGO_SOURCES.google.md },
      { name: 'duckduckgo', urlFn: LOGO_SOURCES.duckduckgo.hd },
      // Note: Clearbit removed due to authentication requirements
    ];

    for (const { name, urlFn } of sources) {
      const url: string = urlFn(testDomain);
      try {
        if (isDebug) console.log(`[DEBUG] Attempting ${name} fetch: ${url}`);
        
        const controller: AbortController = new AbortController();
        const timeoutId: NodeJS.Timeout = setTimeout(() => controller.abort(), 5000);
        let response: Response;
        try {
          response = await fetch(url, {
            signal: controller.signal,
            headers: getBrowserHeaders()
          });
        } finally {
          clearTimeout(timeoutId);
        }
        
        if (isDebug) console.log(`[DEBUG] ${name} response status: ${response.status} for ${url}`);
        if (!response.ok) continue;

        // Standard handling for other sources
        const rawBuffer: Buffer = Buffer.from(await response.arrayBuffer());
        if (!rawBuffer || rawBuffer.byteLength < 100) {
          if (isDebug) console.log(`[DEBUG] ${name} buffer too small: ${rawBuffer?.byteLength || 0} bytes for ${testDomain}`);
          continue;
        }
        
        const isValid = await validateLogoBuffer(rawBuffer, url);
        if (isValid) {
          const { processedBuffer } = await processImageBuffer(rawBuffer);
          console.log(`[DataAccess/Logos] Fetched logo for ${domain} from ${name} (using ${testDomain}).`);
          return { buffer: processedBuffer, source: name };
        }
        
        // Debug: show why validation failed
        if (isDebug) {
          try {
            const sharp = await import('sharp');
            const metadata = await sharp.default(rawBuffer).metadata();
            console.log(`[DEBUG] ${name} validation failed for ${testDomain}: ${metadata.width}x${metadata.height} (${metadata.format})`);
          } catch {
            console.log(`[DEBUG] ${name} validation failed for ${testDomain}: metadata error`);
          }
        }
      } catch (error: unknown) {
        if ((error as Error).name !== 'AbortError') {
          const message: string = error instanceof Error ? error.message : String(error);
          console.warn(`[DataAccess/Logos] Error fetching logo for ${testDomain} from ${name} (${url}):`, message);
        }
      }
    }
  }

  // If all API sources fail, try HTML favicon extraction on original domain
  const htmlFavicon: { buffer: Buffer; source: LogoSource } | null = await extractFaviconFromHtml(domain);
  if (htmlFavicon) {
    const { processedBuffer } = await processImageBuffer(htmlFavicon.buffer);
    return { buffer: processedBuffer, source: htmlFavicon.source };
  }

  return null;
}

