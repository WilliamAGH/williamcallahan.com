/**
 * Blog Index Page
 * @module app/blog/page
 * @description
 * Lists all blog posts with previews and metadata.
 * Implements proper SEO with schema.org structured data.
 */

import type { Metadata } from "next";
import { BlogListServer } from "../../components/features/blog/blog-list/blog-list.server";
import { Blog } from "../../components/features/blog/blog.client";
import { JsonLdScript } from "../../components/seo/json-ld";
import { PAGE_METADATA } from "../../data/metadata";
import { getAllPosts } from "../../lib/blog";
import { getStaticPageMetadata } from "../../lib/seo/metadata";
import { formatSeoDate } from "../../lib/seo/utils";
import type { CollectionPageMetadata } from "../../types/seo/metadata";
import type { BlogPost } from "../../types/blog";

/**
 * Generate metadata for the blog index page
 */
export const metadata: Metadata = getStaticPageMetadata("/blog", "blog");

/**
 * Enable static generation with revalidation
 * This generates static HTML at build time and revalidates periodically
 */
// Using ISR instead of force-static to allow revalidation
// Removed conflicting 'dynamic = force-static' directive per GitHub issue #112
export const revalidate = 3600; // Revalidate every hour

/**
 * Blog index page component
 */
export default async function BlogPage() {
  const pageMetadata: CollectionPageMetadata = PAGE_METADATA.blog;
  const formattedCreated = formatSeoDate(pageMetadata.dateCreated);
  const formattedModified = formatSeoDate(pageMetadata.dateModified);

  let posts: BlogPost[] = [];
  try {
    posts = await getAllPosts();
  } catch (error) {
    console.error("Failed to fetch blog posts:", error);
    // Could also set an error state to display to the user
  }

  // Pre-render the server component here
  const blogListContent = await Promise.resolve(<BlogListServer posts={posts} />);

  return (
    <>
      <JsonLdScript
        data={{
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          datePublished: formattedCreated,
          dateModified: formattedModified,
        }}
      />
      {/* Pass the pre-rendered content to the client component */}
      <Blog>{blogListContent}</Blog>
    </>
  );
}
