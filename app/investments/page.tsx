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

"use cache";

import type { Metadata } from "next";
import { Investments } from "@/components/features";
import { getStaticPageMetadata } from "@/lib/seo";
import { JsonLdScript } from "@/components/seo/json-ld";
import { generateSchemaGraph } from "@/lib/seo/schema";
import { PAGE_METADATA } from "@/data/metadata";
import { formatSeoDate } from "@/lib/seo/utils";
import { investments } from "@/data/investments";
import { getStaticImageUrl } from "@/lib/data-access/static-images";

/**
 * Generate metadata for the investments page
 */
export const metadata: Metadata = getStaticPageMetadata("/investments", "investments");

/**
 * Cache policy
 * File-level `'use cache'` satisfies the Next.js 16 cacheComponents requirement for static segments;
 * see https://nextjs.org/docs/app/api-reference/directives/use-cache for the canonical rules.
 */

/**
 * NOTE ON LOGO RESOLUTION
 * ----------------------------------------------
 * Investment entries now support an optional `logoOnlyDomain` field.
 * This domain is used *exclusively* for logo & data-matching when the
 * public-facing `website` has changed or is no longer active.  UI components
 * never render `logoOnlyDomain`; links come from `website`, and logo lookup
 * logic (in `investment-card.server.tsx`) prioritizes `logoOnlyDomain` →
 * `website` → company name.
 */

/**
 * Investments page component with JSON-LD schema
 * `'use cache'` directives require async exports (see https://nextjs.org/docs/app/api-reference/directives/use-cache),
 * so this component stays async even though it does not await.
 */
export default async function InvestmentsPage() {
  // Generate JSON-LD schema for the investments page
  const pageMetadata = PAGE_METADATA.investments;
  const formattedCreated = formatSeoDate(pageMetadata.dateCreated);
  const formattedModified = formatSeoDate(pageMetadata.dateModified);

  const schemaParams = {
    path: "/investments",
    title: pageMetadata.title,
    description: pageMetadata.description,
    datePublished: formattedCreated,
    dateModified: formattedModified,
    type: "dataset" as const,
    image: {
      url: getStaticImageUrl("/images/og/investments-og.png"),
      width: 2100,
      height: 1100,
    },
  };

  const jsonLdData = await Promise.resolve(generateSchemaGraph(schemaParams));

  return (
    <>
      <JsonLdScript data={jsonLdData} />
      <Investments investments={investments} />
    </>
  );
}
