/* eslint-disable s3/no-hardcoded-images */
/**
 * Server-only utilities for processing Education and Certification data,
 * specifically handling logo fetching and placeholder generation.
 */
import "server-only"; // Ensure this module is never bundled for the client

import { getLogoCdnData } from "@/lib/data-access/logos";
import { normalizeDomain } from "@/lib/utils/domain-utils";
import type { Certification, Class, Education, EducationLogoData } from "@/types/education";
import { assertServerOnly } from "./utils/ensure-server-only"; // Import the assertion utility
import { getStaticImageUrl } from "@/lib/data-access/static-images";
import { getLogoFromManifestAsync } from "@/lib/image-handling/image-manifest-loader";

/**
 * Gets the placeholder SVG URL.
 * @returns {string} Placeholder SVG URL.
 */
function getPlaceholderSvgUrl(): string {
  // Use static URL for placeholder - served directly by Next.js
  return getStaticImageUrl("/images/company-placeholder.svg");
}

/**
 * Processes a single education item to add logo data.
 * @param {Education} item - The raw education item.
 * @returns {Promise<Education & { logoData: EducationLogoData }>} The item with added logoData.
 */
export async function processEducationItem<T extends Education>(
  item: T,
  options: { isDarkTheme?: boolean } = {},
): Promise<T & { logoData: EducationLogoData; error?: string }> {
  assertServerOnly(); // Assert server context
  const { website, institution, logo } = item;
  const { isDarkTheme } = options;
  let logoData: EducationLogoData;
  let error: string | undefined;

  const domain = website ? normalizeDomain(website) : normalizeDomain(institution);

  try {
    if (logo) {
      // If a specific logo path or URL is provided, resolve /images/ paths to CDN via getStaticImageUrl()
      const resolvedUrl = logo.startsWith("/images/") ? getStaticImageUrl(logo) : logo;
      logoData = { url: resolvedUrl, source: null };
    } else {
      // Prefer manifest lookup for potential inverted URL
      const manifestEntry = domain ? await getLogoFromManifestAsync(domain) : null;

      if (manifestEntry) {
        const selectedUrl =
          isDarkTheme && manifestEntry.invertedCdnUrl
            ? manifestEntry.invertedCdnUrl
            : manifestEntry.cdnUrl;
        logoData = { url: selectedUrl, source: manifestEntry.originalSource };
      } else {
        const directLogo = domain ? await getLogoCdnData(domain) : null;
        if (directLogo) {
          logoData = directLogo;
        } else {
          logoData = { url: getPlaceholderSvgUrl(), source: "placeholder" };
        }
      }
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    console.error(`Error processing logo for education item "${institution}":`, err);
    error = `Failed to process logo: ${errorMessage}`;
    const directLogo = domain ? await getLogoCdnData(domain) : null;
    if (directLogo) {
      logoData = directLogo;
    } else {
      logoData = { url: getPlaceholderSvgUrl(), source: "placeholder-error" };
    }
  }

  return error ? { ...item, logoData, error } : { ...item, logoData };
}

/**
 * Processes a single certification or class item to add logo data.
 * @param {Certification | Class} item - The raw certification or class item.
 * @returns {Promise<(Certification | Class) & { logoData: EducationLogoData }>} The item with added logoData.
 */
export async function processCertificationItem<T extends Certification | Class>(
  item: T,
  options: { isDarkTheme?: boolean } = {},
): Promise<T & { logoData: EducationLogoData; error?: string }> {
  assertServerOnly(); // Assert server context
  const { website, name, logo } = item;
  const { isDarkTheme } = options;
  let logoData: EducationLogoData;
  let error: string | undefined;

  const domain = website ? normalizeDomain(website) : normalizeDomain(name);

  try {
    if (logo) {
      // If a specific logo path or URL is provided, resolve /images/ paths to CDN via getStaticImageUrl()
      const resolvedUrl = logo.startsWith("/images/") ? getStaticImageUrl(logo) : logo;
      logoData = { url: resolvedUrl, source: null };
    } else {
      const manifestEntry = domain ? await getLogoFromManifestAsync(domain) : null;

      if (manifestEntry) {
        const selectedUrl =
          isDarkTheme && manifestEntry.invertedCdnUrl
            ? manifestEntry.invertedCdnUrl
            : manifestEntry.cdnUrl;
        logoData = { url: selectedUrl, source: manifestEntry.originalSource };
      } else {
        const directLogo = domain ? await getLogoCdnData(domain) : null;
        if (directLogo) {
          logoData = directLogo;
        } else {
          logoData = { url: getPlaceholderSvgUrl(), source: "placeholder" };
        }
      }
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    console.error(`Error processing logo for certification item "${name}":`, err);
    error = `Failed to process logo: ${errorMessage}`;
    const directLogo = domain ? await getLogoCdnData(domain) : null;
    if (directLogo) {
      logoData = directLogo;
    } else {
      logoData = { url: getPlaceholderSvgUrl(), source: "placeholder-error" };
    }
  }

  return error ? { ...item, logoData, error } : { ...item, logoData };
}
