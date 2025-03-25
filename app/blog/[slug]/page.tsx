/**
 * Blog Post Page
 * @module app/blog/[slug]/page
 * @description
 * Renders individual blog posts with full content and metadata.
 * Implements proper SEO with schema.org structured data.
 */

import { BlogArticle } from "../../../components/features/blog";
import { getMDXPost } from "../../../lib/blog/mdx";
import { JsonLdScript } from "../../../components/seo/json-ld";
import { formatSeoDate } from "../../../lib/seo/utils";
import { SITE_NAME } from "../../../data/metadata";
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

  const formattedPublished = formatSeoDate(post.publishedAt);
  const formattedModified = formatSeoDate(post.updatedAt || post.publishedAt);

  // Full URL for the blog post
  const postUrl = `${process.env.NEXT_PUBLIC_SITE_URL || 'https://williamcallahan.com'}/blog/${post.slug}`;

  return {
    title: `${post.title} - ${SITE_NAME}'s Blog`,
    description: post.excerpt,
    openGraph: {
      title: post.title,
      description: post.excerpt,
      type: 'article',
      url: postUrl,
      images: post.coverImage
        ? [{ url: post.coverImage }]
        : [],
      publishedTime: formattedPublished,
      modifiedTime: formattedModified,
      authors: [post.author.name],
      tags: post.tags,
    },
    twitter: {
      card: 'summary_large_image',
      title: post.title,
      description: post.excerpt,
      site: "@william_a_h",
      images: post.coverImage
        ? [{ url: post.coverImage }]
        : [],
    },
  };
}

/**
 * Blog post page component
 */
export default async function BlogPostPage({ params }: BlogPostPageProps) {
  const post = await getMDXPost(params.slug);
  if (!post) return null;

  const formattedPublished = formatSeoDate(post.publishedAt);
  const formattedModified = formatSeoDate(post.updatedAt || post.publishedAt);

  return (
    <>
      <JsonLdScript
        data={{
          "@context": "https://schema.org",
          "@type": "Article",
          "headline": post.title,
          "description": post.excerpt,
          "datePublished": formattedPublished,
          "dateModified": formattedModified,
          "author": {
            "@type": "Person",
            "name": post.author.name
          }
        }}
      />
      <BlogArticle post={post} />
    </>
  );
}
