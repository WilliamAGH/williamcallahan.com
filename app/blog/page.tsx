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
import { formatSeoDate } from "../../lib/seo/utils";
import type { Metadata } from "next";
import { getAllPosts } from '../../lib/blog';

/**
 * Generate metadata for the blog index page
 */
export const metadata: Metadata = getStaticPageMetadata('/blog', 'blog');

/**
 * Blog index page component
 */
export default async function BlogPage() {
  const pageMetadata = PAGE_METADATA.blog;
  const formattedCreated = formatSeoDate(pageMetadata.dateCreated);
  const formattedModified = formatSeoDate(pageMetadata.dateModified);

  const posts = await getAllPosts();

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
      <Blog initialPosts={posts} />
    </>
  );
}
