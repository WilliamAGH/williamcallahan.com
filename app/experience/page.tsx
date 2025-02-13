/**
 * Experience Page
 * @module app/experience/page
 * @description
 * Displays professional experience and work history.
 * Implements proper SEO with schema.org structured data.
 */

import { Experience } from "../../components/features";
import { getStaticPageMetadata } from "../../lib/seo/metadata";
import { JsonLdScript } from "../../components/seo/json-ld";
import { PAGE_METADATA, SITE_NAME, metadata as siteMetadata } from "../../data/metadata";
import type { Metadata } from "next";

/**
 * Generate metadata for the experience page
 */
export const metadata: Metadata = getStaticPageMetadata('/experience', 'experience');

/**
 * Experience page component
 */
export default function ExperiencePage() {
  const pageMetadata = PAGE_METADATA.experience;
  // PAGE_METADATA dates are already in Pacific time
  const { dateCreated, dateModified } = pageMetadata;

  return (
    <>
      <JsonLdScript
        data={{
          "@context": "https://schema.org",
          "@type": "ProfilePage",
          "name": `${SITE_NAME} - Professional Experience`,
          "description": pageMetadata.description,
          "datePublished": dateCreated,
          "dateModified": dateModified,
          "mainEntity": {
            "@type": "Person",
            "name": SITE_NAME,
            "description": siteMetadata.shortDescription,
            "sameAs": siteMetadata.social.profiles
          }
        }}
      />
      <Experience />
    </>
  );
}
