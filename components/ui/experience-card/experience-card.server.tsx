/**
 * Experience Card Server Component
 * @module components/ui/experience-card/experience-card.server
 * @description
 * Server component that handles logo fetching and processing for experience entries.
 * Uses direct logo fetching to work during build time.
 */

import { getLogo } from "@/lib/data-access/logos";
import { normalizeDomain } from "@/lib/utils/domain-utils";
import { getCompanyPlaceholder } from "@/lib/data-access/default-images";
import type { Experience } from "../../../types/experience";
import { ExperienceCardClient } from "./experience-card.client";

import type { JSX } from "react";

/**
 * Experience Card Server Component
 * @param {Experience} props - Experience entry properties
 * @returns {Promise<JSX.Element>} Pre-rendered experience card with fetched logo
 */
export async function ExperienceCard(props: Experience): Promise<JSX.Element> {
  const { website, company, logo } = props;

  try {
    // If a logo URL is explicitly provided, prefer it.
    if (logo) {
      return <ExperienceCardClient {...props} logoData={{ url: logo, source: null }} />;
    }

    // Otherwise resolve by domain through UnifiedImageService
    const domain = website ? normalizeDomain(website) : normalizeDomain(company);

    const logoResult = await getLogo(domain);

    if (logoResult?.cdnUrl) {
      return (
        <ExperienceCardClient
          {...props}
          logoData={{
            url: logoResult.cdnUrl,
            source: logoResult.source ?? null,
          }}
        />
      );
    }

    // Fallback to placeholder when UnifiedImageService cannot provide one
    return <ExperienceCardClient {...props} logoData={{ url: getCompanyPlaceholder(), source: null }} />;
  } catch (error) {
    console.error("[ExperienceCard] Failed to resolve logo:", error);
    return <ExperienceCardClient {...props} logoData={{ url: getCompanyPlaceholder(), source: null }} />;
  }
}
