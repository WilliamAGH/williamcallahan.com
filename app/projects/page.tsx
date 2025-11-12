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
import { formatSeoDate, ensureAbsoluteUrl } from "@/lib/seo/utils";
import { projects } from "@/data/projects";
import { getStaticImageUrl } from "@/lib/data-access/static-images";
import { getCdnConfigFromEnv, buildCdnUrl } from "@/lib/utils/cdn-utils";

/**
 * Enable ISR for projects page with hourly revalidation
 * This generates static HTML at build time and revalidates periodically
 */

export function generateMetadata(): Metadata {
  return getStaticPageMetadata("/projects", "projects");
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

  projects.forEach(project => {
    jsonLdData["@graph"].push({
      "@type": "SoftwareApplication",
      "@id": `${ensureAbsoluteUrl(project.url)}#software`,
      name: project.name,
      description: project.shortSummary || project.description,
      publisher: { "@id": ensureAbsoluteUrl("/#person") },
      author: { "@id": ensureAbsoluteUrl("/#person") },
      ...(project.imageKey && {
        screenshot: buildCdnUrl(project.imageKey, getCdnConfigFromEnv()),
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
