import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { BlogWrapper } from '../../../components/features/blog/blog-article';
import { getPostBySlug } from '../../../lib/blog';

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
  if (!post) return { title: 'Post Not Found' };

  return {
    title: `${post.title} | William Alan Callahan`,
    description: post.excerpt,
    openGraph: {
      title: post.title,
      description: post.excerpt,
      type: 'article',
      images: post.coverImage ? [{ url: post.coverImage }] : []
    }
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
