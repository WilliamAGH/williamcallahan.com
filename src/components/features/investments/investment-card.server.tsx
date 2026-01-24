/**
 * Investment Card Server Component
 * @module components/features/investments/investment-card.server
 * @description
 * Server component that handles logo fetching and processing for investment entries.
 * Uses dynamic logo fetching with S3 caching and external API fallbacks.
 */

import type { Investment } from "../../../types/investment";
import { InvestmentCardClient } from "./investment-card.client";
import { getLogoFromManifestAsync } from "@/lib/image-handling/image-manifest-loader";
import { normalizeDomain } from "@/lib/utils/domain-utils";
import type { ReactElement } from "react";
import { getLogoCdnData, getRuntimeLogoUrl } from "@/lib/data-access/logos";
import { getCompanyPlaceholder } from "@/lib/data-access/placeholder-images";
import type { InvestmentCardExtendedProps } from "@/types/features/investments";

/**
 * Resolves the logo data and supporting props for an investment card without creating a React element.
 * This allows callers to enrich investment data while retaining control over rendering to reduce
 * memory pressure during large page prerenders.
 */
export async function resolveInvestmentCardData(
  investment: Investment & { logoOnlyDomain?: string | null; isDarkTheme?: boolean },
): Promise<InvestmentCardExtendedProps> {
  const { logo, name, website, logoOnlyDomain, isDarkTheme, ...rest } = investment;
  const normalizedInvestment = {
    ...rest,
    logo,
    name,
    website,
    logoOnlyDomain,
  } as Investment & { logoOnlyDomain?: string | null };

  const normalizeForLookup = (input?: string | null): string | null => {
    return input ? normalizeDomain(input) : null;
  };

  const effectiveDomain = normalizeForLookup(logoOnlyDomain) ?? normalizeForLookup(website) ?? normalizeForLookup(name);

  if (logo) {
    return {
      ...normalizedInvestment,
      logoData: { url: logo, source: "static" },
    };
  }

  if (!effectiveDomain) {
    return {
      ...normalizedInvestment,
      logoData: { url: getCompanyPlaceholder(), source: null },
    };
  }

  try {
    const manifestEntry = await getLogoFromManifestAsync(effectiveDomain);
    if (manifestEntry) {
      const selectedUrl =
        isDarkTheme && manifestEntry.invertedCdnUrl ? manifestEntry.invertedCdnUrl : manifestEntry.cdnUrl;

      return {
        ...normalizedInvestment,
        logoData: {
          url: selectedUrl,
          source: manifestEntry.originalSource,
        },
      };
    }
  } catch (manifestError) {
    const message = manifestError instanceof Error ? manifestError.message : String(manifestError);
    console.warn(`[InvestmentCard] Manifest lookup failed for ${effectiveDomain}:`, message);
  }

  const isProductionBuildPhase = process.env.NEXT_PHASE === "phase-production-build";
  if (isProductionBuildPhase) {
    const runtimeLogoUrl = getRuntimeLogoUrl(effectiveDomain, { company: name, forceRefresh: false });

    return {
      ...normalizedInvestment,
      logoData: {
        url: runtimeLogoUrl ?? getCompanyPlaceholder(),
        source: null,
        needsInversion: false,
      },
    };
  }

  const directLogo = await getLogoCdnData(effectiveDomain);
  if (directLogo) {
    return {
      ...normalizedInvestment,
      logoData: directLogo,
    };
  }

  return {
    ...normalizedInvestment,
    logoData: {
      url: getCompanyPlaceholder(),
      source: null,
    },
  };
}

/**
 * Investment Card Server Component
 * @param {Investment} props - Investment entry properties
 * @returns {Promise<ReactElement>} Pre-rendered investment card with fetched logo
 */
export async function InvestmentCard(
  props: Investment & { logoOnlyDomain?: string | null; isDarkTheme?: boolean },
): Promise<ReactElement> {
  const resolution = await resolveInvestmentCardData(props);
  return <InvestmentCardClient {...resolution} />;
}
