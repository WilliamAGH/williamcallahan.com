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

import type { Metadata } from "next";
import { unstable_noStore as noStore } from "next/cache";
import { headers } from "next/headers";
import { connection } from "next/server";
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

// Avoid long static generation by rendering this page dynamically at request time

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
 */
export default async function InvestmentsPage() {
  if (typeof noStore === "function") {
    noStore();
  }

  await headers();

  if (typeof connection === "function") {
    await connection();
  }

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

  const jsonLdData = generateSchemaGraph(schemaParams);

  return (
    <>
      <JsonLdScript data={jsonLdData} />
      <Investments investments={investments} />
    </>
  );
}
