/**
 * Investments Page
 * @module app/investments/page
 * @description
 * Displays investment portfolio and track record.
 * Implements proper SEO with schema.org structured data.
 *
 * @see {@link "https://nextjs.org/docs/app/api-reference/functions/generate-metadata"} - Next.js Metadata API
 * @see {@link "https://schema.org/Dataset"} - Schema.org Dataset specification
 */

import { Investments } from "../../components/features";
import { getStaticPageMetadata } from "../../lib/seo/metadata";
import { JsonLdScript } from "../../components/seo/json-ld";
import { PAGE_METADATA, SITE_NAME, metadata as siteMetadata } from "../../data/metadata";
import { investments } from "../../data/investments";
import type { Metadata } from "next";

// Enable ISR with 1 hour revalidation to match server component
export const revalidate = 3600;

/**
 * Generate metadata for the investments page
 */
export const metadata: Metadata = getStaticPageMetadata('/investments', 'investments');

/**
 * Investments page component
 */
export default function InvestmentsPage() {
  const pageMetadata = PAGE_METADATA.investments;
  // PAGE_METADATA dates are already in Pacific time
  const { dateCreated, dateModified } = pageMetadata;

  // Group investments by company ID + year + round to detect duplicates
  const investmentGroups = investments.reduce<Record<string, typeof investments>>((groups, inv) => {
    const baseKey = `${inv.id}-${inv.invested_year}-${inv.stage.toLowerCase().replace(/\s+/g, '-')}`;
    if (!groups[baseKey]) {
      groups[baseKey] = [];
    }
    groups[baseKey].push(inv);
    return groups;
  }, {});

  // Create investments with stable unique keys
  const investmentsWithKeys = investments.map(inv => {
    const baseKey = `${inv.id}-${inv.invested_year}-${inv.stage.toLowerCase().replace(/\s+/g, '-')}`;
    const group = investmentGroups[baseKey];
    const suffix = group.length > 1 ? `-${group.indexOf(inv) + 1}` : '';
    return {
      ...inv,
      stableKey: baseKey + suffix
    };
  });

  // Sort investments alphabetically by company name, then by year for same company
  const sortedInvestments = [...investmentsWithKeys].sort((a, b) => {
    const nameDiff = a.name.localeCompare(b.name);
    return nameDiff !== 0 ? nameDiff : b.invested_year.localeCompare(a.invested_year);
  });

  return (
    <>
      <JsonLdScript
        data={{
          "@context": "https://schema.org",
          "@type": "Dataset",
          "name": `${SITE_NAME}'s Investment Portfolio`,
          "description": pageMetadata.description,
          "datePublished": dateCreated,
          "dateModified": dateModified,
          "creator": {
            "@type": "Person",
            "name": SITE_NAME,
            "description": siteMetadata.shortDescription,
            "sameAs": siteMetadata.social.profiles
          },
          "license": "https://creativecommons.org/licenses/by/4.0/",
          "isAccessibleForFree": true,
          "includedInDataCatalog": {
            "@type": "DataCatalog",
            "name": `${SITE_NAME}'s Public Investment Records`
          },
          "distribution": {
            "@type": "DataDownload",
            "contentUrl": "https://williamcallahan.com/investments",
            "encodingFormat": "text/html"
          },
          "keywords": [
            "startups",
            "venture capital",
            "angel investing",
            ...Array.from(new Set(sortedInvestments.map(inv => inv.category)))
          ]
        }}
      />
      <Investments investments={sortedInvestments} />
    </>
  );
}
