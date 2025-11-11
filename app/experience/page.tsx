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
import { getRuntimeLogoUrl } from "@/lib/data-access/logos";
import { normalizeDomain } from "@/lib/utils/domain-utils";
import { getCompanyPlaceholder } from "@/lib/data-access/placeholder-images";
import { getLogoFromManifestAsync } from "@/lib/image-handling/image-manifest-loader";
import type { Experience as ExperienceType, LogoData, ProcessedExperienceItem } from "@/types";
import { getStaticImageUrl } from "@/lib/data-access/static-images";

const EXPERIENCE_LOGO_BATCH_SIZE = 6;

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  if (!items.length) return [];

  const results: R[] = [];
  for (let index = 0; index < items.length; index += limit) {
    const slice = items.slice(index, index + limit);
    const mapped = await Promise.all(slice.map(mapper));
    results.push(...mapped);
  }
  return results;
}

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

  const experienceData = await mapWithConcurrency(
    experiences,
    EXPERIENCE_LOGO_BATCH_SIZE,
    async (exp: ExperienceType): Promise<ProcessedExperienceItem> => {
      const hasOverrideDomain = Boolean(exp.logoOnlyDomain);
      const domain = hasOverrideDomain
        ? normalizeDomain(exp.logoOnlyDomain as string)
        : exp.website
          ? normalizeDomain(exp.website)
          : normalizeDomain(exp.company);

      try {
        if (!hasOverrideDomain && exp.logo) {
          const staticLogoData: LogoData = { url: exp.logo, source: "static" };
          return { ...exp, logoData: staticLogoData };
        }

        if (!domain) {
          const fallbackLogoData: LogoData = {
            url: exp.logo ?? getCompanyPlaceholder(),
            source: exp.logo ? "static" : null,
          };
          return { ...exp, logoData: fallbackLogoData };
        }

        const manifestEntry = await getLogoFromManifestAsync(domain);
        if (manifestEntry?.cdnUrl) {
          const manifestLogo: LogoData = {
            url: manifestEntry.cdnUrl,
            source: manifestEntry.originalSource,
          };
          return { ...exp, logoData: manifestLogo };
        }

        const runtimeLogoUrl = getRuntimeLogoUrl(domain, { company: exp.company });

        if (runtimeLogoUrl) {
          const runtimeLogoData: LogoData = {
            url: runtimeLogoUrl,
            source: "api",
          };

          return { ...exp, logoData: runtimeLogoData };
        }

        const remoteOrStaticUrl = exp.logo ? exp.logo : getCompanyPlaceholder();

        const resolvedLogoData: LogoData = {
          url: remoteOrStaticUrl,
          source: exp.logo ? "static" : null,
        };

        return { ...exp, logoData: resolvedLogoData };
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Unknown error";
        console.error("[ExperiencePage] Failed to resolve logo:", err);
        const runtimeLogoUrl = getRuntimeLogoUrl(domain, { company: exp.company });
        return {
          ...exp,
          logoData: {
            url: runtimeLogoUrl ?? getCompanyPlaceholder(),
            source: runtimeLogoUrl ? "api" : null,
          },
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
