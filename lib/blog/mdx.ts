/**
 * MDX Processing Utilities
 *
 * Handles reading, parsing, and serializing MDX blog posts with frontmatter.
 * Uses the centralized date/time functions from lib/dateTime.ts to ensure
 * consistent date handling across the application.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import matter from 'gray-matter';
import { serialize } from 'next-mdx-remote/serialize';
import rehypePrism from 'rehype-prism';
import remarkGfm from 'remark-gfm';
import type { MDXRemoteProps } from 'next-mdx-remote';
type MDXComponents = MDXRemoteProps['components'];
import { authors } from '../../data/blog/authors';
import type { BlogPost } from '../../types/blog';
import { ServerMDXCodeBlock } from '../../components/ui/mdx-code-block';
import { toISO } from '../../lib/dateTime';

/** Directory containing MDX blog posts */
const POSTS_DIRECTORY = path.join(process.cwd(), 'data/blog/posts');

/**
 * MDX components map for server-side rendering
 * These components are used during serialization
 */
const serverComponents: MDXComponents = {
  pre: ServerMDXCodeBlock,
};

/**
 * Gets file creation and modification dates in Pacific timezone
 */
async function getFileDates(filePath: string): Promise<{ created: string; modified: string }> {
  const stats = await fs.stat(filePath);
  return {
    created: toISO(stats.birthtime),
    modified: toISO(stats.mtime)
  };
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
    const fileContents = await fs.readFile(fullPath, 'utf8');

    // Parse frontmatter
    const { data, content } = matter(fileContents);

    // Look up author data
    const authorId = data.author as string;
    const author = authors[authorId];
    if (!author) {
      console.error(`Author not found: ${authorId}`);
      return null;
    }

    // Get file dates as fallback
    const fileDates = await getFileDates(fullPath);

    // Serialize the content with options for proper MDX features
    const mdxSource = await serialize(content, {
      mdxOptions: {
        remarkPlugins: [
          [remarkGfm, { singleTilde: false, breaks: true }]
        ],
        rehypePlugins: [
          [rehypePrism, {
            ignoreMissing: true,
            aliases: {
              bash: ['shell', 'sh', 'zsh']
            }
          }]
        ],
        format: 'mdx'
      },
      scope: {},
      parseFrontmatter: true,
      // @ts-expect-error - next-mdx-remote types are not up to date
      components: serverComponents
    });

    // Process and validate frontmatter dates
    const processDate = (date: string | undefined, fallback: string): string => {
      if (!date) return fallback;

      try {
        // For YYYY-MM-DD format, ensure it's valid and in Pacific timezone
        if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
          const [year, month, day] = date.split('-').map(Number);
          // Validate date components
          if (
            year >= 2000 && year <= 2100 &&
            month >= 1 && month <= 12 &&
            day >= 1 && day <= 31
          ) {
            // Return as-is for schema compatibility
            return date;
          }
        }

        // For other formats, convert to ISO with Pacific timezone
        return toISO(date);
      } catch (error) {
        console.error(`Invalid date format in post ${slug}:`, date);
        return fallback;
      }
    };

    const publishedAt = processDate(data.publishedAt, fileDates.created);
    const updatedAt = processDate(data.updatedAt || data.modifiedAt, fileDates.modified);

    // Construct the full blog post object
    return {
      id: `mdx-${slug}`,
      title: data.title,
      slug: data.slug,
      excerpt: data.excerpt,
      content: mdxSource,
      publishedAt,
      updatedAt,
      author,
      tags: data.tags,
      readingTime: data.readingTime,
      coverImage: data.coverImage
    };
  } catch (error) {
    console.error(`Error loading post ${slug}:`, error);
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
    const posts = await Promise.all(
      files
        .filter(file => file.endsWith('.mdx'))
        .map(async file => {
          const slug = file.replace(/\.mdx$/, '');
          const post = await getMDXPost(slug);
          return post;
        })
    );

    return posts.filter((post: BlogPost | null): post is BlogPost => post !== null);
  } catch (error) {
    console.error('Error loading posts:', error);
    return [];
  }
}
