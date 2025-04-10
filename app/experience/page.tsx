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
import { formatSeoDate } from "../../lib/seo/utils";
import type { Metadata } from "next";
import { experiences } from "../../data/experience";
import { ExperienceCard } from "../../components/ui/experience-card";
import type { Experience as ExperienceType } from "../../types";

/**
 * Generate metadata for the experience page
 */
export const metadata: Metadata = getStaticPageMetadata('/experience', 'experience');

/**
 * Experience page component
 */
export default async function ExperiencePage() {
  const pageMetadata = PAGE_METADATA.experience;
  const formattedCreated = formatSeoDate(pageMetadata.dateCreated);
  const formattedModified = formatSeoDate(pageMetadata.dateModified);

  const experienceCardsData = await Promise.all(
    experiences.map(async (exp: ExperienceType) => ({
      id: exp.id,
      card: await ExperienceCard(exp)
    }))
  );

  return (
    <>
      <JsonLdScript
        data={{
          "@context": "https://schema.org",
          "@type": "ProfilePage",
          "name": `${SITE_NAME} - Professional Experience`,
          "description": pageMetadata.description,
          "datePublished": formattedCreated,
          "dateModified": formattedModified,
          "mainEntity": {
            "@type": "Person",
            "name": SITE_NAME,
            "description": pageMetadata.bio,
            "sameAs": siteMetadata.social.profiles,
            "image": siteMetadata.defaultImage.url,
            "interactionStatistic": [
              {
                "@type": "InteractionCounter",
                "interactionType": "https://schema.org/FollowAction",
                "userInteractionCount": 200
              },
              {
                "@type": "InteractionCounter",
                "interactionType": "https://schema.org/LikeAction",
                "userInteractionCount": 350
              }
            ],
            "agentInteractionStatistic": {
              "@type": "InteractionCounter",
              "interactionType": "https://schema.org/WriteAction",
              "userInteractionCount": 45
            }
          }
        }}
      />
      <Experience experienceCards={experienceCardsData} />
    </>
  );
}
