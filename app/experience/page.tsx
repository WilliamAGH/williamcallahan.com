/**
 * Experience Page
 * @module app/experience/page
 * @description
 * Displays professional experience and work history.
 * Implements proper SEO with schema.org structured data.
 */

import type { Metadata } from "next";
import { Experience } from "@/components/features";
import { getStaticPageMetadata } from "@/lib/seo";
import { JsonLdScript } from "@/components/seo/json-ld";
import { generateSchemaGraph } from "@/lib/seo/schema";
import { PAGE_METADATA } from "@/data/metadata";
import { formatSeoDate } from "@/lib/seo/utils";
import { experiences } from "@/data/experience";
import { getLogo } from "@/lib/data-access/logos";
import { normalizeDomain } from "@/lib/utils/domain-utils";
import { getCompanyPlaceholder } from "@/lib/data-access/placeholder-images";
import { getLogoFromManifestAsync } from "@/lib/image-handling/image-manifest-loader";
import type { Experience as ExperienceType, LogoData } from "@/types";

export const dynamic = "force-static";

/**
 * Generate metadata for the experience page
 */
export const metadata: Metadata = getStaticPageMetadata("/experience", "experience");

/**
 * Experience page component with JSON-LD schema
 */
export default async function ExperiencePage() {
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
      url: "/images/og/experience-og.png",
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

  const experienceData = await Promise.all(
    experiences.map(async (exp: ExperienceType) => {
      try {
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

        const manifestEntry = await getLogoFromManifestAsync(domain);
        if (manifestEntry?.cdnUrl) {
          const manifestLogo: LogoData = {
            url: manifestEntry.cdnUrl,
            source: manifestEntry.originalSource,
          };
          return { ...exp, logoData: manifestLogo };
        }

        const logoResult = await getLogo(domain);

        const remoteOrStaticUrl =
          logoResult?.cdnUrl ?? logoResult?.url ?? (exp.logo ? exp.logo : getCompanyPlaceholder());

        const resolvedLogoData: LogoData = {
          url: remoteOrStaticUrl,
          source: logoResult?.source ?? (exp.logo ? "static" : null),
        };

        return { ...exp, logoData: resolvedLogoData };
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
      <JsonLdScript data={jsonLdData} />
      <Experience data={experienceData} />
    </>
  );
}
