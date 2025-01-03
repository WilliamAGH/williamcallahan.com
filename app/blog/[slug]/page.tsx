import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BlogWrapper } from "../../../components/features/blog/blog-article";
import { getPostBySlug } from "../../../lib/blog";
import { getBlogPostMetadata } from "../../../lib/seo";
import type { Article, WithContext } from "schema-dts";

/**
 * Props for the BlogPostPage component
 */
interface BlogPostPageProps {
  /** URL parameters */
  params: {
    /** URL slug of the blog post to display */
    slug: string;
  };
}

/**
 * Generates metadata for the blog post page
 *
 * @param {BlogPostPageProps} props - Component props containing URL parameters
 * @returns {Promise<Metadata>} Next.js metadata object for the page
 */
export async function generateMetadata({ params }: BlogPostPageProps): Promise<Metadata> {
  const post = await getPostBySlug(params.slug);
  if (!post) return { title: "Post Not Found" };

  const metadata = getBlogPostMetadata(post);

  // Schema.org Article metadata
  const jsonLd: WithContext<Article> = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.excerpt,
    author: {
      "@type": "Person",
      name: post.author.name,
    },
    datePublished: metadata.datePublished,
    dateModified: metadata.dateModified,
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": metadata.canonical,
    },
    publisher: {
      "@type": "Person",
      name: "William Callahan",
    },
  };

  return {
    metadataBase: new URL('https://williamcallahan.com'),
    title: metadata.title,
    description: metadata.description,
    openGraph: {
      type: "article",
      publishedTime: metadata.datePublished,
      modifiedTime: metadata.dateModified,
      authors: [post.author.name],
      tags: post.tags,
      url: metadata.canonical,
      images: post.coverImage ? [{ url: post.coverImage }] : undefined,
    },
    alternates: {
      canonical: metadata.canonical,
    },
    authors: [{ name: post.author.name }],
    keywords: post.tags,
    robots: {
      index: true,
      follow: true,
    },
    other: {
      "article:published_time": metadata.datePublished,
      "article:modified_time": metadata.dateModified,
      "script:ld+json": JSON.stringify(jsonLd),
    },
  };
}

/**
 * Blog Post Page Component
 *
 * Displays a single blog post using the BlogArticle component.
 * Handles fetching the post data and showing a 404 page if not found.
 *
 * @param {BlogPostPageProps} props - Component props containing URL parameters
 * @returns {Promise<JSX.Element>} The rendered blog post page
 */
export default async function BlogPostPage({ params }: BlogPostPageProps) {
  const post = await getPostBySlug(params.slug);
  if (!post) notFound();

  // Validate post has required MDX content
  if (!post.content) {
    console.error(`Post ${params.slug} is missing MDX content`);
    notFound();
  }

  return <BlogWrapper post={post} />;
}
