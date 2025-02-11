/**
 * Home Page
 * @module app/page
 * @description
 * Main landing page for the site.
 * Introduces William Callahan and showcases key areas.
 *
 * @see {@link "https://nextjs.org/docs/app/api-reference/functions/generate-metadata"} - Next.js Metadata API
 * @see {@link "https://schema.org/ProfilePage"} - Schema.org ProfilePage specification
 */

import { Home } from "../components/features";
import { getStaticPageMetadata } from "../lib/seo/metadata";
import { JsonLdScript } from "../components/seo/json-ld";
import { PAGE_METADATA } from "../data/metadata";
import type { Metadata } from "next";

/**
 * Generate metadata for the home page using Next.js 14 Metadata API
 * @see {@link "https://nextjs.org/docs/app/api-reference/functions/generate-metadata"} - Next.js Metadata API
 */
export const metadata: Metadata = getStaticPageMetadata('/', 'home');

/**
 * Home page component
 * Renders the main landing page with JSON-LD structured data
 */
export default function HomePage() {
  const pageMetadata = PAGE_METADATA.home;
  // PAGE_METADATA dates are already in Pacific time
  const { dateCreated, dateModified } = pageMetadata;

  return (
    <>
      <JsonLdScript
        data={{
          "@context": "https://schema.org",
          "@type": "ProfilePage",
          "datePublished": dateCreated,
          "dateModified": dateModified
        }}
      />
      <Home />
    </>
  );
}
