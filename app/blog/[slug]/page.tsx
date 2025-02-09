import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BlogWrapper } from "../../../components/features/blog/blog-article";
import { getPostBySlug } from "../../../lib/blog";
import { getBlogPostMetadata, ensureAbsoluteUrl } from "../../../lib/seo";
import type { Article, WithContext } from "schema-dts";
import type { OpenGraphMetadata } from "../../../types/seo";

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
  const { openGraph: og } = metadata;

  if (!og) {
    return {
      title: metadata.title,
      description: metadata.description,
    };
  }

  return {
    title: metadata.title,
    description: metadata.description,
    openGraph: {
      title: og.title,
      description: og.description,
      type: og.type,
      url: og.url,
      siteName: og.siteName,
      locale: og.locale,
      images: typeof og.image === 'string'
        ? [{ url: ensureAbsoluteUrl(og.image) }]
        : [{
            url: ensureAbsoluteUrl(og.image.url),
            width: og.image.width,
            height: og.image.height,
            alt: og.image.alt,
          }],
      ...(og.type === 'article' && og.article && {
        article: {
          publishedTime: og.article.publishedTime,
          modifiedTime: og.article.modifiedTime,
          ...(og.article.expirationTime && {
            expirationTime: og.article.expirationTime
          }),
          ...(og.article.authors?.length && {
            authors: og.article.authors
          }),
          ...(og.article.section && {
            section: og.article.section
          }),
          ...(og.article.tags?.length && {
            tags: og.article.tags
          }),
        }
      }),
    },
    twitter: metadata.twitter && {
      card: metadata.twitter.card,
      site: metadata.twitter.site,
      creator: metadata.twitter.creator,
      title: metadata.twitter.title,
      description: metadata.twitter.description,
      images: metadata.twitter.image
        ? [{
            url: ensureAbsoluteUrl(metadata.twitter.image),
            alt: metadata.twitter.imageAlt,
          }]
        : undefined,
    },
    alternates: {
      canonical: metadata.canonical,
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
