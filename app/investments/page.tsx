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

  // Get active investments for dataset
  const activeInvestments = investments;

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
            ...Array.from(new Set(activeInvestments.map(inv => inv.category)))
          ]
        }}
      />
      <Investments investments={investments} />
    </>
  );
}
