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
import type { BlogPost } from "@/types/blog";

export const metadata: Metadata = getStaticPageMetadata("/blog", "blog");

/**
 * Enable static generation with revalidation
 * This generates static HTML at build time and revalidates periodically
 */
export const revalidate = 3600; // Revalidate every hour

/**
 * Blog index page component
 */
export default async function BlogPage() {
  let posts: BlogPost[] = [];
  try {
    posts = await getAllPosts();
  } catch (error) {
    console.error("Failed to fetch blog posts:", error);
    // Could also set an error state to display to the user
  }

  // Pre-render the server component here
  const blogListContent = await Promise.resolve(<BlogListServer posts={posts} />);

  return <Blog>{blogListContent}</Blog>;
}
