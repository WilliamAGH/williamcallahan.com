/**
 * Experience Card Server Component
 * @module components/ui/experience-card/experience-card.server
 * @description
 * Server component that handles logo fetching and processing for experience entries.
 * Uses direct logo fetching to work during build time.
 */

import { getLogoCdnData } from "@/lib/data-access/logos";
import { getLogoFromManifestAsync } from "@/lib/image-handling/image-manifest-loader";
import { normalizeDomain } from "@/lib/utils/domain-utils";
import { getCompanyPlaceholder } from "@/lib/data-access/placeholder-images";
import type { Experience } from "@/types/schemas/experience";
import { ExperienceCardClient } from "./experience-card.client";

import type { ComponentProps, JSX } from "react";

type ExperienceLogoData = ComponentProps<typeof ExperienceCardClient>["logoData"];

/** Resolves the experience logo: explicit logo, then manifest, then direct CDN, then placeholder. */
async function resolveExperienceLogo({
  website,
  company,
  logo,
  isDarkTheme,
}: Experience & { isDarkTheme?: boolean }): Promise<ExperienceLogoData> {
  if (logo) {
    return { url: logo, source: null };
  }

  const domain = website ? normalizeDomain(website) : normalizeDomain(company);

  if (domain) {
    try {
      const manifestEntry = await getLogoFromManifestAsync(domain);
      if (manifestEntry) {
        const selectedUrl =
          isDarkTheme && manifestEntry.invertedCdnUrl
            ? manifestEntry.invertedCdnUrl
            : manifestEntry.cdnUrl;
        return { url: selectedUrl, source: manifestEntry.originalSource };
      }
    } catch (manifestError) {
      console.warn(`[ExperienceCard] Manifest lookup failed for ${domain}:`, manifestError);
    }

    const directLogo = await getLogoCdnData(domain);
    if (directLogo) {
      return directLogo;
    }
  }

  return { url: getCompanyPlaceholder(), source: null };
}

/**
 * Experience Card Server Component
 * @param {Experience} props - Experience entry properties
 * @returns {Promise<JSX.Element>} Pre-rendered experience card with fetched logo
 */
export async function ExperienceCard(
  props: Experience & { isDarkTheme?: boolean },
): Promise<JSX.Element> {
  let logoData: ExperienceLogoData;
  try {
    logoData = await resolveExperienceLogo(props);
  } catch (error) {
    console.error("[ExperienceCard] Failed to resolve logo:", error);
    logoData = { url: getCompanyPlaceholder(), source: null };
  }

  return <ExperienceCardClient {...props} logoData={logoData} />;
}
