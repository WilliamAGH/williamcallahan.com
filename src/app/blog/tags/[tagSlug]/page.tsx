import { Suspense, type JSX } from "react";
import { BlogList } from "@/components/features/blog/blog-list";
import { Blog } from "@/components/features/blog/blog.client";
import { JsonLdScript } from "@/components/seo/json-ld";
import { generateSchemaGraph } from "@/lib/seo/schema";
import { metadata, PAGE_METADATA } from "@/data/metadata";
import { ensureAbsoluteUrl } from "@/lib/seo/url-utils";
import {
  generateDynamicTitle,
  generateTagDescription,
  formatTagDisplay,
} from "@/lib/seo/dynamic-metadata";
import { deslugify, kebabCase } from "@/lib/utils/formatters";
import { getAllPosts } from "@/lib/blog";
import type { Metadata } from "next";
import { RelatedContent, RelatedContentFallback } from "@/components/features/related-content";

/**
 * Generates metadata for the tag page.
 * @param {object} params - The route parameters.
 * @param {Promise<{ tagSlug: string }>} params.tagSlug - The slug of the tag.
 * @returns {Promise<Metadata>} The metadata object for the page.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ tagSlug: string }>;
}): Promise<Metadata> {
  // Await params in Next.js 16
  const { tagSlug } = await params;
  const tagName = formatTagDisplay(deslugify(tagSlug));
  const title = generateDynamicTitle(`${tagName} Posts`, "blog", { isTag: true });
  const description = generateTagDescription(tagName, "blog");
  const url = ensureAbsoluteUrl(`/blog/tags/${tagSlug}`);

  return {
    title: title,
    description: description,
    alternates: {
      canonical: url,
    },
    openGraph: {
      title: title,
      description: description,
      url: url,
      siteName: metadata.site.name,
      type: "website",
      locale: "en_US",
      images: metadata.openGraph.images, // Use openGraph images
    },
    twitter: {
      card: "summary_large_image",
      title: title,
      description: description,
      images: metadata.openGraph.images, // Use openGraph images for Twitter too
      creator: metadata.social.twitter, // Use correct path for Twitter handle
    },
  };
}

/**
 * Renders the page displaying blog posts filtered by a specific tag.
 * @param {object} params - The route parameters.
 * @param {Promise<{ tagSlug: string }>} params.tagSlug - The URL-friendly tag slug.
 * @remarks Schema timestamps are derived from the filtered posts to keep the
 *          page statically renderable without relying on runtime clocks.
 * @returns {JSX.Element} The rendered page component.
 */
export default async function TagPage({
  params,
}: {
  params: Promise<{ tagSlug: string }>;
}): Promise<JSX.Element> {
  const { tagSlug } = await params;
  const allPosts = await getAllPosts();

  const filteredPosts = allPosts.filter((post) =>
    post.tags.some((tag) => kebabCase(tag) === tagSlug),
  );
  const firstPost = filteredPosts[0];
  const canonicalTag = firstPost?.tags.find((tag) => kebabCase(tag) === tagSlug);

  const tagName = formatTagDisplay(deslugify(tagSlug));
  const title = generateDynamicTitle(`${tagName} Posts`, "blog", { isTag: true });
  const description = generateTagDescription(tagName, "blog");

  const itemList = filteredPosts.map((post, idx) => ({
    url: ensureAbsoluteUrl(`/blog/${post.slug}`),
    position: idx + 1,
  }));

  // Derive deterministic timestamps from the underlying content so the
  // collection can stay static under Next.js' prerender timing rules.
  const fallbackCollectionMetadata = PAGE_METADATA.blog;
  const newestPost = filteredPosts[0];
  const oldestPost = filteredPosts[filteredPosts.length - 1];
  const datePublished = oldestPost?.publishedAt ?? fallbackCollectionMetadata.dateCreated;
  const dateModified =
    newestPost?.updatedAt ?? newestPost?.publishedAt ?? fallbackCollectionMetadata.dateModified;

  const jsonLdData = generateSchemaGraph({
    path: `/blog/tags/${tagSlug}`,
    title,
    description,
    datePublished,
    dateModified,
    type: "collection",
    // Only pass itemList if there are actually items to list
    ...(itemList.length > 0 ? { itemList } : {}),
    breadcrumbs: [
      { path: "/", name: "Home" },
      { path: "/blog", name: "Blog" },
      { path: `/blog/tags/${tagSlug}`, name: `${tagName} Posts` },
    ],
  });

  // Create the window title with the tag slug
  const windowTitle = `~/blog/tags/${tagSlug}`;

  return (
    <>
      <JsonLdScript data={jsonLdData} />
      <Blog windowTitle={windowTitle}>
        <div className="container mx-auto px-4 py-8">
          <h1 className="mb-8 text-3xl font-bold leading-tight tracking-tighter text-primary md:text-5xl">
            <span className="capitalize">{tagName}</span> Posts
          </h1>
          {filteredPosts.length > 0 ? (
            <BlogList posts={filteredPosts} />
          ) : (
            <p>No posts found for this tag.</p>
          )}

          {firstPost && (
            <Suspense fallback={<RelatedContentFallback title="Discover More" />}>
              <div className="mt-12 border-t border-gray-200 dark:border-gray-700 pt-10">
                <RelatedContent
                  sourceType="blog"
                  sourceId={firstPost.id}
                  sectionTitle="Discover More"
                  options={{
                    maxPerType: 3,
                    maxTotal: 12,
                    excludeTags: canonicalTag ? [canonicalTag] : [],
                  }}
                />
              </div>
            </Suspense>
          )}
        </div>
      </Blog>
    </>
  );
}
