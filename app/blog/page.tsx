/**
 * Blog Index Page
 * @module app/blog/page
 * @description
 * Lists all blog posts with previews and metadata.
 * Implements proper SEO with schema.org structured data.
 */

import { Blog } from "../../components/features/blog/blog.client";
import { getStaticPageMetadata } from "../../lib/seo/metadata";
import { JsonLdScript } from "../../components/seo/json-ld";
import { PAGE_METADATA } from "../../data/metadata";
import { formatSeoDate } from "../../lib/seo/utils";
import type { Metadata } from "next";
import { getAllPosts } from '../../lib/blog';
import type { BlogPost } from '../../types/blog';
import { BlogListServer } from "../../components/features/blog/blog-list/blog-list.server";

/**
 * Generate metadata for the blog index page
 */
export const metadata: Metadata = getStaticPageMetadata('/blog', 'blog');

/**
 * Enable static generation with revalidation
 * This generates static HTML at build time and revalidates periodically
 */
export const dynamic = 'force-static';
export const revalidate = 3600; // Revalidate every hour

/**
 * Blog index page component
 */
export default async function BlogPage() {
  const pageMetadata = PAGE_METADATA.blog;
  const formattedCreated = formatSeoDate(pageMetadata.dateCreated);
  const formattedModified = formatSeoDate(pageMetadata.dateModified);

  let posts: BlogPost[] = [];
  try {
    posts = await getAllPosts();
  } catch (error) {
    console.error('Failed to fetch blog posts:', error);
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
          "datePublished": formattedCreated,
          "dateModified": formattedModified
        }}
      />
      {/* Pass the pre-rendered content to the client component */}
      <Blog>
        {blogListContent}
      </Blog>
    </>
  );
}
