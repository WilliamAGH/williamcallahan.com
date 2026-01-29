/**
 * Thoughts List Page
 * @module app/thoughts/page
 * @description
 * Displays the list of all thoughts (short-form TIL-style content).
 * Implements proper SEO with schema.org structured data.
 */

import type { Metadata } from "next";
import { ThoughtsWindow } from "@/components/features/thoughts/thoughts-window.client";
import { ThoughtsListServer } from "@/components/features/thoughts/thoughts-list.server";
import { getStaticPageMetadata } from "@/lib/seo";
import { JsonLdScript } from "@/components/seo/json-ld";
import { generateSchemaGraph } from "@/lib/seo/schema";
import { PAGE_METADATA } from "@/data/metadata";
import { formatSeoDate } from "@/lib/seo/utils";
import { getStaticImageUrl } from "@/lib/data-access/static-images";
import { getThoughtListItems } from "@/lib/thoughts/service.server";

/**
 * Generate static metadata for the Thoughts page
 */
export const metadata: Metadata = getStaticPageMetadata("/thoughts", "thoughts");

/**
 * Thoughts list page component
 */
export default async function ThoughtsPage() {
  const thoughts = await getThoughtListItems();

  // Generate JSON-LD schema for the thoughts page
  const pageMetadata = PAGE_METADATA.thoughts;
  const formattedCreated = formatSeoDate(pageMetadata.dateCreated);
  const formattedModified = formatSeoDate(pageMetadata.dateModified);

  const schemaParams = {
    path: "/thoughts",
    title: pageMetadata.title,
    description: pageMetadata.description,
    datePublished: formattedCreated,
    dateModified: formattedModified,
    type: "collection" as const,
    breadcrumbs: [
      { path: "/", name: "Home" },
      { path: "/thoughts", name: "Thoughts" },
    ],
    image: {
      url: getStaticImageUrl("/images/og/default-og.png"),
      width: 2100,
      height: 1100,
    },
  };

  const jsonLdData = generateSchemaGraph(schemaParams);

  // Use uiTitle/uiDescription for on-page display, falling back to meta values
  const displayTitle = pageMetadata.uiTitle ?? "Thoughts";
  const displayDescription = pageMetadata.uiDescription ?? pageMetadata.description;

  return (
    <>
      <JsonLdScript data={jsonLdData} />
      <ThoughtsWindow windowTitle="~/thoughts">
        <ThoughtsListServer
          thoughts={thoughts}
          title={displayTitle}
          description={displayDescription}
        />
      </ThoughtsWindow>
    </>
  );
}
