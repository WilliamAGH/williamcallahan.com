"use client";

import type { BlogPost } from "@/types/blog";
import dynamic from "next/dynamic";

// Dynamically import the BlogArticle component with no SSR
// This ensures proper hydration of MDX content on the client
const BlogArticle = dynamic(() => import("./blog-article.client"), { ssr: false });

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
 * Client component that wraps the client-side BlogArticle.
 * Uses dynamic import to ensure proper hydration of MDX content.
 *
 * @param {BlogWrapperProps} props - Component props
 * @returns {JSX.Element} The wrapped blog article
 */
export function BlogWrapper({ post }: BlogWrapperProps) {
  return <BlogArticle post={post} />;
}
