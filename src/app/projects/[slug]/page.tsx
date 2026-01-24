/**
 * Project Detail Page
 * @module app/projects/[slug]/page
 * @description
 * Displays individual project details with screenshot, description, tech stack, and tags.
 * Uses slug-based routing for SEO-friendly URLs.
 *
 * Projects are static data from data/projects.ts, so this page uses generateStaticParams
 * for full SSG at build time.
 */

import { Suspense } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { projects } from "@/data/projects";
import { ProjectDetail } from "@/components/features/projects/project-detail";
import { RelatedContent } from "@/components/features/related-content/related-content.server";
import { RelatedContentFallback } from "@/components/features/related-content/related-content-section";
import { findProjectBySlug, getAllProjectSlugs } from "@/lib/projects/slug-helpers";
import { getStaticPageMetadata } from "@/lib/seo";
import { JsonLdScript } from "@/components/seo/json-ld";
import { generateSchemaGraph } from "@/lib/seo/schema";
import { PAGE_METADATA } from "@/data/metadata";
import { formatSeoDate, ensureAbsoluteUrl } from "@/lib/seo/utils";
import { generateDynamicTitle } from "@/lib/seo/dynamic-metadata";
import { getStaticImageUrl } from "@/lib/data-access/static-images";
import type { Project } from "@/types/project";
import type { ProjectPageProps } from "@/types/features/projects";

/**
 * Build dynamic OG image URL for a project
 * Uses the project screenshot image if available
 */
function buildProjectOgImageUrl(project: Project): string {
  // For projects, we use the screenshot image directly
  // The imageKey is already an S3 path like "images/other/projects/..."
  if (project.imageKey) {
    // Convert S3 key to CDN URL
    return ensureAbsoluteUrl(`/cdn/${project.imageKey}`);
  }
  // Fallback to default projects OG image
  return ensureAbsoluteUrl(getStaticImageUrl("/images/og/projects-og.png"));
}

export async function generateMetadata({ params }: ProjectPageProps): Promise<Metadata> {
  const { slug } = await params;
  const path = `/projects/${slug}`;
  const project = findProjectBySlug(slug, projects);

  if (!project) {
    return {
      ...getStaticPageMetadata(path, "projects"),
      title: "Project Not Found",
      description: "The requested project could not be found.",
    };
  }

  const baseMetadata = getStaticPageMetadata(path, "projects");
  const customTitle = generateDynamicTitle(project.name, "projects");
  const customDescription = project.shortSummary || project.description.slice(0, 155);

  // Use project screenshot for OG image - shared between openGraph and twitter
  const ogImageUrl = buildProjectOgImageUrl(project);
  const ogImage = {
    url: ogImageUrl,
    width: 1200,
    height: 630,
    alt: `Screenshot of ${project.name}`,
  };

  return {
    ...baseMetadata,
    title: customTitle,
    description: customDescription,
    openGraph: {
      ...baseMetadata.openGraph,
      title: customTitle,
      description: customDescription,
      type: "website",
      url: ensureAbsoluteUrl(path),
      images: [ogImage],
    },
    twitter: {
      ...baseMetadata.twitter,
      card: "summary_large_image",
      title: customTitle,
      description: customDescription,
      images: [ogImage],
    },
    alternates: {
      canonical: ensureAbsoluteUrl(path),
    },
  };
}

export default async function ProjectPage({ params }: ProjectPageProps) {
  const { slug } = await params;
  const project = findProjectBySlug(slug, projects);

  if (!project) {
    return notFound();
  }

  const path = `/projects/${slug}`;
  const pageMetadata = PAGE_METADATA.projects;
  const projectId = project.id || project.name;

  const schemaParams = {
    path,
    title: project.name,
    description: project.shortSummary || project.description,
    datePublished: formatSeoDate(pageMetadata.dateCreated),
    dateModified: formatSeoDate(pageMetadata.dateModified),
    type: "software" as const,
    image: project.imageKey
      ? {
          url: ensureAbsoluteUrl(`/cdn/${project.imageKey}`),
          width: 1200,
          height: 630,
        }
      : undefined,
    breadcrumbs: [
      { path: "/", name: "Home" },
      { path: "/projects", name: "Projects" },
      { path, name: project.name },
    ],
    // Software-specific metadata for SoftwareApplication schema
    softwareMetadata: {
      name: project.name,
      applicationCategory: "WebApplication",
      operatingSystem: "Cross-platform",
      isFree: true,
    },
  };

  const jsonLdData = generateSchemaGraph(schemaParams);

  return (
    <>
      <JsonLdScript data={jsonLdData} />
      <div className="max-w-6xl mx-auto">
        <Suspense
          fallback={
            <div className="animate-pulse p-8">
              <div className="h-96 bg-gray-200 dark:bg-gray-700 rounded-lg" />
            </div>
          }
        >
          <ProjectDetail project={project} />
        </Suspense>

        <div className="mt-12">
          <Suspense fallback={<RelatedContentFallback title="Related Content" />}>
            <RelatedContent sourceType="project" sourceId={projectId} sectionTitle="Related Content" />
          </Suspense>
        </div>
      </div>
    </>
  );
}

/**
 * Generate static params for all projects at build time.
 * Projects are static data, so we can pre-render all detail pages.
 */
export function generateStaticParams(): Array<{ slug: string }> {
  return getAllProjectSlugs(projects);
}
