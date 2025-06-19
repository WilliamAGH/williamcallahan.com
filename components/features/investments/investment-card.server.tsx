/**
 * Investment Card Server Component
 * @module components/features/investments/investment-card.server
 * @description
 * Server component that handles logo fetching and processing for investment entries.
 * Uses dynamic logo fetching with S3 caching and external API fallbacks.
 */

import type { Investment } from "../../../types/investment";
import { InvestmentCardClient } from "./investment-card.client";
import { getLogo } from "../../../lib/data-access/logos";
import type { LogoData } from "../../../types/logo";

/**
 * Investment Card Server Component
 * @param {Investment} props - Investment entry properties
 * @returns {Promise<JSX.Element>} Pre-rendered investment card with fetched logo
 */
export async function InvestmentCard(props: Investment): Promise<JSX.Element> {
  const { logo, name, website } = props;

  // If logo is provided directly (static file path), use it
  if (logo) {
    // Logo paths are already relative URLs like "/images/accern_logo.png"
    return <InvestmentCardClient {...props} logoData={{ url: logo, source: "static" }} />;
  }

  // For investments without a logo property, try to fetch dynamically
  if (website) {
    try {
      // Extract domain from website URL
      const url = new URL(website);
      const domain = url.hostname.replace(/^www\./, "");

      // Fetch logo using the unified logo system
      const logoResult = await getLogo(domain);

      if (logoResult?.buffer && Buffer.isBuffer(logoResult.buffer) && logoResult.buffer.length > 0) {
        // Convert buffer to base64 data URL
        const base64 = logoResult.buffer.toString("base64");
        const dataUrl = `data:${logoResult.contentType || "image/png"};base64,${base64}`;

        const logoData: LogoData = {
          url: dataUrl,
          source: logoResult.source || "unknown",
        };

        return <InvestmentCardClient {...props} logoData={logoData} />;
      }
    } catch (error) {
      console.warn(`Failed to fetch logo for ${name} (${website}):`, error);
      // Fall through to placeholder return below
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
