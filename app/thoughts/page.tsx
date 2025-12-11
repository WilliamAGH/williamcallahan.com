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
import type { ThoughtListItem } from "@/types/schemas/thought";

/**
 * Generate static metadata for the Thoughts page
 */
export const metadata: Metadata = getStaticPageMetadata("/thoughts", "thoughts");

/**
 * Mock data for development - replace with actual data source
 * TODO: Implement thoughts data access layer (lib/thoughts/service.server.ts)
 */
function getThoughts(): Promise<ThoughtListItem[]> {
  // Placeholder data for development and visual testing
  // This should be replaced with actual data fetching from your data source
  const mockThoughts: ThoughtListItem[] = [
    {
      id: "550e8400-e29b-41d4-a716-446655440001",
      slug: "subtests-in-pytest",
      title: "Subtests in pytest 9.0.0+",
      excerpt:
        "pytest 9.0.0 introduced native subtest support via the subtests fixture. This is a game-changer for parameterized testing where you want all cases to run even if one fails.",
      createdAt: "2025-12-04T21:44:04-08:00",
      category: "python",
      tags: ["testing", "pytest"],
    },
    {
      id: "550e8400-e29b-41d4-a716-446655440002",
      slug: "css-has-selector",
      title: "CSS :has() is finally here",
      excerpt:
        "The :has() selector lets you style parents based on their children. After years of waiting, we can finally do things like styling a card differently when it contains an image.",
      createdAt: "2025-12-03T14:30:00-08:00",
      category: "css",
      tags: ["css", "selectors", "frontend"],
    },
    {
      id: "550e8400-e29b-41d4-a716-446655440003",
      slug: "bun-test-improvements",
      title: "Bun test runner keeps getting better",
      excerpt:
        "The latest Bun release includes significant improvements to the test runner: better Jest compatibility, snapshot testing, and dramatically faster execution times.",
      createdAt: "2025-12-01T10:15:00-08:00",
      category: "tooling",
      tags: ["bun", "testing", "javascript"],
    },
    {
      id: "550e8400-e29b-41d4-a716-446655440004",
      slug: "typescript-satisfies-operator",
      title: "TypeScript satisfies is underrated",
      excerpt:
        "The satisfies operator lets you validate that an expression matches a type while preserving its narrowed type. Perfect for configuration objects that need both type safety and inference.",
      createdAt: "2025-11-28T16:20:00-08:00",
      category: "typescript",
      tags: ["typescript", "type-safety"],
    },
  ];

  // Return via Promise.resolve for future async data source compatibility
  return Promise.resolve(mockThoughts);
}

/**
 * Thoughts list page component
 */
export default async function ThoughtsPage() {
  const thoughts = await getThoughts();

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
        <ThoughtsListServer thoughts={thoughts} title={displayTitle} description={displayDescription} />
      </ThoughtsWindow>
    </>
  );
}
