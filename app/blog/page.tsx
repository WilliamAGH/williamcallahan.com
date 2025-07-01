/**
 * Blog Index Page
 * @module app/blog/page
 * @description
 * Lists all blog posts with previews and metadata.
 * Implements proper SEO with schema.org structured data.
 */

import type { Metadata } from "next";
import { Blog } from "@/components/features/blog/blog.client";
import { BlogListServer } from "@/components/features/blog/blog-list/blog-list.server";
import { getAllPosts } from "@/lib/blog";
import { getStaticPageMetadata } from "@/lib/seo";
import { JsonLdScript } from "@/components/seo/json-ld";
import { generateSchemaGraph } from "@/lib/seo/schema";
import { PAGE_METADATA } from "@/data/metadata";
import { formatSeoDate } from "@/lib/seo/utils";
import type { BlogPost } from "@/types/blog";

export const metadata: Metadata = getStaticPageMetadata("/blog", "blog");

/**
 * Enable static generation with revalidation
 * This generates static HTML at build time and revalidates periodically
 */
export const revalidate = 3600; // Revalidate every hour

/**
 * Blog index page component with JSON-LD schema
 */
export default async function BlogPage() {
  let posts: BlogPost[] = [];
  try {
    posts = await getAllPosts();
  } catch (error) {
    console.error("Failed to fetch blog posts:", error);
    // Could also set an error state to display to the user
  }

  // Generate JSON-LD schema for the blog page
  const pageMetadata = PAGE_METADATA.blog;
  const formattedCreated = formatSeoDate(pageMetadata.dateCreated);
  const formattedModified = formatSeoDate(pageMetadata.dateModified);

  const schemaParams = {
    path: "/blog",
    title: pageMetadata.title,
    description: pageMetadata.description,
    datePublished: formattedCreated,
    dateModified: formattedModified,
    type: "collection" as const,
    breadcrumbs: [
      { path: "/", name: "Home" },
      { path: "/blog", name: "Blog" },
    ],
    image: {
      url: "/images/og/blog-og.png",
      width: 2100,
      height: 1100,
    },
  };

  const jsonLdData = generateSchemaGraph(schemaParams);

  // Pre-render the server component here
  const blogListContent = await Promise.resolve(<BlogListServer posts={posts} />);

  return (
    <>
      <JsonLdScript data={jsonLdData} />
      <Blog>{blogListContent}</Blog>
    </>
  );
}
