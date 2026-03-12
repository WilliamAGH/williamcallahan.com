/**
 * Experience Page
 * @module app/experience/page
 * @description
 * Displays professional experience and work history.
 * Implements proper SEO with schema.org structured data.
 */

"use cache";

import type { Metadata } from "next";
import { cacheLife } from "next/cache";
import { Experience } from "@/components/features/experience/experience.client";
import { getStaticPageMetadata } from "@/lib/seo/metadata";
import { JsonLdScript } from "@/components/seo/json-ld";
import { generateSchemaGraph } from "@/lib/seo/schema";
import { PAGE_METADATA } from "@/data/metadata";
import { formatSeoDate } from "@/lib/seo/utils";
import { experiences } from "@/data/experience";
import { getLogoCdnData } from "@/lib/data-access/logos";
import { normalizeDomain } from "@/lib/utils/domain-utils";
import { getCompanyPlaceholder } from "@/lib/data-access/placeholder-images";
import { getLogoFromManifestAsync } from "@/lib/image-handling/image-manifest-loader";
import type { Experience as ExperienceType, ProcessedExperience } from "@/types/schemas/experience";
import type { Logo } from "@/types/logo";
import { getStaticImageUrl } from "@/lib/data-access/static-images";
import { mapWithBoundedConcurrency } from "@/lib/utils/async-lock";

const EXPERIENCE_LOGO_BATCH_SIZE = 6;

/**
 * Generate metadata for the experience page
 */
export const metadata: Metadata = getStaticPageMetadata("/experience", "experience");

/**
 * Cache policy
 * Next.js 16 cacheComponents requires cacheable segments to opt in via `'use cache'`;
 * see https://nextjs.org/docs/app/api-reference/directives/use-cache for the directive contract.
 */

/**
 * Experience page component with JSON-LD schema
 */
export default async function ExperiencePage() {
  cacheLife("days");

  // Generate JSON-LD schema for the experience page
  const pageMetadata = PAGE_METADATA.experience;
  const formattedCreated = formatSeoDate(pageMetadata.dateCreated);
  const formattedModified = formatSeoDate(pageMetadata.dateModified);

  const schemaParams = {
    path: "/experience",
    title: pageMetadata.title,
    description: pageMetadata.description,
    datePublished: formattedCreated,
    dateModified: formattedModified,
    type: "profile" as const,
    image: {
      url: getStaticImageUrl("/images/og/experience-og.png"),
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

  const experienceData = await mapWithBoundedConcurrency(
    experiences,
    EXPERIENCE_LOGO_BATCH_SIZE,
    async (exp: ExperienceType): Promise<ProcessedExperience> => {
      const hasOverrideDomain = Boolean(exp.logoOnlyDomain);
      const domain = hasOverrideDomain
        ? normalizeDomain(exp.logoOnlyDomain as string)
        : exp.website
          ? normalizeDomain(exp.website)
          : normalizeDomain(exp.company);

      try {
        if (!hasOverrideDomain && exp.logo) {
          const staticLogoData: Logo = { url: exp.logo, source: "static" };
          return { ...exp, logoData: staticLogoData };
        }

        if (!domain) {
          const fallbackLogoData: Logo = {
            url: exp.logo ?? getCompanyPlaceholder(),
            source: exp.logo ? "static" : null,
          };
          return { ...exp, logoData: fallbackLogoData };
        }

        const manifestEntry = await getLogoFromManifestAsync(domain);
        if (manifestEntry?.cdnUrl) {
          const manifestLogo: Logo = {
            url: manifestEntry.cdnUrl,
            source: manifestEntry.originalSource,
          };
          return { ...exp, logoData: manifestLogo };
        }

        const directLogo = await getLogoCdnData(domain);
        if (directLogo) {
          return { ...exp, logoData: directLogo };
        }

        const remoteOrStaticUrl = exp.logo ? exp.logo : getCompanyPlaceholder();

        const resolvedLogoData: Logo = {
          url: remoteOrStaticUrl,
          source: exp.logo ? "static" : null,
        };

        return { ...exp, logoData: resolvedLogoData };
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Unknown error";
        console.error("[ExperiencePage] Failed to resolve logo:", err);
        const fallbackLogo = domain ? await getLogoCdnData(domain) : null;
        return {
          ...exp,
          logoData: fallbackLogo ?? { url: getCompanyPlaceholder(), source: null },
          error: `Failed to process logo: ${errorMessage}`,
        };
      }
    },
  );

  return (
    <>
      <JsonLdScript data={jsonLdData} />
      <Experience data={experienceData} />
    </>
  );
}
