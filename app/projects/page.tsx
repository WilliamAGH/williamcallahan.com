/**
 * Projects Page
 *
 * This page displays a list of my personal projects / sandbox
 * It uses the ProjectsClient component to render the projects
 *
 */

import type { Metadata } from "next";

import { ProjectsClient } from "@/components/features/projects/projects.client";
import { getStaticPageMetadata } from "@/lib/seo/metadata";
import { projects } from "@/data/projects";

/**
 * Generates metadata for the projects page
 * 
 * @param searchParams - URL search parameters containing optional tag filter
 * @returns Metadata object for either static projects page or tag-filtered view
 * 
 * @remarks
 * - When no tag is specified or tag is "All", returns static page metadata
 * - When a specific tag is provided, generates dynamic metadata for the filtered view
 */
export function generateMetadata({ searchParams }: { searchParams: { tag?: string } }): Metadata {
  // Sanitize and validate the tag parameter
  const rawTag = searchParams.tag || "All";
  // Limit length and remove any potentially dangerous characters for metadata
  const sanitizedTag = rawTag.length > 50 ? "All" : rawTag.replace(/[<>"']/g, "");
  
  // Get valid tags from projects data
  const validTags = Array.from(new Set(projects.flatMap((p) => p.tags || [])));
  
  // Validate tag exists in projects data, fallback to "All" if invalid
  const selectedTag = validTags.includes(sanitizedTag) ? sanitizedTag : "All";

  // Use static metadata for unfiltered projects page
  if (selectedTag === "All") {
    return getStaticPageMetadata("/projects", "projects");
  }

  // Generate dynamic metadata for tag-filtered view
  return {
    title: `Projects tagged "${selectedTag}" – William Callahan`,
    description: `All of William's projects related to ${selectedTag}.`,
    openGraph: {
      title: `Projects tagged "${selectedTag}" – William Callahan`,
      description: `All of William's projects related to ${selectedTag}.`,
      type: "website",
      url: `${process.env.NEXT_PUBLIC_SITE_URL || "https://williamcallahan.com"}/projects?tag=${encodeURIComponent(selectedTag)}`,
      siteName: "William Callahan",
    },
  };
}

/**
 * Enable ISR for projects page with hourly revalidation
 * This generates static HTML at build time and revalidates periodically
 */
export const revalidate = 3600; // Revalidate every hour

export default function ProjectsPage() {
  return (
    <div className="max-w-5xl mx-auto">
      <ProjectsClient />
    </div>
  );
}
