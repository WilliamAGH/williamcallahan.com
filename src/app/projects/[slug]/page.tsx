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
import { getCachedAnalysis } from "@/lib/ai-analysis/reader.server";
import type { ProjectAiAnalysisResponse } from "@/types/schemas/project-ai-analysis";
import { getStaticPageMetadata } from "@/lib/seo";
import { JsonLdScript } from "@/components/seo/json-ld";
import { generateSchemaGraph } from "@/lib/seo/schema";
import { PAGE_METADATA } from "@/data/metadata";
import { ensureAbsoluteUrl } from "@/lib/seo/url-utils";
import { formatSeoDate } from "@/lib/seo/utils";
import { buildCdnUrl, getCdnConfigFromEnv } from "@/lib/utils/cdn-utils";
import { generateDynamicTitle } from "@/lib/seo/dynamic-metadata";
import { buildOgImageUrl } from "@/lib/og-image/build-og-url";
import type { Project } from "@/types/project";
import type { ProjectPageProps } from "@/types/features/projects";

/**
 * Tag patterns mapped to schema.org applicationCategory values.
 * Order matters - first match wins (more specific patterns first).
 */
const TAG_CATEGORY_MAPPINGS: Array<{ patterns: string[]; category: string }> = [
  { patterns: ["terminal", "tui", "cli"], category: "DeveloperApplication" },
  { patterns: ["vs code", "extension", "ide"], category: "DeveloperApplication" },
  { patterns: ["sdk", "library", "framework"], category: "DeveloperApplication" },
  { patterns: ["web app", "web application", "webapp", "saas"], category: "WebApplication" },
  { patterns: ["mobile"], category: "MobileApplication" },
];

/**
 * Derive schema.org applicationCategory from project tags.
 * Maps semantic tags to appropriate schema.org SoftwareApplication categories.
 *
 * @see {@link "https://schema.org/SoftwareApplication"} - SoftwareApplication specification
 */
function deriveApplicationCategory(tags: string[]): string {
  const lowerTags = tags.map((t) => t.toLowerCase());

  for (const { patterns, category } of TAG_CATEGORY_MAPPINGS) {
    if (lowerTags.some((tag) => patterns.some((pattern) => tag.includes(pattern)))) {
      return category;
    }
  }

  return "Application";
}

/**
 * Build dynamic OG image URL for a project via the unified /api/og/[entity] endpoint.
 * Passes the CDN screenshot URL as screenshotUrl for branded image generation.
 */
function buildProjectOgImageUrl(project: Project): string {
  let screenshotUrl: string | undefined;
  if (project.imageKey) {
    try {
      screenshotUrl = buildCdnUrl(project.imageKey, getCdnConfigFromEnv());
    } catch (error) {
      console.warn(
        `[ProjectMetadata] Failed to build CDN URL for project ${project.name}, using fallback`,
        error,
      );
    }
  }

  return buildOgImageUrl("projects", {
    title: project.name,
    screenshotUrl,
    tags: project.tags?.slice(0, 4).join(","),
  });
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

  const projectId = project.id ?? project.name;
  const path = `/projects/${slug}`;

  // Fetch cached AI analysis from S3 (runs in parallel with rendering prep)
  const cachedAnalysis = await getCachedAnalysis<ProjectAiAnalysisResponse>("projects", projectId);
  const pageMetadata = PAGE_METADATA.projects;

  const schemaParams = {
    path,
    title: project.name,
    description: project.shortSummary || project.description,
    datePublished: formatSeoDate(pageMetadata.dateCreated),
    dateModified: formatSeoDate(pageMetadata.dateModified),
    type: "software" as const,
    image: project.imageKey
      ? {
          url: buildProjectOgImageUrl(project),
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
      applicationCategory: deriveApplicationCategory(project.tags ?? []),
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
          <ProjectDetail project={project} cachedAnalysis={cachedAnalysis} />
        </Suspense>

        <div className="mt-12">
          <Suspense fallback={<RelatedContentFallback title="Related Content" />}>
            <RelatedContent
              sourceType="project"
              sourceId={projectId}
              sectionTitle="Related Content"
            />
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
