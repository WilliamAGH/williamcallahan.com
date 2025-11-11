import type { Metadata } from "next";
import { Education } from "@/components/features/education/education.server";
import { getStaticPageMetadata } from "@/lib/seo";
import { JsonLdScript } from "@/components/seo/json-ld";
import { generateSchemaGraph } from "@/lib/seo/schema";
import { PAGE_METADATA } from "@/data/metadata";
import { formatSeoDate } from "@/lib/seo/utils";
import { getStaticImageUrl } from "@/lib/data-access/static-images";

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

/**
 * Generate metadata for the education page
 */
export const metadata: Metadata = getStaticPageMetadata("/education", "education");

/**
 * Force dynamic rendering for this page
 * Replaces deprecated unstable_noStore() usage for Next.js 16 compatibility
 */
export const dynamic = "force-dynamic";

/**
 * Education page component with JSON-LD schema
 */
export default function EducationPage() {
  // Generate JSON-LD schema for the education page
  const pageMetadata = PAGE_METADATA.education;
  const formattedCreated = formatSeoDate(pageMetadata.dateCreated);
  const formattedModified = formatSeoDate(pageMetadata.dateModified);

  const schemaParams = {
    path: "/education",
    title: pageMetadata.title,
    description: pageMetadata.description,
    datePublished: formattedCreated,
    dateModified: formattedModified,
    type: "profile" as const,
    image: {
      url: getStaticImageUrl("/images/og/education-og.png"),
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
      <Education />
    </>
  );
}
