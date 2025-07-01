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
import { Investments } from "@/components/features";
import { getStaticPageMetadata } from "@/lib/seo";
import { investments } from "@/data/investments";

/**
 * Generate metadata for the investments page
 */
export const metadata: Metadata = getStaticPageMetadata("/investments", "investments");

// Avoid long static generation by rendering this page dynamically at request time
export const dynamic = "force-dynamic";

/**
 * NOTE ON LOGO RESOLUTION
 * ----------------------------------------------
 * Investment entries now support an optional `logoOnlyDomain` field.
 * This domain is used *exclusively* for logo & data-matching when the
 * public-facing `website` has changed or is no longer active.  UI components
 * never render `logoOnlyDomain`; links come from `website`, and logo lookup
 * logic (in `investment-card.server.tsx`) prioritises `logoOnlyDomain` →
 * `website` → company name.
 */

/**
 * Investments page component
 */
export default function InvestmentsPage() {
  return <Investments investments={investments} />;
}
