/**
 * Blog Post Page
 * @module app/blog/[slug]/page
 * @description
 * Renders individual blog posts with full content and metadata.
 * Implements proper SEO with schema.org structured data.
 */

import type { BlogPostPageProps } from "@/types/blog";
// Import getPostBySlug and getAllPosts from the main blog library
import { getAllPosts, getPostBySlug } from "@/lib/blog.ts";
import { createArticleMetadata, createSoftwareApplicationMetadata } from "@/lib/seo/metadata.ts";
import { ensureAbsoluteUrl } from "@/lib/seo/utils";
import type { ExtendedMetadata } from "@/types/seo";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { BlogArticle } from "../../../components/features/blog";
import { JsonLdScript } from "@/components/seo/json-ld";
import { generateSchemaGraph } from "@/lib/seo/schema";
import { getStaticImageUrl } from "@/lib/data-access/static-images";
import { RelatedContent } from "@/components/features/related-content";

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
// Using ISR instead of force-static to allow revalidation
// Removed conflicting 'dynamic = force-static' directive per GitHub issue #112
export const revalidate = 3600; // Revalidate every hour

// Force dynamic rendering to avoid prerender-time MDX runtime issues for complex components
export const dynamic = "force-dynamic";

/**
 * List of blog posts that should use software application schema
 * This helps improve SEO for software-related posts
 */
const SOFTWARE_POSTS = ["introducing-flag-deprecated-files-vscode-extension"];

/**
 * Software application details by slug
 * Provides schema.org SoftwareApplication metadata for specific posts
 */
const SOFTWARE_DETAILS: Record<
  string,
  {
    name: string;
    operatingSystem: string;
    applicationCategory: string;
    downloadUrl: string;
    softwareVersion?: string;
    screenshot?: string;
  }
> = {
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
  // Use getPostBySlug which handles finding the post correctly using the canonical frontmatter slug
  const post = await getPostBySlug(slug);

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

  // Check if this is a software post
  const isSoftwarePost = SOFTWARE_POSTS.includes(slug);

  if (isSoftwarePost && SOFTWARE_DETAILS[slug]) {
    // Use SoftwareApplication schema for software posts
    const softwareDetails = SOFTWARE_DETAILS[slug];

    const articleMetadata = createSoftwareApplicationMetadata({
      title: post.title,
      description: post.excerpt,
      url: postUrl,
      image: post.coverImage ? ensureAbsoluteUrl(post.coverImage) : undefined,
      datePublished: post.publishedAt,
      dateModified: post.updatedAt || post.publishedAt,
      tags: post.tags,
      articleBody: JSON.stringify(post.content), // Note: content is MDXRemoteSerializeResult, might need rawContent
      softwareName: softwareDetails.name,
      operatingSystem: softwareDetails.operatingSystem,
      applicationCategory: softwareDetails.applicationCategory,
      isFree: true,
      downloadUrl: softwareDetails.downloadUrl,
      softwareVersion: softwareDetails.softwareVersion,
      screenshot: softwareDetails.screenshot,
      authors: [
        {
          name: post.author.name,
          url: post.author.url || ensureAbsoluteUrl("/about"), // Assuming /about exists or use a default
        },
      ],
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
  // Use standard NewsArticle schema for regular blog posts
  const articleMetadata = createArticleMetadata({
    title: post.title,
    description: post.excerpt,
    url: postUrl,
    image: post.coverImage ? ensureAbsoluteUrl(post.coverImage) : undefined,
    datePublished: post.publishedAt,
    dateModified: post.updatedAt || post.publishedAt,
    tags: post.tags,
    articleBody: JSON.stringify(post.content), // Note: content is MDXRemoteSerializeResult, might need rawContent
    useNewsArticle: true,
    authors: [
      {
        name: post.author.name,
        url: post.author.url || ensureAbsoluteUrl("/about"), // Assuming /about exists or use a default
      },
    ],
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
    const isSoftwarePost = SOFTWARE_POSTS.includes(slug);

    const pageType: "software" | "article" = isSoftwarePost ? "software" : "article";

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
      ...(isSoftwarePost && {
        softwareMetadata: {
          name: SOFTWARE_DETAILS[slug]?.name ?? post.title,
          operatingSystem: SOFTWARE_DETAILS[slug]?.operatingSystem ?? "Windows, macOS, Linux",
          applicationCategory: SOFTWARE_DETAILS[slug]?.applicationCategory ?? "DeveloperApplication",
          downloadUrl: SOFTWARE_DETAILS[slug]?.downloadUrl,
          softwareVersion: SOFTWARE_DETAILS[slug]?.softwareVersion,
          screenshot: SOFTWARE_DETAILS[slug]?.screenshot,
          isFree: true,
        },
      }),
    };

    const jsonLdData = generateSchemaGraph(schemaParams);

    // Read CSP nonce from middleware-injected header
    let nonce: string | undefined;
    try {
      const headersList = await headers();
      const nonceValue = headersList.get("x-nonce");
      if (nonceValue) {
        nonce = nonceValue;
      }
    } catch (error) {
      // headers() may fail in certain contexts (e.g., static generation)
      console.warn("Failed to read headers for CSP nonce:", error instanceof Error ? error.message : String(error));
    }

    // Import MDXContent server component here at the page level
    const { MDXContent } = await import("@/components/features/blog/blog-article/mdx-content");

    return (
      <>
        <JsonLdScript data={jsonLdData} nonce={nonce} />
        <BlogArticle post={post} mdxContent={<MDXContent content={post.content} />} />
        
        {/* Related Content Section */}
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <RelatedContent
            sourceType="blog"
            sourceId={post.id}
            sectionTitle="Related Content"
            options={{
              maxPerType: 4,
              maxTotal: 12,
              excludeTypes: [], // Include all content types
            }}
            className="mt-16 pt-8 border-t border-gray-200 dark:border-gray-700"
          />
        </div>
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
