import type { Metadata } from 'next';
import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { BlogList } from '@/components/features/blog/blog-list';
import type { BlogPost, Author } from '@/types/blog';
import { metadata } from '@/data/metadata';
import { kebabCase, deslugify } from '@/lib/utils/formatters';

import type { JSX } from "react";

// Directory where blog posts are stored
const postsDirectory = path.join(process.cwd(), 'data/blog/posts');

// Define the expected structure of frontmatter data for this page
interface PageFrontmatter {
  title: string;
  publishedAt: string | Date; // gray-matter can parse dates
  tags: string[];
  author: string; // Assuming author in frontmatter is an ID string for this simplified getter
  excerpt?: string;
  updatedAt?: string | Date;
  coverImage?: string;
  // Add other fields if used from frontmatter by this specific getAllPosts
}

// Define the primary author based on site metadata
const primaryAuthor: Author = {
  id: 'william-callahan', // Assuming a fixed ID for the main author
  name: metadata.author,
  // Add avatar/bio/url if available in metadata or define statically
  url: metadata.social.profiles.find(p => p.includes('linkedin')) || metadata.url,
  avatar: '/images/profile.jpg' // Example static avatar
};

/**
 * Fetches and parses all blog posts from the filesystem, returning full BlogPost objects.
 * @returns {Promise<BlogPost[]>} A promise that resolves to an array of blog post data.
 */
function getAllPosts(): BlogPost[] {
  try {
    const filenames = fs.readdirSync(postsDirectory);

    const posts = filenames
      .filter((filename) => filename.endsWith('.mdx'))
      .map((filename) => {
        const filePath = path.join(postsDirectory, filename);
        const fileContents = fs.readFileSync(filePath, 'utf8');
        // Cast the frontmatter data to the defined interface, via unknown
        const { data: frontmatter, content: rawContent } = matter(fileContents) as unknown as {
          data: PageFrontmatter;
          content: string;
        };
        const slug = filename.replace(/\.mdx$/, '');

        // Basic validation using the typed frontmatter
        if (!frontmatter.title || !frontmatter.publishedAt || !frontmatter.tags || !frontmatter.author) {
          console.warn(`Skipping post ${filename}: Missing essential frontmatter (title, publishedAt, tags, author)`);
          return null;
        }

        // For now, assume all posts use the primaryAuthor
        // Later, enhance this to map frontmatter.author ID to a list of authors if needed
        const postAuthor = primaryAuthor;

        return {
          id: slug, // Use slug as ID for now
          slug,
          title: frontmatter.title, // Now frontmatter.title is string
          excerpt: frontmatter.excerpt || '', // frontmatter.excerpt is string | undefined
          // Simulate MDXRemoteSerializeResult - not needed for list view
          content: { compiledSource: '', scope: {}, frontmatter: {} },
          rawContent: rawContent,
          publishedAt: String(frontmatter.publishedAt), // Convert Date to string if necessary
          updatedAt: frontmatter.updatedAt ? String(frontmatter.updatedAt) : undefined,
          author: postAuthor, // Assign the determined author object
          // Ensure tags is an array of strings
          tags: Array.isArray(frontmatter.tags) ? frontmatter.tags.map(String) : [],
          coverImage: frontmatter.coverImage || undefined, // frontmatter.coverImage is string | undefined
        } as BlogPost;
      })
      .filter((post): post is BlogPost => post !== null)
      .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

    return posts;
  } catch (error) {
    console.error("Error reading blog posts directory:", error);
    return [];
  }
}

/**
 * Generates static paths for all unique tags.
 * @returns {Promise<{ tagSlug: string }[]>} An array of objects containing tag slugs.
 */
export async function generateStaticParams(): Promise<{ tagSlug: string }[]> {
  // Use Promise.resolve to satisfy require-await and await-thenable rules
  const posts = await Promise.resolve(getAllPosts());
  const tags = new Set<string>();
  for (const post of posts) {
    for (const tag of post.tags) {
      tags.add(kebabCase(tag));
    }
  }
  return Array.from(tags).map(tag => ({ tagSlug: tag }));
}

/**
 * Generates metadata for the tag page.
 * @param {object} params - The route parameters.
 * @param {string} params.tagSlug - The slug of the tag.
 * @returns {Promise<Metadata>} The metadata object for the page.
 */
export async function generateMetadata({ params }: { params: { tagSlug: string } }): Promise<Metadata> {
  // Use Promise.resolve to satisfy require-await rule
  const tagName = await Promise.resolve(deslugify(params.tagSlug));
  const title = `Posts tagged "${tagName}"`;
  const description = `Blog posts related to ${tagName} on ${metadata.site.name}.`;
  const url = `${metadata.site.url}/blog/tags/${params.tagSlug}`;

  return {
    title: title,
    description: description,
    alternates: {
      canonical: url,
    },
    openGraph: {
      title: title,
      description: description,
      url: url,
      siteName: metadata.site.name,
      type: 'website',
      locale: 'en_US',
      images: metadata.openGraph.images, // Use openGraph images
    },
    twitter: {
      card: 'summary_large_image',
      title: title,
      description: description,
      images: metadata.openGraph.images, // Use openGraph images for Twitter too
      creator: metadata.social.twitter, // Use correct path for Twitter handle
    },
  };
}

/**
 * Renders the page displaying blog posts filtered by a specific tag.
 * @param {object} params - The route parameters.
 * @param {string} params.tagSlug - The URL-friendly tag slug.
 * @returns {JSX.Element} The rendered page component.
 */
export default async function TagPage({ params }: { params: { tagSlug: string } }): Promise<JSX.Element> {
  const { tagSlug } = params;
  const allPosts = getAllPosts();

  const filteredPosts = allPosts.filter(post =>
    post.tags.map((tag: string) => kebabCase(tag)).includes(tagSlug)
  );

  // Wrap in Promise.resolve to satisfy linter's await-thenable rule
  const tagName = await Promise.resolve(deslugify(tagSlug));

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="mb-8 text-3xl font-bold leading-tight tracking-tighter text-primary md:text-5xl">
        <span className="capitalize">{tagName}</span> Posts
      </h1>
      {filteredPosts.length > 0 ? (
        <BlogList posts={filteredPosts} />
      ) : (
        <p>No posts found for this tag.</p>
      )}
    </div>
  );
}