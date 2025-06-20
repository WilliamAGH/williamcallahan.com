import type { Metadata } from "next";
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
import { Education } from "../../components/features/education/education.server";
import { JsonLdScript } from "../../components/seo/json-ld";
import { PAGE_METADATA, SITE_NAME, metadata as siteMetadata } from "../../data/metadata";
import { getStaticPageMetadata } from "../../lib/seo/metadata";
import { formatSeoDate } from "../../lib/seo/utils";
import type { ProfilePageMetadata } from "../../types/seo/metadata";

/**
 * Generate metadata for the education page
 */
export const metadata: Metadata = getStaticPageMetadata("/education", "education");

/**
 * Education page component
 */
export default function EducationPage() {
  const pageMetadata: ProfilePageMetadata = PAGE_METADATA.education;
  const formattedCreated = formatSeoDate(pageMetadata.dateCreated);
  const formattedModified = formatSeoDate(pageMetadata.dateModified);

  return (
    <>
      <JsonLdScript
        data={{
          "@context": "https://schema.org",
          "@type": "ProfilePage",
          name: `${SITE_NAME} - Education`,
          description: pageMetadata.description,
          datePublished: formattedCreated,
          dateModified: formattedModified,
          mainEntity: {
            "@type": "Person",
            name: SITE_NAME,
            description: pageMetadata.bio,
            sameAs: siteMetadata.social.profiles,
            image: siteMetadata.defaultImage.url,
            interactionStatistic: [
              {
                "@type": "InteractionCounter",
                interactionType: "https://schema.org/FollowAction",
                userInteractionCount: 150,
              },
            ],
            agentInteractionStatistic: {
              "@type": "InteractionCounter",
              interactionType: "https://schema.org/WriteAction",
              userInteractionCount: 15,
            },
          },
        }}
      />
      <Education />
    </>
  );
}
