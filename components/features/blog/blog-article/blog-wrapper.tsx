'use client';

import type { BlogPost } from '../../../../types/blog';
import { BlogArticle } from './blog-article';

/**
 * Props for the BlogWrapper component
 */
interface BlogWrapperProps {
  /** The blog post data to render */
  post: BlogPost;
}

/**
 * BlogWrapper Component
 *
 * Client component that wraps the BlogArticle.
 * Handles the client-side rendering of MDX content.
 *
 * @param {BlogWrapperProps} props - Component props
 * @returns {JSX.Element} The wrapped blog article
 */
export function BlogWrapper({ post }: BlogWrapperProps): JSX.Element {
  return <BlogArticle post={post} />;
}
