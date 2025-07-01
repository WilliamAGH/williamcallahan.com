import type { Metadata } from "next";
import { Education } from "@/components/features/education/education.server";
import { getStaticPageMetadata } from "@/lib/seo";

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
 * Education page component
 */
export default function EducationPage() {
  return <Education />;
}
