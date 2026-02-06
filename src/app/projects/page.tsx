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
import { JsonLdScript } from "@/components/seo/json-ld";
import { generateSchemaGraph } from "@/lib/seo/schema";
import { PAGE_METADATA } from "@/data/metadata";
import { ensureAbsoluteUrl } from "@/lib/seo/url-utils";
import { formatSeoDate } from "@/lib/seo/utils";
import { projects } from "@/data/projects";
import { getStaticImageUrl } from "@/lib/data-access/static-images";
import { getCdnConfigFromEnv, buildCdnUrl } from "@/lib/utils/cdn-utils";
import type { CdnConfig } from "@/types/s3-cdn";

/**
 * Enable ISR for projects page with hourly revalidation
 * This generates static HTML at build time and revalidates periodically
 */

export function generateMetadata(): Metadata {
  return getStaticPageMetadata("/projects", "projects");
}

function getProjectsCdnConfig(): CdnConfig | null {
  try {
    return getCdnConfigFromEnv();
  } catch (error) {
    console.warn("[ProjectsPage] Unable to resolve CDN config. Skipping screenshot URLs.", error);
    return null;
  }
}

function getProjectScreenshotUrl(
  imageKey: string,
  cdnConfig: CdnConfig | null,
): string | undefined {
  if (!cdnConfig) return undefined;
  try {
    return buildCdnUrl(imageKey, cdnConfig);
  } catch (error) {
    console.warn(
      `[ProjectsPage] Unable to build screenshot URL for image key "${imageKey}".`,
      error,
    );
    return undefined;
  }
}

export default function ProjectsPage() {
  // Generate JSON-LD schema for the projects page
  const pageMetadata = PAGE_METADATA.projects;
  const formattedCreated = formatSeoDate(pageMetadata.dateCreated);
  const formattedModified = formatSeoDate(pageMetadata.dateModified);

  const schemaParams = {
    path: "/projects",
    title: pageMetadata.title,
    description: pageMetadata.description,
    datePublished: formattedCreated,
    dateModified: formattedModified,
    type: "collection" as const,
    image: {
      url: getStaticImageUrl("/images/og/projects-og.png"),
      width: 2100,
      height: 1100,
    },
    breadcrumbs: [
      { path: "/", name: "Home" },
      { path: "/projects", name: "Projects" },
    ],
    itemList: projects.map((project, index) => ({
      url: ensureAbsoluteUrl(project.url),
      position: index + 1,
    })),
  };

  const jsonLdData = generateSchemaGraph(schemaParams);
  const cdnConfig = getProjectsCdnConfig();

  projects.forEach((project) => {
    const screenshotUrl = getProjectScreenshotUrl(project.imageKey, cdnConfig);
    jsonLdData["@graph"].push({
      "@type": "SoftwareApplication",
      "@id": `${ensureAbsoluteUrl(project.url)}#software`,
      name: project.name,
      description: project.shortSummary || project.description,
      publisher: { "@id": ensureAbsoluteUrl("/#person") },
      author: { "@id": ensureAbsoluteUrl("/#person") },
      ...(screenshotUrl && {
        screenshot: screenshotUrl,
      }),
    });
  });

  return (
    <>
      <JsonLdScript data={jsonLdData} />
      <ProjectsClient />
    </>
  );
}
