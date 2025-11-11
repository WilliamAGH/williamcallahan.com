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
import { getLogo, getRuntimeLogoUrl } from "@/lib/data-access/logos";
import { getCompanyPlaceholder } from "@/lib/data-access/placeholder-images";

/**
 * Investment Card Server Component
 * @param {Investment} props - Investment entry properties
 * @returns {Promise<ReactElement>} Pre-rendered investment card with fetched logo
 */
export async function InvestmentCard(
  props: Investment & { logoOnlyDomain?: string | null; isDarkTheme?: boolean },
): Promise<ReactElement> {
  const { logo, name, website, logoOnlyDomain, isDarkTheme } = props as Investment & {
    logoOnlyDomain?: string | null;
    isDarkTheme?: boolean;
  };

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
  const runtimeLogoUrl = effectiveDomain ? getRuntimeLogoUrl(effectiveDomain, { company: name }) : null;

  if (effectiveDomain) {
    try {
      const logoEntry = await getLogoFromManifestAsync(effectiveDomain);

      if (logoEntry) {
        const selectedUrl = isDarkTheme && logoEntry.invertedCdnUrl ? logoEntry.invertedCdnUrl : logoEntry.cdnUrl;

        const logoData: LogoData = {
          url: selectedUrl,
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

    // 🔧 FIX: Instead of fire-and-forget background fetch, actually use the result
    try {
      const liveLogo = await getLogo(effectiveDomain);

      if (liveLogo?.cdnUrl || liveLogo?.url) {
        console.info(
          `[InvestmentCard] Live logo fetch succeeded for ${effectiveDomain} via ${liveLogo.source ?? "api"}`,
        );

        const logoData: LogoData = {
          url: liveLogo.cdnUrl || liveLogo.url || getCompanyPlaceholder(),
          source: liveLogo.source || "api",
        };

        return <InvestmentCardClient {...props} logoData={logoData} />;
      }

      if (runtimeLogoUrl) {
        console.info(`[InvestmentCard] Falling back to runtime logo fetch for ${effectiveDomain}`);

        return (
          <InvestmentCardClient
            {...props}
            logoData={{
              url: runtimeLogoUrl,
              source: "api",
            }}
          />
        );
      }
    } catch (fetchErr) {
      const msg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
      console.error(`[InvestmentCard] Live logo fetch failed for ${effectiveDomain}:`, msg);
    }
  }

  // Single fallback to placeholder if no logo could be fetched
  if (runtimeLogoUrl) {
    return (
      <InvestmentCardClient
        {...props}
        logoData={{
          url: runtimeLogoUrl,
          source: "api",
        }}
      />
    );
  }

  return (
    <InvestmentCardClient
      {...props}
      logoData={{
        url: getCompanyPlaceholder(),
        source: null,
      }}
    />
  );
}
