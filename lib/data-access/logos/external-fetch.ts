/**
 * External logo fetching - retrieves logos from Google, Clearbit, DuckDuckGo
 *
 * Priority: Google HD → Clearbit HD → Google MD → Clearbit MD → DuckDuckGo HD
 * Features: URL validation, size validation, validate-logo API integration
 *
 * @module data-access/logos/external-fetch
 */

import { LOGO_SOURCES } from "@/lib/constants";
import { getBaseUrl } from "@/lib/utils/get-base-url";
import { isDebug } from "@/lib/utils/debug";
import { getDomainVariants } from "@/lib/utils/domain-utils";
import type { LogoSource } from "@/types/logo";
import type { ExternalFetchResult } from "@/types/image";
import { processImageBuffer, validateLogoBuffer } from "./image-processing";

/**
 * Gets browser-like headers to avoid bot detection.
 */
export function getBrowserHeaders(): Record<string, string> {
  const userAgents: string[] = [
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15",
  ];

  const selectedUserAgent =
    userAgents[Math.floor(Math.random() * userAgents.length)] ??
    userAgents[0] ??
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

  return {
    "User-Agent": selectedUserAgent,
    Accept: "image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    Referer: "https://www.google.com/",
    "Sec-Fetch-Dest": "image",
    "Sec-Fetch-Mode": "no-cors",
    "Sec-Fetch-Site": "cross-site",
  };
}

/**
 * Fetches a company logo from external providers (Google, DuckDuckGo).
 *
 * @param domain - The domain for which to retrieve the logo
 * @returns Promise with processed logo buffer and source, or null if no valid logo found
 * @remark Uses parallel fetching with 2-second timeout per source to minimize total time
 */
export async function fetchExternalLogo(
  domain: string,
): Promise<ExternalFetchResult | null> {
  const domainVariants: string[] = getDomainVariants(domain);

  // Try domain variants sequentially
  for (const testDomain of domainVariants) {
    // Try sources in priority order (sequential to respect preference)
    const sources: Array<{ name: LogoSource; urlFn: (d: string) => string; size: string }> = [
      // HD sizes (256px) - preferred
      { name: "google", urlFn: LOGO_SOURCES.google.hd, size: "hd" },
      { name: "clearbit", urlFn: LOGO_SOURCES.clearbit.hd, size: "hd" },
      // MD sizes (128px) - fallback
      { name: "google", urlFn: LOGO_SOURCES.google.md, size: "md" },
      { name: "clearbit", urlFn: LOGO_SOURCES.clearbit.md, size: "md" },
      // DuckDuckGo HD as last resort
      { name: "duckduckgo", urlFn: LOGO_SOURCES.duckduckgo.hd, size: "hd" },
    ];

    // Try each source sequentially (not in parallel) to respect priority order
    for (const { name, urlFn, size } of sources) {
      const url: string = urlFn(testDomain);
      const controller: AbortController = new AbortController();

      try {
        if (isDebug) console.log(`[DEBUG] Attempting ${name} (${size}) fetch: ${url}`);

        const timeoutId: NodeJS.Timeout = setTimeout(() => controller.abort(), 5000); // 5s timeout like original
        let response: Response;
        try {
          response = await fetch(url, {
            signal: controller.signal,
            headers: getBrowserHeaders(),
          });
        } finally {
          clearTimeout(timeoutId);
        }

        if (isDebug) console.log(`[DEBUG] ${name} (${size}) response status: ${response.status} for ${url}`);
        if (!response.ok) continue;

        // Standard handling for all sources
        const rawBuffer: Buffer = Buffer.from(await response.arrayBuffer());
        if (!rawBuffer || rawBuffer.byteLength < 100) {
          if (isDebug)
            console.log(
              `[DEBUG] ${name} (${size}) buffer too small: ${rawBuffer?.byteLength || 0} bytes for ${testDomain}`,
            );
          // Buffer too small, move to next source
        }

        const isValid = await validateLogoBuffer(rawBuffer, url);
        if (isValid) {
          const { processedBuffer, contentType } = await processImageBuffer(rawBuffer);

          // Additional validation using the validate-logo endpoint if available
          // Skip during build phase to avoid circular dependencies
          const baseUrl: string | undefined = getBaseUrl();
          if (baseUrl && !process.env.NEXT_PHASE?.includes("build")) {
            try {
              const validateUrl: URL = new URL("/api/validate-logo", baseUrl);
              const formData: FormData = new FormData();
              formData.append("image", new Blob([processedBuffer], { type: contentType }));

              const validateResponse = await fetch(validateUrl.toString(), {
                method: "POST",
                body: formData,
              });

              if (validateResponse.ok) {
                const validateResult = (await validateResponse.json()) as { isGlobeIcon: boolean };
                const { isGlobeIcon } = validateResult;
                if (isGlobeIcon) {
                  if (isDebug)
                    console.log(`[DEBUG] ${name} detected as globe icon by validate-logo API for ${testDomain}`);
                  return null;
                }
              }
            } catch (validateError) {
              // If validation fails, continue with the logo (don't block on validation errors)
              if (isDebug) console.log(`[DEBUG] validate-logo API error for ${testDomain}:`, validateError);
            }
          }

          console.log(`[DataAccess/Logos] Fetched logo for ${domain} from ${name} (${size}) using ${testDomain}`);
          return { buffer: processedBuffer, source: name, contentType, url };
        }

        // Debug: show why validation failed
        if (isDebug) {
          try {
            const sharp = await import("sharp");
            const metadata = await sharp.default(rawBuffer).metadata();
            console.log(
              `[DEBUG] ${name} (${size}) validation failed for ${testDomain}: ${metadata.width}x${metadata.height} (${metadata.format})`,
            );
          } catch {
            console.log(`[DEBUG] ${name} (${size}) validation failed for ${testDomain}: metadata error`);
          }
        }
        // Move to next source
      } catch (error: unknown) {
        if ((error as Error).name !== "AbortError") {
          const message: string = error instanceof Error ? error.message : String(error);
          console.warn(
            `[DataAccess/Logos] Error fetching logo for ${testDomain} from ${name} (${size}) at ${url}: ${message}`,
          );
        }
        // Move to next source
      }
    }
  }

  return null;
}
