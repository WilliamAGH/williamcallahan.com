import { assertServerOnly } from '../utils/ensure-server-only';
import { formatSeoDate } from '../seo/utils'; // Import the Pacific Time formatter

assertServerOnly('lib/blog/mdx.ts'); // Ensure this module runs only on the server

/**
 * MDX Processing Utilities
 *
 * Handles reading, parsing, and serializing MDX blog posts with frontmatter.
 * Provides functionality to:
 * - Read MDX files from the posts directory
 * - Parse frontmatter metadata
 * - Serialize MDX content with syntax highlighting
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import matter from 'gray-matter';
import { serialize } from 'next-mdx-remote/serialize';
import remarkGfm from 'remark-gfm';
import rehypePrismPlus from 'rehype-prism-plus'; // Import the plugin
import type { MDXRemoteProps } from 'next-mdx-remote';
type MDXComponents = MDXRemoteProps['components'];
import { authors } from '../../data/blog/authors';
import type { BlogPost } from '../../types/blog';
import { ServerMDXCodeBlock } from '../../components/ui/code-block/mdx-code-block.server';

/** Directory containing MDX blog posts */
const POSTS_DIRECTORY = path.join(process.cwd(), 'data/blog/posts');

// Cache for processed MDX posts
const postCache = new Map<string, { post: BlogPost | null; lastModified: string }>();

/**
 * MDX components map for server-side rendering
 * These components are used during serialization
 */
const serverComponents: MDXComponents = {
  pre: ServerMDXCodeBlock,
};

/**
 * Converts a date string or Date object to a Pacific Time ISO string
 * Uses the formatSeoDate utility to handle PT/DST correctly.
 * If no date is provided, uses the current time.
 */
function toPacificISOString(date: string | Date | undefined): string {
  return formatSeoDate(date);
}

/**
 * Retrieves and processes a single MDX blog post
 *
 * @param {string} slug - The URL slug of the post to retrieve
 * @returns {Promise<BlogPost | null>} The processed blog post or null if not found
 */
export async function getMDXPost(slug: string): Promise<BlogPost | null> {
  try {
    const fullPath = path.join(POSTS_DIRECTORY, `${slug}.mdx`);

    // Check if the file exists before trying to read it
    try {
      await fs.access(fullPath);
    } catch (error) {
      // File doesn't exist, log with appropriate level and return null
      console.warn(`Blog post not found: ${slug} at path ${fullPath}`);
      return null;
    }

    // Get file stats for cache validation and dates
    const stats = await fs.stat(fullPath);
    const lastModified = stats.mtime.toISOString();

    // Check cache
    const cached = postCache.get(slug);
    if (cached && cached.lastModified === lastModified) {
      return cached.post;
    }

    const fileContents = await fs.readFile(fullPath, 'utf8');

    // Parse frontmatter
    const { data, content } = matter(fileContents);

    // Look up author data
    const authorId = data.author as string;
    const author = authors[authorId];
    if (!author) {
      console.error(`Author not found: ${authorId} in post ${slug}`);
      return null;
    }

    // Get file dates as fallback
    const fileDates = {
      created: stats.birthtime.toISOString(),
      modified: stats.mtime.toISOString()
    };

    // Serialize the content with options for proper MDX features
    const mdxSource = await serialize(content, {
      mdxOptions: {
        remarkPlugins: [
          [remarkGfm, { singleTilde: false, breaks: true }]
        ],
        rehypePlugins: [
          [rehypePrismPlus, { ignoreMissing: true }] as any // Use 'as any' to bypass type check
        ],
        format: 'mdx'
      },
      scope: {},
      parseFrontmatter: true,
    });

    // Use frontmatter dates, ensuring they are Pacific Time ISO strings
    const publishedAt = toPacificISOString(data.publishedAt || fileDates.created);
    const updatedAt = toPacificISOString(data.updatedAt || data.modifiedAt || fileDates.modified);

    // Construct the full blog post object
    const post = {
      id: `mdx-${slug}`,
      title: data.title,
      slug: data.slug,
      excerpt: data.excerpt,
      content: mdxSource,
      publishedAt,
      updatedAt,
      author,
      tags: data.tags,
      ...(data.readingTime !== undefined && { readingTime: data.readingTime }),
      coverImage: data.coverImage
    };

    // Update cache
    postCache.set(slug, { post, lastModified });

    return post;
  } catch (error) {
    console.error(`Error processing post ${slug}:`, error);
    return null;
  }
}

/**
 * Retrieves and processes all MDX blog posts
 *
 * @returns {Promise<BlogPost[]>} Array of all processed blog posts
 */
export async function getAllMDXPosts(): Promise<BlogPost[]> {
  try {
    const files = await fs.readdir(POSTS_DIRECTORY);
    const mdxFiles = files.filter(file => file.endsWith('.mdx'));

    // Process all files in parallel
    const posts = await Promise.all(
      mdxFiles.map(async (file) => {
        const slug = file.replace(/\.mdx$/, '');
        return await getMDXPost(slug);
      })
    );

    return posts.filter((post): post is BlogPost => post !== null);
  } catch (error) {
    console.error('Error loading posts:', error);
    return [];
  }
}
