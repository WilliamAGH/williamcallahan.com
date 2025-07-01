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

import type { Metadata } from "next";
import { Home } from "@/components/features";
import { getStaticPageMetadata } from "@/lib/seo";
import { JsonLdScript } from "@/components/seo/json-ld";
import { generateSchemaGraph } from "@/lib/seo/schema";
import { PAGE_METADATA } from "@/data/metadata";
import { formatSeoDate } from "@/lib/seo/utils";

/**
 * Generate metadata for the home page using Next.js 14 Metadata API
 * @see {@link "https://nextjs.org/docs/app/api-reference/functions/generate-metadata"} - Next.js Metadata API
 */
export const metadata: Metadata = getStaticPageMetadata("/", "home");

/**
 * Make homepage more static and resilient to rapid requests
 * Remove force-dynamic to allow static generation where possible
 */
export const revalidate = 3600; // Revalidate every hour

/**
 * Home page component
 * Renders the main landing page with JSON-LD schema
 */
export default function HomePage() {
  // Generate JSON-LD schema for the homepage
  const pageMetadata = PAGE_METADATA.home;
  const formattedCreated = formatSeoDate(pageMetadata.dateCreated);
  const formattedModified = formatSeoDate(pageMetadata.dateModified);

  const schemaParams = {
    path: "/",
    title: pageMetadata.title,
    description: pageMetadata.description,
    datePublished: formattedCreated,
    dateModified: formattedModified,
    type: "profile" as const,
    image: {
      url: "/images/og/default-og.png",
      width: 2100,
      height: 1100,
    },
    profileMetadata: {
      bio: pageMetadata.bio,
      alternateName: pageMetadata.alternateName,
      profileImage: pageMetadata.profileImage,
      interactionStats: pageMetadata.interactionStats,
    },
  };

  const jsonLdData = generateSchemaGraph(schemaParams);

  return (
    <>
      <JsonLdScript data={jsonLdData} />
      <Home />
    </>
  );
}
