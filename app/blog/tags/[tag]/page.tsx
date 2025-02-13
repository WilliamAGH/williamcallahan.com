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
import { PAGE_METADATA, SITE_NAME } from "@/data/metadata";
import { getAllTags, getPostsByTag, tagExists } from "@/lib/blog";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

interface BlogTagPageProps {
  params: { tag: string }
}

/**
 * Generate metadata for the blog tag page
 */
export async function generateMetadata({ params }: BlogTagPageProps): Promise<Metadata> {
  const { tag } = params;
  const exists = await tagExists(tag);
  if (!exists) {
    notFound();
  }

  const pageMetadata = PAGE_METADATA.blogTag;
  const capitalizedTag = tag.charAt(0).toUpperCase() + tag.slice(1);
  const title = pageMetadata.title.replace(/%tag%/g, capitalizedTag);
  const description = pageMetadata.description.replace(/%tag%/g, capitalizedTag);

  return getStaticPageMetadata(`/blog/tags/${tag}`, 'blogTag', {
    title,
    description,
    breadcrumbs: [
      { path: '/', name: 'Home' },
      { path: '/blog', name: 'Blog' },
      { path: `/blog/tags/${tag}`, name: `Posts tagged "${capitalizedTag}"` }
    ]
  });
}

/**
 * Generate static params for all tag pages
 */
export async function generateStaticParams() {
  const tags = await getAllTags();
  return tags.map(tag => ({ tag }));
}

/**
 * Blog tag page component
 */
export default async function BlogTagPage({ params }: BlogTagPageProps) {
  const { tag } = params;

  // Check if tag exists
  const exists = await tagExists(tag);
  if (!exists) {
    notFound();
  }

  const pageMetadata = PAGE_METADATA.blog;
  // PAGE_METADATA dates are already in Pacific time
  const { dateCreated, dateModified } = pageMetadata;

  // Get posts for this tag
  const posts = await getPostsByTag(tag);

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
