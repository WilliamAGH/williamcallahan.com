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
import type { LogoData } from "../../../types/logo";
import type { ReactElement } from "react";
import { getLogo } from "@/lib/data-access/logos";

/**
 * Investment Card Server Component
 * @param {Investment} props - Investment entry properties
 * @returns {Promise<ReactElement>} Pre-rendered investment card with fetched logo
 */
export async function InvestmentCard(props: Investment): Promise<ReactElement> {
  const { logo, name, website, logoOnlyDomain } = props as Investment & { logoOnlyDomain?: string | null };

  /**
   * Determine domain for logo lookup
   * Priority: `logoOnlyDomain` (logo-specific), then `website` host, otherwise fallback to company name.
   */
  const effectiveDomain = logoOnlyDomain
    ? normalizeDomain(logoOnlyDomain)
    : website
      ? normalizeDomain(website)
      : normalizeDomain(name);

  // If logo is provided directly (static file path), use it
  if (logo) {
    // Logo paths are already relative URLs like "/images/accern_logo.png"
    return <InvestmentCardClient {...props} logoData={{ url: logo, source: "static" }} />;
  }

  // Attempt manifest lookup using effectiveDomain
  if (effectiveDomain) {
    try {
      const logoEntry = await getLogoFromManifestAsync(effectiveDomain);

      if (logoEntry) {
        const logoData: LogoData = {
          url: logoEntry.cdnUrl,
          source: logoEntry.originalSource,
        };

        return <InvestmentCardClient {...props} logoData={logoData} />;
      } else {
        console.info(`[InvestmentCard] Manifest miss for domain ${effectiveDomain}, falling back to live fetch`);
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.warn(`Manifest lookup error for ${name} (${effectiveDomain}):`, errorMessage);
    }

    // Fallback: live logo fetch via UnifiedImageService
    try {
      const liveLogo = await getLogo(effectiveDomain);
      const resolvedUrl = liveLogo?.cdnUrl ?? liveLogo?.url;
      if (liveLogo && resolvedUrl) {
        const logoData: LogoData = {
          url: resolvedUrl,
          source: liveLogo.source,
        };
        console.info(`[InvestmentCard] Live logo fetched for ${effectiveDomain} via ${liveLogo.source ?? "api"}`);
        return <InvestmentCardClient {...props} logoData={logoData} />;
      }
      console.warn(`[InvestmentCard] Live logo fetch returned empty for ${effectiveDomain}`);
    } catch (fetchErr) {
      const msg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
      console.error(`[InvestmentCard] Live logo fetch failed for ${effectiveDomain}:`, msg);
    }
  }

  // Single fallback to placeholder if no logo could be fetched
  return (
    <InvestmentCardClient
      {...props}
      logoData={{
        url: "/images/company-placeholder.svg",
        source: null,
      }}
    />
  );
}
