/**
 * Server-only utilities for processing Education and Certification data,
 * specifically handling logo fetching and placeholder generation.
 */
import "server-only"; // Ensure this module is never bundled for the client

import { getLogo } from "@/lib/data-access/logos";
import { normalizeDomain } from "@/lib/utils/domain-utils";
import type { Certification, Class, Education, EducationLogoData } from "../types/education";
import { assertServerOnly } from "./utils/ensure-server-only"; // Import the assertion utility

/**
 * Gets the placeholder SVG URL.
 * @returns {string} Placeholder SVG URL.
 */
function getPlaceholderSvgUrl(): string {
  // Use static URL for placeholder - served directly by Next.js
  return "/images/company-placeholder.svg";
}

/**
 * Processes a single education item to add logo data.
 * @param {Education} item - The raw education item.
 * @returns {Promise<Education & { logoData: EducationLogoData }>} The item with added logoData.
 */
export async function processEducationItem<T extends Education>(item: T): Promise<T & { logoData: EducationLogoData }> {
  assertServerOnly(); // Assert server context
  const { website, institution, logo } = item;
  let logoData: EducationLogoData;

  try {
    if (logo) {
      // If a specific logo URL is provided, treat it as definitive
      logoData = { url: logo, source: null };
    } else {
      // Otherwise, fetch by domain
      const domain = website ? normalizeDomain(website) : normalizeDomain(institution);
      const logoResult = await getLogo(domain);

      if (logoResult?.cdnUrl) {
        // Use CDN URL directly from S3
        logoData = { url: logoResult.cdnUrl, source: logoResult.source };
      } else {
        logoData = { url: getPlaceholderSvgUrl(), source: "placeholder" };
      }
    }
  } catch (error) {
    console.error(`Error processing logo for education item "${institution}":`, error);
    logoData = { url: getPlaceholderSvgUrl(), source: "placeholder-error" };
  }

  return { ...item, logoData };
}

/**
 * Processes a single certification or class item to add logo data.
 * @param {Certification | Class} item - The raw certification or class item.
 * @returns {Promise<(Certification | Class) & { logoData: EducationLogoData }>} The item with added logoData.
 */
export async function processCertificationItem<T extends Certification | Class>(
  item: T,
): Promise<T & { logoData: EducationLogoData }> {
  assertServerOnly(); // Assert server context
  const { website, name, logo } = item;
  let logoData: EducationLogoData;

  try {
    if (logo) {
      logoData = { url: logo, source: null };
    } else {
      const domain = website ? normalizeDomain(website) : normalizeDomain(name);
      const logoResult = await getLogo(domain);

      if (logoResult?.cdnUrl) {
        // Use CDN URL directly from S3
        logoData = { url: logoResult.cdnUrl, source: logoResult.source };
      } else {
        logoData = { url: getPlaceholderSvgUrl(), source: "placeholder" };
      }
    }
  } catch (error) {
    console.error(`Error processing logo for certification item "${name}":`, error);
    logoData = { url: getPlaceholderSvgUrl(), source: "placeholder-error" };
  }

  return { ...item, logoData };
}
