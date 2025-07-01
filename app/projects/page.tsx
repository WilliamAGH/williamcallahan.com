/**
 * Projects Page
 *
 * This page displays a list of my personal projects / sandbox
 * It uses the ProjectsClient component to render the projects
 *
 */

import type { Metadata } from "next";
import { ProjectsClient } from "@/components/features/projects/projects.client";
import { getStaticPageMetadata } from "@/lib/seo";

/**
 * Enable ISR for projects page with hourly revalidation
 * This generates static HTML at build time and revalidates periodically
 */
export const revalidate = 3600; // Revalidate every hour

export function generateMetadata(): Metadata {
  return getStaticPageMetadata("/projects", "projects");
}

export default function ProjectsPage() {
  return <ProjectsClient />;
}
