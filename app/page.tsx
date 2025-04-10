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
import { PAGE_METADATA, SITE_NAME, metadata as siteMetadata } from "../data/metadata";
import { formatSeoDate } from "../lib/seo/utils";
import type { Metadata } from "next";
import { unstable_noStore as noStore } from "next/cache";

/**
 * Generate metadata for the home page using Next.js 14 Metadata API
 * @see {@link "https://nextjs.org/docs/app/api-reference/functions/generate-metadata"} - Next.js Metadata API
 */
export const metadata: Metadata = getStaticPageMetadata('/', 'home');

/**
 * Enable Partial Prerendering (PPR) for home page
 * This will prerender static parts while dynamically rendering others
 */
export const dynamic = 'force-dynamic';
export const revalidate = 3600; // Revalidate every hour
export const prefetch = true; // Enable prefetching

/**
 * Home page component
 * Renders the main landing page with JSON-LD structured data
 */
export default function HomePage() {
  // Mark this component for dynamic rendering in a static page (PPR)
  noStore();

  const pageMetadata = PAGE_METADATA.home;
  const formattedCreated = formatSeoDate(pageMetadata.dateCreated);
  const formattedModified = formatSeoDate(pageMetadata.dateModified);

  return (
    <>
      <JsonLdScript
        data={{
          "@context": "https://schema.org",
          "@type": "ProfilePage",
          "dateCreated": formattedCreated,
          "dateModified": formattedModified,
          "mainEntity": {
            "@type": "Person",
            "name": SITE_NAME,
            "description": pageMetadata.bio,
            "image": "/images/profile.jpg",
            "sameAs": siteMetadata.social.profiles,
            "interactionStatistic": [
              {
                "@type": "InteractionCounter",
                "interactionType": "https://schema.org/FollowAction",
                "userInteractionCount": 500
              },
              {
                "@type": "InteractionCounter",
                "interactionType": "https://schema.org/LikeAction",
                "userInteractionCount": 1200
              }
            ],
            "agentInteractionStatistic": {
              "@type": "InteractionCounter",
              "interactionType": "https://schema.org/WriteAction",
              "userInteractionCount": 85
            }
          }
        }}
      />
      <Home />
    </>
  );
}
