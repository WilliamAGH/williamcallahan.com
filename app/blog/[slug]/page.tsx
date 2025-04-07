/**
 * Blog Post Page
 * @module app/blog/[slug]/page
 * @description
 * Renders individual blog posts with full content and metadata.
 * Implements proper SEO with schema.org structured data.
 */

import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getMDXPost } from '../../../lib/blog/mdx';
import { formatSeoDate } from '../../../lib/seo/utils';
import { BlogArticle } from '../../../components/features/blog/blog-article/blog-article';
import { JsonLdScript } from "../../../components/seo/json-ld";
import { SITE_NAME } from "../../../data/metadata";

interface BlogPostPageProps {
  params: Promise<{ slug: string }>;
}

/**
 * Generate metadata for blog post pages
 */
export async function generateMetadata({ params }: BlogPostPageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = await getMDXPost(slug);
  if (!post) return {};

  const formattedPublished = formatSeoDate(post.publishedAt);
  const formattedUpdated = post.updatedAt ? formatSeoDate(post.updatedAt) : undefined;

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
      publishedTime: formattedPublished,
      modifiedTime: formattedUpdated,
      authors: [post.author.name],
      images: post.coverImage ? [post.coverImage] : [],
    },
    twitter: {
      card: 'summary_large_image',
      title: post.title,
      description: post.excerpt,
      site: "@williamcallahan",
      images: post.coverImage ? [post.coverImage] : [],
    },
  };
}

/**
 * Blog post page component
 */
export default async function BlogPostPage({ params }: BlogPostPageProps) {
  const { slug } = await params;

  try {
    const post = await getMDXPost(slug);

    // If post not found, use Next.js built-in 404 page
    if (!post) {
      console.log(`Blog post not found: ${slug} - Returning 404 page`);
      notFound();
    }

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
  } catch (error) {
    // Log the error with details
    console.error(`Error rendering blog post ${slug}:`, error);

    // Return 404 page for any error in blog post rendering
    // This prevents server crashes and provides a better user experience
    notFound();
  }
}
