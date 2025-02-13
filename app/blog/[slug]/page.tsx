/**
 * Blog Post Page
 * @module app/blog/[slug]/page
 * @description
 * Renders individual blog posts with full content and metadata.
 * Implements proper SEO with schema.org structured data.
 */

import { notFound } from 'next/navigation';
import { getMDXPost } from "@/lib/blog/mdx";
import { JsonLdScript } from "@/components/seo/json-ld";
import { SITE_NAME } from "@/data/metadata";
import type { Metadata } from "next";
import { ErrorBoundary } from '@/components/ui/errorBoundary';
import BlogArticle from '@/components/features/blog/blog-article/blog-article';
import type { Article, WithContext } from 'schema-dts';

interface BlogPostPageProps {
  params: {
    slug: string;
  };
}

/**
 * Generate metadata for the blog post
 */
export async function generateMetadata({ params }: BlogPostPageProps): Promise<Metadata> {
  try {
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
  } catch (error) {
    console.error(`Error generating metadata for ${params.slug}:`, error);
    return {};
  }
}

/**
 * Blog post page component
 */
export default async function BlogPostPage({ params }: BlogPostPageProps) {
  try {
    const post = await getMDXPost(params.slug);
    if (!post) {
      notFound();
    }

    // Custom fallback UI for blog errors
    const blogFallback = (
      <div className="flex flex-col items-center justify-center min-h-[50vh] p-4">
        <h2 className="text-2xl font-bold mb-4">Unable to load blog post</h2>
        <p className="text-gray-600 dark:text-gray-400 mb-4">
          The blog post content could not be loaded. Please try refreshing the page.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
        >
          Refresh Page
        </button>
      </div>
    );

    // Prepare JSON-LD data
    const jsonLd: WithContext<Article> = {
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
    };

    // Dates are already in correct format from getMDXPost
    return (
      <ErrorBoundary
        onError={(error) => {
          console.error(`Blog post error for ${params.slug}:`, error);
        }}
        fallback={blogFallback}
      >
        <JsonLdScript data={jsonLd} />
        <BlogArticle post={post} jsonLd={jsonLd} />
      </ErrorBoundary>
    );
  } catch (error) {
    console.error(`Error rendering blog post ${params.slug}:`, error);
    notFound();
  }
}
