/**
 * Blog Index Page
 * @module app/blog/page
 * @description
 * Lists all blog posts with previews and metadata.
 * Implements proper SEO with schema.org structured data.
 */

import { Blog } from "../../components/features";
import { getStaticPageMetadata } from "../../lib/seo/metadata";
import { JsonLdScript } from "../../components/seo/json-ld";
import { PAGE_METADATA } from "../../data/metadata";
import { getAllPosts, getPostsByTag, tagExists } from "../../lib/blog";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

/**
 * Generate metadata for the blog index page
 */
export const metadata: Metadata = getStaticPageMetadata('/blog', 'blog');

interface BlogPageProps {
  searchParams: { tag?: string }
}

/**
 * Blog index page component
 */
export default async function BlogPage({ searchParams }: BlogPageProps) {
  const { tag } = searchParams;
  const pageMetadata = PAGE_METADATA.blog;
  // PAGE_METADATA dates are already in Pacific time
  const { dateCreated, dateModified } = pageMetadata;

  // Get posts based on tag
  const posts = tag
    ? (await tagExists(tag) ? await getPostsByTag(tag) : notFound())
    : await getAllPosts();

  return (
    <>
      <JsonLdScript
        data={{
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          "datePublished": dateCreated,
          "dateModified": dateModified
        }}
      />
      <Blog posts={posts} tag={tag} />
    </>
  );
}
