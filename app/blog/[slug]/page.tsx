/**
 * Blog Post Page
 * @module app/blog/[slug]/page
 * @description
 * Renders individual blog posts with proper SEO metadata.
 * Handles:
 * - MDX content rendering
 * - Article metadata generation using Next.js 14 Metadata API
 * - JSON-LD structured data following Next.js recommendations
 *
 * @see {@link "https://nextjs.org/docs/app/api-reference/functions/generate-metadata"} - Next.js Metadata API
 * @see {@link "https://schema.org/Article"} - Schema.org Article specification
 */

import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { BlogWrapper } from "../../../components/features/blog/blog-article/blog-wrapper";
import { getPostBySlug } from "../../../lib/blog";
import type { BlogPost } from "../../../types/blog";
import { metadata as siteMetadata, SITE_NAME } from "../../../data/metadata";

interface BlogPostPageProps {
  params: {
    slug: string;
  };
}

/**
 * Generate metadata for the blog post using Next.js 14 Metadata API
 * Includes:
 * - Basic meta tags
 * - OpenGraph article metadata
 * - Twitter card metadata
 * - Canonical URL (production only)
 *
 * @see {@link "https://nextjs.org/docs/app/api-reference/functions/generate-metadata"} - Next.js Metadata API
 * @see {@link "https://ogp.me/#type_article"} - OpenGraph article specification
 */
export async function generateMetadata({ params }: BlogPostPageProps): Promise<Metadata> {
  const post: BlogPost | null = await getPostBySlug(params.slug);
  if (!post) return { title: "Post Not Found" };

  const isProd = process.env.NODE_ENV === 'production';
  const url = isProd
    ? `https://williamcallahan.com/blog/${params.slug}`
    : `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/blog/${params.slug}`;

  return {
    title: `${post.title} - ${SITE_NAME}'s Blog`,
    description: post.excerpt,
    authors: [{ name: post.author.name }],
    openGraph: {
      title: post.title,
      description: post.excerpt,
      type: 'article',
      url,
      images: post.coverImage ? [
        {
          url: post.coverImage,
          alt: post.title,
        }
      ] : [siteMetadata.defaultImage],
      siteName: SITE_NAME,
      locale: 'en_US',
      publishedTime: post.publishedAt,
      modifiedTime: post.updatedAt || post.publishedAt,
      authors: [post.author.name],
      tags: post.tags,
    },
    twitter: {
      card: 'summary_large_image',
      site: siteMetadata.social.twitter,
      creator: siteMetadata.social.twitter,
      title: post.title,
      description: post.excerpt,
      images: post.coverImage ? [{ url: post.coverImage, alt: post.title }] : undefined,
    },
    ...(isProd && {
      alternates: {
        canonical: `https://williamcallahan.com/blog/${params.slug}`,
      },
    }),
  };
}

/**
 * Blog post page component
 * Renders the blog post content and JSON-LD structured data
 * Following Next.js recommendation to include JSON-LD in the page component
 *
 * @see {@link "https://nextjs.org/docs/app/building-your-application/optimizing/metadata#json-ld"}
 */
export default async function BlogPostPage({ params }: BlogPostPageProps) {
  const post: BlogPost | null = await getPostBySlug(params.slug);
  if (!post) notFound();

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    description: post.excerpt,
    author: {
      '@type': 'Person',
      name: post.author.name,
    },
    datePublished: post.publishedAt,
    dateModified: post.updatedAt || post.publishedAt,
    publisher: {
      '@type': 'Person',
      name: SITE_NAME,
      url: 'https://williamcallahan.com',
    },
    ...(post.coverImage && {
      image: {
        '@type': 'ImageObject',
        url: post.coverImage,
      },
    }),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <BlogWrapper post={post} />
    </>
  );
}
