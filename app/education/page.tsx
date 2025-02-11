/**
 * Education Page
 * @module app/education/page
 * @description
* Displays educational background and certifications.
* Shows timeline of academic achievements.
*
* @see {@link "https://nextjs.org/docs/app/api-reference/functions/generate-metadata"} - Next.js Metadata API
* @see {@link "https://schema.org/ProfilePage"} - Schema.org ProfilePage specification
*/
import { Education } from '../../components/features/education/education.server';
import { getStaticPageMetadata } from '../../lib/seo/metadata';
import { JsonLdScript } from "../../components/seo/json-ld";
import { PAGE_METADATA, SITE_NAME, metadata as siteMetadata } from "../../data/metadata";
import type { Metadata } from "next";

/**
 * Generate metadata for the education page
 */
export const metadata: Metadata = getStaticPageMetadata('/education', 'education');

/**
 * Education page component
 */
export default function EducationPage() {
  const pageMetadata = PAGE_METADATA.education;
  // PAGE_METADATA dates are already in Pacific time
  const { dateCreated, dateModified } = pageMetadata;

  return (
    <>
      <JsonLdScript
        data={{
          "@context": "https://schema.org",
          "@type": "ProfilePage",
          "name": `${SITE_NAME} - Education`,
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
      <Education />
    </>
  );
}
