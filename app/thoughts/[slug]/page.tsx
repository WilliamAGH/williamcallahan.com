/**
 * Individual Thought Page
 * @module app/thoughts/[slug]/page
 * @description
 * Displays a single thought with full content and metadata.
 * Implements proper SEO with schema.org structured data.
 */

import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ThoughtDetail } from "@/components/features/thoughts/thought-detail";
import { getStaticPageMetadata } from "@/lib/seo";
import { JsonLdScript } from "@/components/seo/json-ld";
import { generateSchemaGraph } from "@/lib/seo/schema";
import { formatSeoDate, ensureAbsoluteUrl } from "@/lib/seo/utils";
import { generateDynamicTitle } from "@/lib/seo/dynamic-metadata";
import { RelatedContent, RelatedContentFallback } from "@/components/features/related-content";
import { getThoughtBySlug } from "@/lib/thoughts/service.server";
import type { ThoughtPageContext } from "@/types/features/thoughts";

/**
 * Generate a clean excerpt from thought content
 * @param content - Raw thought content (may contain markdown/newlines)
 * @param maxLength - Maximum character length (default: 155 for meta descriptions)
 * @param addEllipsis - Whether to append "..." suffix when content is truncated (default: true)
 * @returns Cleaned excerpt string
 */
function generateExcerpt(content: string, maxLength = 155, addEllipsis = true): string {
  const cleaned = content.replace(/\n/g, " ").trim();
  if (cleaned.length <= maxLength) {
    return cleaned;
  }
  const truncated = cleaned.slice(0, maxLength).trim();
  return addEllipsis ? `${truncated}...` : truncated;
}

/**
 * Generate metadata for the thought page
 */
export async function generateMetadata({ params }: ThoughtPageContext): Promise<Metadata> {
  const { slug } = await params;
  const path = `/thoughts/${slug}`;
  const thought = await getThoughtBySlug(slug);

  if (!thought) {
    return {
      ...getStaticPageMetadata(path, "thoughts"),
      title: "Thought Not Found",
      description: "The requested thought could not be found.",
    };
  }

  const baseMetadata = getStaticPageMetadata(path, "thoughts");
  const customTitle = generateDynamicTitle(thought.title, "thoughts");

  // Generate excerpt from content for description
  const excerpt = generateExcerpt(thought.content);

  return {
    ...baseMetadata,
    title: customTitle,
    description: excerpt,
    openGraph: {
      ...baseMetadata.openGraph,
      title: customTitle,
      description: excerpt,
      type: "article",
      url: ensureAbsoluteUrl(path),
    },
    twitter: {
      ...baseMetadata.twitter,
      title: customTitle,
      description: excerpt,
    },
    alternates: {
      canonical: ensureAbsoluteUrl(path),
    },
  };
}

/**
 * Individual thought page component
 */
export default async function ThoughtPage({ params }: ThoughtPageContext) {
  const { slug } = await params;
  const thought = await getThoughtBySlug(slug);

  if (!thought) {
    notFound();
  }

  // Generate JSON-LD schema for this thought
  const thoughtPath = `/thoughts/${slug}`;

  const schemaParams = {
    path: thoughtPath,
    title: thought.title,
    description: generateExcerpt(thought.content, 155, false),
    datePublished: formatSeoDate(thought.createdAt),
    dateModified: formatSeoDate(thought.updatedAt || thought.createdAt),
    type: "article" as const,
    articleBody: thought.content,
    keywords: thought.tags,
    breadcrumbs: [
      { path: "/", name: "Home" },
      { path: "/thoughts", name: "Thoughts" },
      { path: thoughtPath, name: thought.title },
    ],
  };

  const jsonLdData = generateSchemaGraph(schemaParams);

  return (
    <>
      <JsonLdScript data={jsonLdData} />

      {/* Main Thought Content */}
      <div className="max-w-4xl mx-auto">
        <ThoughtDetail thought={thought} />
      </div>

      {/* Related Content Section */}
      <div className="bg-gradient-to-b from-transparent to-zinc-50/50 dark:to-zinc-900/30">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
          <Suspense fallback={<RelatedContentFallback title="Related Thoughts" className="relative" cardCount={3} />}>
            <RelatedContent
              sourceType="thought"
              sourceId={thought.id}
              sectionTitle="Related Content"
              options={{
                maxPerType: 3,
                maxTotal: 9,
                excludeTypes: [],
              }}
              className="relative"
            />
          </Suspense>
        </div>
      </div>
    </>
  );
}
