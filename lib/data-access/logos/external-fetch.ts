/**
 * External Logo Fetching
 *
 * @module data-access/logos/external-fetch
 */

import type { LogoSource } from '@/types/logo';
import { LOGO_SOURCES } from '@/lib/constants';
import { getDomainVariants } from '@/lib/utils/domain-utils';
import { processImageBuffer, validateLogoBuffer } from './image-processing';
import { isDebug } from '@/lib/utils/debug';

/**
 * Gets browser-like headers to avoid bot detection.
 */
export function getBrowserHeaders(): Record<string, string> {
  const userAgents: string[] = [
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
  ];

  return {
    'User-Agent': userAgents[Math.floor(Math.random() * userAgents.length)],
    Accept: 'image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    Referer: 'https://www.google.com/',
    'Sec-Fetch-Dest': 'image',
    'Sec-Fetch-Mode': 'no-cors',
    'Sec-Fetch-Site': 'cross-site',
  };
}

/**
 * Fetches a company logo from external providers (Google, DuckDuckGo).
 *
 * @param domain - The domain for which to retrieve the logo
 * @returns Promise with processed logo buffer and source, or null if no valid logo found
 * @remark Uses parallel fetching with 2-second timeout per source to minimize total time
 */
export async function fetchExternalLogo(domain: string): Promise<{ buffer: Buffer; source: LogoSource } | null> {
  const domainVariants: string[] = getDomainVariants(domain);

  // Try domain variants sequentially, but fetch from sources in parallel
  for (const testDomain of domainVariants) {
    const sources: { name: LogoSource; urlFn: (d: string) => string }[] = [
      { name: 'google', urlFn: LOGO_SOURCES.google.hd },
      { name: 'duckduckgo', urlFn: LOGO_SOURCES.duckduckgo.hd },
      // Note: Clearbit removed due to authentication requirements
    ];

    // Create array of fetch promises for parallel execution
    const fetchPromises = sources.map(async ({ name, urlFn }) => {
      const url: string = urlFn(testDomain);
      const controller: AbortController = new AbortController();

      try {
        if (isDebug) console.log(`[DEBUG] Attempting ${name} fetch: ${url}`);

        const timeoutId: NodeJS.Timeout = setTimeout(() => controller.abort(), 2000); // Reduced from 5s to 2s
        let response: Response;
        try {
          response = await fetch(url, {
            signal: controller.signal,
            headers: getBrowserHeaders(),
          });
        } finally {
          clearTimeout(timeoutId);
        }

        if (isDebug) console.log(`[DEBUG] ${name} response status: ${response.status} for ${url}`);
        if (!response.ok) return null;

        // Standard handling for other sources
        const rawBuffer: Buffer = Buffer.from(await response.arrayBuffer());
        if (!rawBuffer || rawBuffer.byteLength < 100) {
          if (isDebug)
            console.log(`[DEBUG] ${name} buffer too small: ${rawBuffer?.byteLength || 0} bytes for ${testDomain}`);
          return null;
        }

        const isValid = await validateLogoBuffer(rawBuffer, url);
        if (isValid) {
          const { processedBuffer } = await processImageBuffer(rawBuffer);
          console.log(`[DataAccess/Logos] Fetched logo for ${domain} from ${name} (using ${testDomain}).`);
          return { buffer: processedBuffer, source: name, controller };
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
        return null;
      } catch (error: unknown) {
        if ((error as Error).name !== 'AbortError') {
          const message: string = error instanceof Error ? error.message : String(error);
          console.warn(`[DataAccess/Logos] Error fetching logo for ${testDomain} from ${name} (${url}):`, message);
        }
        return null;
      }
    });

    // Wait for all promises to settle
    const results = await Promise.allSettled(fetchPromises);

    // Find first successful result
    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) {
        return { buffer: result.value.buffer, source: result.value.source };
      }
    }
  }

  return null;
}

