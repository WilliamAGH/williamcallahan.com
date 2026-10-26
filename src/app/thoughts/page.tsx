/**
 * Thoughts List Page
 * @module app/thoughts/page
 * @description
 * Displays the list of all thoughts (short-form TIL-style content).
 * Implements proper SEO with schema.org structured data.
 */

import type { Metadata } from "next";
import { cacheLife } from "next/cache";
import { ThoughtsWindow } from "@/components/features/thoughts/thoughts-window.client";
import { ThoughtsListServer } from "@/components/features/thoughts/thoughts-list.server";
import { getStaticPageMetadata } from "@/lib/seo/metadata";
import { SEARCH_EXCLUDED_ROBOTS } from "@/lib/seo/search-exclusion";
import { JsonLdScript } from "@/components/seo/json-ld";
import { generateSchemaGraph } from "@/lib/seo/schema";
import { PAGE_METADATA } from "@/data/metadata";
import { formatSeoDate } from "@/lib/seo/utils";
import { getStaticImageUrl } from "@/lib/data-access/static-images";
import { getThoughtListItems } from "@/lib/thoughts/service.server";

// Metadata and visible content share one cache entry, never independent empty/nonempty epochs.
async function getThoughtsSnapshot() {
  "use cache";
  cacheLife("hours");
  return getThoughtListItems();
}

/**
 * Generate metadata for the Thoughts page; an empty list stays out of search indexes.
 */
export async function generateMetadata(): Promise<Metadata> {
  const base = getStaticPageMetadata("/thoughts", "thoughts");
  const thoughts = await getThoughtsSnapshot();
  return thoughts.length > 0 ? base : { ...base, robots: SEARCH_EXCLUDED_ROBOTS };
}

/**
 * Thoughts list page component
 */
export default async function ThoughtsPage() {
  const thoughts = await getThoughtsSnapshot();

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
    itemList: thoughts.map((thought, index) => ({
      url: `/thoughts/${thought.slug}`,
      position: index + 1,
    })),
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
