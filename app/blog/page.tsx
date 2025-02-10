/**
 * Blog Landing Page
 *
 * Displays a list of all blog posts with filtering and search capabilities.
 */

import type { Metadata } from "next";
import { BlogList } from "../../components/features/blog/blog-list/blog-list";
import { getAllPosts } from "../../lib/blog";
import { getStaticPageMetadata } from "../../lib/seo/metadata";

export const metadata: Metadata = {
  ...getStaticPageMetadata("/blog"),
  alternates: {
    canonical: "https://williamcallahan.com/blog",
  },
  openGraph: {
    title: "Blog | William Alan Callahan",
    description: "Thoughts on technology, investing, and building companies",
    type: "website",
    url: "https://williamcallahan.com/blog",
  },
  twitter: {
    card: "summary",
    title: "Blog | William Alan Callahan",
    description: "Thoughts on technology, investing, and building companies",
    creator: "@williamcallahan",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default async function Page() {
  const posts = await getAllPosts();

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <header className="mb-12">
        <h1 className="text-4xl font-bold mb-4">Blog</h1>
        <p className="text-xl text-gray-600 dark:text-gray-400">
          Thoughts on technology, investing, and building companies
        </p>
      </header>

      <BlogList posts={posts} />
    </div>
  );
}
