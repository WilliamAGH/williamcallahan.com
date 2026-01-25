/**
 * Blog Post Page
 * @module app/blog/[slug]/page
 * @description
 * Renders individual blog posts with full content and metadata.
 * Implements proper SEO with schema.org structured data.
 *
 * Note: This dynamic route is rendered on-demand (no generateStaticParams) to avoid
 * expensive build-time generation in low-resource CI environments.
 * The "use cache" directive is intentionally NOT used here because params is request-specific
 * and cannot be accessed inside a cached context in Next.js 16+.
 */

import { Suspense } from "react";
import type { BlogPostPageProps, SoftwarePostDetails } from "@/types/blog";
// Import blog post retrieval utilities from the main blog library
import { getPostBySlug, getPostMetaBySlug } from "@/lib/blog.ts";
import { createArticleMetadata, createSoftwareApplicationMetadata } from "@/lib/seo/metadata.ts";
import { ensureAbsoluteUrl } from "@/lib/seo/utils";
import type { ExtendedMetadata } from "@/types/seo";
import { notFound } from "next/navigation";
import { BlogArticle } from "../../../components/features/blog";
import { JsonLdScript } from "@/components/seo/json-ld";
import { generateSchemaGraph } from "@/lib/seo/schema";
import { getStaticImageUrl } from "@/lib/data-access/static-images";
import { RelatedContent, RelatedContentFallback } from "@/components/features/related-content";

/**
 * Software application details by slug.
 * Posts with entries here will use SoftwareApplication schema instead of NewsArticle.
 */
const SOFTWARE_DETAILS: Record<string, SoftwarePostDetails> = {
  "introducing-flag-deprecated-files-vscode-extension": {
    name: "Flag Deprecated Files",
    operatingSystem: "Windows, macOS, Linux",
    applicationCategory: "DeveloperApplication",
    downloadUrl: "https://marketplace.visualstudio.com/items?itemName=WilliamCallahan.flag-deprecated-files",
    softwareVersion: "1.0.0",
    screenshot: getStaticImageUrl("/images/posts/filey-flag-deprecated-files.png"),
  },
};

/**
 * Get software details for a blog post slug if it's a software post.
 * Returns undefined for regular blog posts.
 */
function getSoftwareDetails(slug: string): SoftwarePostDetails | undefined {
  return SOFTWARE_DETAILS[slug];
}

/**
 * Generate metadata for blog post pages
 * Uses the schema.org NewsArticle structure for regular blog posts
 * Uses the schema.org SoftwareApplication structure for software/extension posts
 *
 * @see {@link "https://schema.org/NewsArticle"} - Schema.org NewsArticle specification
 * @see {@link "https://schema.org/SoftwareApplication"} - Schema.org SoftwareApplication specification
 */
export async function generateMetadata({ params }: BlogPostPageProps): Promise<ExtendedMetadata> {
  // params is already resolved here by Next.js
  const { slug } = await params;
  // Use getPostMetaBySlug for lightweight metadata (skips MDX compilation + blur generation)
  const post = await getPostMetaBySlug(slug);

  if (!post) {
    console.warn(`[generateMetadata] Post not found for slug: ${slug}. Returning empty metadata.`);
    // Optionally return metadata for a 404 page here if desired
    return {
      title: "Post Not Found",
      description: "The blog post you are looking for could not be found.",
    };
  }

  // Full URL for the blog post
  const postUrl = ensureAbsoluteUrl(`/blog/${post.slug}`);

  // Check if this is a software post (use canonical post.slug, not route param)
  const softwareDetails = getSoftwareDetails(post.slug);

  const baseArticleParams = {
    title: post.title,
    description: post.excerpt,
    url: postUrl,
    image: post.coverImage ? ensureAbsoluteUrl(post.coverImage) : undefined,
    datePublished: post.publishedAt,
    dateModified: post.updatedAt || post.publishedAt,
    tags: post.tags,
    articleBody: post.rawContent ?? post.excerpt,
    authors: [
      {
        name: post.author.name,
        url: post.author.url || ensureAbsoluteUrl("/about"),
      },
    ],
  };

  const articleMetadata = softwareDetails
    ? createSoftwareApplicationMetadata({
        ...baseArticleParams,
        softwareName: softwareDetails.name,
        operatingSystem: softwareDetails.operatingSystem,
        applicationCategory: softwareDetails.applicationCategory,
        isFree: true,
        downloadUrl: softwareDetails.downloadUrl,
        softwareVersion: softwareDetails.softwareVersion,
        screenshot: softwareDetails.screenshot,
      })
    : createArticleMetadata({
        ...baseArticleParams,
        useNewsArticle: true,
      });

  const metadata: ExtendedMetadata = {
    title: articleMetadata.title,
    description: articleMetadata.description,
    alternates: articleMetadata.alternates,
    openGraph: articleMetadata.openGraph,
    twitter: articleMetadata.twitter,
    ...(articleMetadata.script && { script: articleMetadata.script }),
  };

  return metadata;
}

/**
 * Blog post page component
 * Note: We use JsonLdScript directly in the component to ensure the schema data is
 * injected into the page at render time, which can help with immediate indexing
 */
export default async function BlogPostPage({ params }: BlogPostPageProps) {
  // params is already resolved here by Next.js
  const { slug } = await params;

  try {
    // Use getPostBySlug which handles finding the post correctly using the canonical frontmatter slug
    const post = await getPostBySlug(slug);

    // If post not found, use Next.js built-in 404 page
    if (!post) {
      console.log(`Blog post not found: ${slug} - Returning 404 page`);
      notFound();
    }

    // Build JSON-LD schema graph (Next.js metadata script tag not reliable for bots)
    // Use canonical post.slug for consistency (not route param)
    const softwareDetails = getSoftwareDetails(post.slug);
    const pageType: "software" | "article" = softwareDetails ? "software" : "article";

    const absoluteImageUrl = post.coverImage ? ensureAbsoluteUrl(post.coverImage) : undefined;

    const schemaParams = {
      path: `/blog/${post.slug}`,
      title: post.title,
      description: post.excerpt,
      datePublished: new Date(post.publishedAt).toISOString(),
      dateModified: new Date(post.updatedAt ?? post.publishedAt).toISOString(),
      type: pageType,
      articleBody: post.rawContent ?? post.excerpt,
      keywords: post.tags,
      image: absoluteImageUrl
        ? {
            url: absoluteImageUrl,
            width: 1200,
            height: 630,
          }
        : undefined,
      images: absoluteImageUrl ? [absoluteImageUrl] : undefined,
      breadcrumbs: [
        { path: "/", name: "Home" },
        { path: "/blog", name: "Blog" },
        { path: `/blog/${post.slug}`, name: post.title },
      ],
      authors: [
        {
          name: post.author.name,
          url: post.author.url || ensureAbsoluteUrl("/about"),
        },
      ],
      ...(softwareDetails && {
        softwareMetadata: {
          name: softwareDetails.name,
          operatingSystem: softwareDetails.operatingSystem,
          applicationCategory: softwareDetails.applicationCategory,
          downloadUrl: softwareDetails.downloadUrl,
          softwareVersion: softwareDetails.softwareVersion,
          screenshot: softwareDetails.screenshot,
          isFree: true,
        },
      }),
    };

    const jsonLdData = generateSchemaGraph(schemaParams);

    // Import MDXContent server component here at the page level
    const { MDXContent } = await import("@/components/features/blog/blog-article/mdx-content");

    return (
      <>
        <JsonLdScript data={jsonLdData} />
        <BlogArticle post={post} mdxContent={<MDXContent content={post.content} />} />

        {/* Similar Content Section */}
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <Suspense
            fallback={
              <RelatedContentFallback
                title="Similar Content"
                className="mt-16 pt-8 border-t border-gray-200 dark:border-gray-700"
                cardCount={3}
              />
            }
          >
            <RelatedContent
              sourceType="blog"
              sourceId={post.id}
              sectionTitle="Similar Content"
              options={{
                maxPerType: 3,
                maxTotal: 12,
                excludeTypes: [], // Include all content types
              }}
              className="mt-16 pt-8 border-t border-gray-200 dark:border-gray-700"
            />
          </Suspense>
        </div>
      </>
    );
  } catch (error: unknown) {
    // Log the error with details
    if (error instanceof Error) {
      console.error(`Error rendering blog post ${slug}:`, error);
    } else {
      const errorMessage = String(error);
      console.error(`Error rendering blog post ${slug}:`, errorMessage);
    }

    // Return 404 page for any error in blog post rendering
    // This prevents server crashes and provides a better user experience
    notFound();
  }
}
