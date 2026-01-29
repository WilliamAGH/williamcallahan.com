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
import type { Experience } from "../../../types/experience";
import { ExperienceCardClient } from "./experience-card.client";

import type { JSX } from "react";

/**
 * Experience Card Server Component
 * @param {Experience} props - Experience entry properties
 * @returns {Promise<JSX.Element>} Pre-rendered experience card with fetched logo
 */
export async function ExperienceCard(
  props: Experience & { isDarkTheme?: boolean },
): Promise<JSX.Element> {
  const { website, company, logo, isDarkTheme } = props;

  try {
    if (logo) {
      return <ExperienceCardClient {...props} logoData={{ url: logo, source: null }} />;
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

          return (
            <ExperienceCardClient
              {...props}
              logoData={{
                url: selectedUrl,
                source: manifestEntry.originalSource,
              }}
            />
          );
        }
      } catch (manifestError) {
        console.warn(`[ExperienceCard] Manifest lookup failed for ${domain}:`, manifestError);
      }

      const directLogo = await getLogoCdnData(domain);
      if (directLogo) {
        return <ExperienceCardClient {...props} logoData={directLogo} />;
      }
    }

    return (
      <ExperienceCardClient {...props} logoData={{ url: getCompanyPlaceholder(), source: null }} />
    );
  } catch (error) {
    console.error("[ExperienceCard] Failed to resolve logo:", error);
    return (
      <ExperienceCardClient {...props} logoData={{ url: getCompanyPlaceholder(), source: null }} />
    );
  }
}
