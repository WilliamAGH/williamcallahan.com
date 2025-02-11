/**
 * Blog Tag Page
 * @module app/blog/tags/[tag]/page
 * @description
 * Lists all blog posts for a specific tag.
 * Implements proper SEO with schema.org structured data.
 */

import { Blog } from "@/components/features";
import { getStaticPageMetadata } from "@/lib/seo/metadata";
import { JsonLdScript } from "@/components/seo/json-ld";
import { PAGE_METADATA } from "@/data/metadata";
import { getAllMDXPosts } from "@/lib/blog/mdx";
import type { Metadata } from "next";

interface BlogTagPageProps {
  params: { tag: string }
}

/**
 * Generate metadata for the blog tag page
 */
export const metadata: Metadata = getStaticPageMetadata('/blog/tags', 'blog');

/**
 * Blog tag page component
 */
export default async function BlogTagPage({ params }: BlogTagPageProps) {
  const { tag } = params;
  const pageMetadata = PAGE_METADATA.blog;
  // PAGE_METADATA dates are already in Pacific time
  const { dateCreated, dateModified } = pageMetadata;

  // Fetch posts server-side
  const allPosts = await getAllMDXPosts();

  // Filter posts by tag
  const posts = allPosts.filter(post =>
    post.tags.some(t => t.toLowerCase() === tag.toLowerCase())
  );

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
