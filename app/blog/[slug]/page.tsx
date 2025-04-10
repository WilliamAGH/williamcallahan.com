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
import { getAllPosts } from '../../../lib/blog';
import { formatSeoDate } from '../../../lib/seo/utils';
import { BlogArticle } from '../../../components/features/blog/blog-article/blog-article';
import { JsonLdScript } from "../../../components/seo/json-ld";
import { SITE_NAME, metadata as siteMetadata } from "../../../data/metadata";
import { ensureAbsoluteUrl } from "../../../lib/seo/utils";
import { createArticleMetadata, createSoftwareApplicationMetadata } from "../../../lib/seo/metadata";

interface BlogPostPageProps {
  params: Promise<{ slug: string }>;
}

/**
 * Generate static paths for all blog posts at build time
 * with ISR revalidation for newer content
 */
export const generateStaticParams = async () => {
  const posts = await getAllPosts();
  return posts.map((post) => ({
    slug: post.slug,
  }));
};

// Set revalidation time for ISR (Incremental Static Regeneration)
// Using a fixed value as conditional expressions aren't supported in config exports
export const dynamic = 'force-static'; // Add dynamic option for static generation
export const revalidate = 3600; // Revalidate every hour

/**
 * List of blog posts that should use software application schema
 * This helps improve SEO for software-related posts
 */
const SOFTWARE_POSTS = [
  'introducing-flag-deprecated-files-vscode-extension'
];

/**
 * Software application details by slug
 * Provides schema.org SoftwareApplication metadata for specific posts
 */
const SOFTWARE_DETAILS: Record<string, {
  name: string;
  operatingSystem: string;
  applicationCategory: string;
  downloadUrl: string;
  softwareVersion?: string;
  screenshot?: string;
}> = {
  'introducing-flag-deprecated-files-vscode-extension': {
    name: 'Flag Deprecated Files',
    operatingSystem: 'Windows, macOS, Linux',
    applicationCategory: 'DeveloperApplication',
    downloadUrl: 'https://marketplace.visualstudio.com/items?itemName=WilliamCallahan.flag-deprecated-files',
    softwareVersion: '1.0.0',
    screenshot: '/images/posts/filey-flag-deprecated-files.png'
  }
};

/**
 * Generate metadata for blog post pages
 * Uses the schema.org NewsArticle structure for regular blog posts
 * Uses the schema.org SoftwareApplication structure for software/extension posts
 *
 * @see {@link "https://schema.org/NewsArticle"} - Schema.org NewsArticle specification
 * @see {@link "https://schema.org/SoftwareApplication"} - Schema.org SoftwareApplication specification
 */
export async function generateMetadata({ params }: BlogPostPageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = await getMDXPost(slug);

  if (!post) return {};

  // Full URL for the blog post
  const postUrl = ensureAbsoluteUrl(`/blog/${post.slug}`);

  // Check if this is a software post
  const isSoftwarePost = SOFTWARE_POSTS.includes(slug);

  if (isSoftwarePost && SOFTWARE_DETAILS[slug]) {
    // Use SoftwareApplication schema for software posts
    const softwareDetails = SOFTWARE_DETAILS[slug];

    const articleMetadata = createSoftwareApplicationMetadata({
      title: post.title,
      description: post.excerpt,
      url: postUrl,
      image: post.coverImage,
      datePublished: post.publishedAt,
      dateModified: post.updatedAt || post.publishedAt,
      tags: post.tags,
      articleBody: JSON.stringify(post.content),
      softwareName: softwareDetails.name,
      operatingSystem: softwareDetails.operatingSystem,
      applicationCategory: softwareDetails.applicationCategory,
      isFree: true,
      downloadUrl: softwareDetails.downloadUrl,
      softwareVersion: softwareDetails.softwareVersion,
      screenshot: softwareDetails.screenshot,
      authors: [{
        name: post.author.name,
        url: post.author.url || ensureAbsoluteUrl('/about')
      }]
    });

    // Extract needed properties for Metadata type
    return {
      title: articleMetadata.title,
      description: articleMetadata.description,
      alternates: articleMetadata.alternates,
      openGraph: articleMetadata.openGraph,
      twitter: articleMetadata.twitter,
      // Include the JSON-LD script with type assertion
      ...(articleMetadata.script && { script: articleMetadata.script }),
    } as Metadata;
  } else {
    // Use standard NewsArticle schema for regular blog posts
    const articleMetadata = createArticleMetadata({
      title: post.title,
      description: post.excerpt,
      url: postUrl,
      image: post.coverImage,
      datePublished: post.publishedAt,
      dateModified: post.updatedAt || post.publishedAt,
      tags: post.tags,
      articleBody: JSON.stringify(post.content),
      useNewsArticle: true,
      authors: [{
        name: post.author.name,
        url: post.author.url || ensureAbsoluteUrl('/about')
      }]
    });

    // Extract needed properties for Metadata type
    return {
      title: articleMetadata.title,
      description: articleMetadata.description,
      alternates: articleMetadata.alternates,
      openGraph: articleMetadata.openGraph,
      twitter: articleMetadata.twitter,
      // Include the JSON-LD script with type assertion
      ...(articleMetadata.script && { script: articleMetadata.script }),
    } as Metadata;
  }
}

/**
 * Blog post page component
 * Note: We use JsonLdScript directly in the component to ensure the schema data is
 * injected into the page at render time, which can help with immediate indexing
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

    // Create blog article component without redundant schema
    // The schema is already handled by generateMetadata above
    return <BlogArticle post={post} />;
  } catch (error) {
    // Log the error with details
    console.error(`Error rendering blog post ${slug}:`, error);

    // Return 404 page for any error in blog post rendering
    // This prevents server crashes and provides a better user experience
    notFound();
  }
}
