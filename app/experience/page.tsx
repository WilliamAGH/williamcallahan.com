/**
 * Experience Page
 * @module app/experience/page
 * @description
 * Displays professional experience and work history.
 * Implements proper SEO with schema.org structured data.
 */

import type { Metadata } from "next";
import { Experience } from "../../components/features";
import { JsonLdScript } from "../../components/seo/json-ld";
import { getLogo } from "@/lib/data-access/logos";
import { normalizeDomain } from "@/lib/utils/domain-utils";
import { getCompanyPlaceholder } from "@/lib/data-access/placeholder-images";
import { experiences } from "../../data/experience";
import { PAGE_METADATA, SITE_NAME, metadata as siteMetadata } from "../../data/metadata";
import { getStaticPageMetadata } from "../../lib/seo/metadata";
import { formatSeoDate } from "../../lib/seo/utils";
import type { ProfilePageMetadata } from "../../types/seo/metadata";
import type { Experience as ExperienceType } from "../../types";
import type { LogoData } from "../../types/logo";

/**
 * Generate metadata for the experience page
 */
export const metadata: Metadata = getStaticPageMetadata("/experience", "experience");

/**
 * Experience page component
 */
export default async function ExperiencePage() {
  const pageMetadata: ProfilePageMetadata = PAGE_METADATA.experience;
  const formattedCreated = formatSeoDate(pageMetadata.dateCreated);
  const formattedModified = formatSeoDate(pageMetadata.dateModified);

  const experienceData = await Promise.all(
    experiences.map(async (exp: ExperienceType) => {
      try {
        /**
         * Resolution strategy:
         * 1. If `logoOnlyDomain` is provided → ALWAYS attempt remote lookup using that domain.
         *    This guarantees we don't fall back to outdated/invalid static paths that may have
         *    been carried over inadvertently.
         * 2. If no `logoOnlyDomain` but a static `logo` path exists → use the static asset.
         * 3. Otherwise derive a domain from `website` → remote lookup → final fallback placeholder.
         */

        const hasOverrideDomain = Boolean(exp.logoOnlyDomain);

        if (!hasOverrideDomain && exp.logo) {
          const staticLogoData: LogoData = { url: exp.logo, source: "static" };
          return { ...exp, logoData: staticLogoData };
        }

        const domain = hasOverrideDomain
          ? normalizeDomain(exp.logoOnlyDomain as string)
          : exp.website
            ? normalizeDomain(exp.website)
            : normalizeDomain(exp.company);

        const logoResult = await getLogo(domain);

        const remoteLogoData: LogoData = {
          url: logoResult?.cdnUrl ?? logoResult?.url ?? getCompanyPlaceholder(),
          source: logoResult?.source ?? null,
        };

        return { ...exp, logoData: remoteLogoData };
      } catch (error) {
        console.error("[ExperiencePage] Failed to resolve logo:", error);
        return {
          ...exp,
          logoData: {
            url: getCompanyPlaceholder(),
            source: null,
          },
        };
      }
    }),
  );

  return (
    <>
      <JsonLdScript
        data={{
          "@context": "https://schema.org",
          "@type": "ProfilePage",
          name: `${SITE_NAME} - Professional Experience`,
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
                userInteractionCount: 200,
              },
              {
                "@type": "InteractionCounter",
                interactionType: "https://schema.org/LikeAction",
                userInteractionCount: 350,
              },
            ],
            agentInteractionStatistic: {
              "@type": "InteractionCounter",
              interactionType: "https://schema.org/WriteAction",
              userInteractionCount: 45,
            },
          },
        }}
      />
      <Experience data={experienceData} />
    </>
  );
}
