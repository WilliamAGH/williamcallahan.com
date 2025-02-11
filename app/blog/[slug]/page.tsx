/**
 * Blog Post Page
 * @module app/blog/[slug]/page
 * @description
 * Renders individual blog posts with full content and metadata.
 * Implements proper SEO with schema.org structured data.
 */

import { BlogWrapper } from "@/components/features/blog/blog-article";
import { getMDXPost } from "@/lib/blog/mdx";
import { JsonLdScript } from "@/components/seo/json-ld";
import { SITE_NAME } from "@/data/metadata";
import type { Metadata } from "next";

interface BlogPostPageProps {
  params: {
    slug: string;
  };
}

/**
 * Generate metadata for the blog post
 */
export async function generateMetadata({ params }: BlogPostPageProps): Promise<Metadata> {
  const post = await getMDXPost(params.slug);
  if (!post) return {};

  // MDX dates are already converted to Pacific time by getMDXPost
  return {
    // Pass dates directly since they're already in correct format
    title: `${post.title} - ${SITE_NAME}'s Blog`,
    description: post.excerpt,
    openGraph: {
      title: post.title,
      description: post.excerpt,
      type: 'article',
      publishedTime: post.publishedAt,
      modifiedTime: post.updatedAt || post.publishedAt,
      authors: [post.author.name],
      tags: post.tags,
    },
    twitter: {
      card: 'summary_large_image',
      title: post.title,
      description: post.excerpt,
    },
  };
}

/**
 * Blog post page component
 */
export default async function BlogPostPage({ params }: BlogPostPageProps) {
  const post = await getMDXPost(params.slug);
  if (!post) return null;

  // Dates are already in correct format from getMDXPost
  return (
    <>
      <JsonLdScript
        data={{
          "@context": "https://schema.org",
          "@type": "Article",
          "headline": post.title,
          "description": post.excerpt,
          "datePublished": post.publishedAt,
          "dateModified": post.updatedAt || post.publishedAt,
          "author": {
            "@type": "Person",
            "name": post.author.name
          }
        }}
      />
      <BlogWrapper post={post} />
    </>
  );
}
