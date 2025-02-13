/**
 * MDX Processing Utilities
 *
 * Handles reading, parsing, and serializing MDX blog posts with frontmatter.
 * Uses the centralized date/time functions from lib/dateTime.ts to ensure
 * consistent date handling across the application.
 */

import fs from 'fs/promises';
import path from 'path';
import matter from 'gray-matter';
import { serialize } from 'next-mdx-remote/serialize';
import rehypePrism from 'rehype-prism';
import remarkGfm from 'remark-gfm';
import type { MDXRemoteProps } from 'next-mdx-remote';
type MDXComponents = MDXRemoteProps['components'];
import { authors } from '../../data/blog/authors';
import type { BlogPost } from '../../types/blog';
import { ServerMDXCodeBlock } from '../../components/ui/mdxCodeBlock';
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

    // Process SVG imports in MDX content
    const processedContent = content.replace(
      /import\s+(\w+)\s+from\s+['"]([^'"]+\.svg)['"]/g,
      (match, importName, path) => {
        // Convert to dynamic import for proper SVG handling
        return `import dynamic from 'next/dynamic';\nconst ${importName} = dynamic(() => import('${path}'), { ssr: true });`;
      }
    );

    // Serialize the content with enhanced options
    const mdxSource = await serialize(processedContent, {
      mdxOptions: {
        remarkPlugins: [remarkGfm],
        rehypePlugins: [rehypePrism],
        format: 'mdx',
      },
      scope: {
        process: { env: { NODE_ENV: process.env.NODE_ENV } }
      },
      parseFrontmatter: true,
      // @ts-expect-error - next-mdx-remote types are not up to date
      components: serverComponents
    });

    // Process and validate frontmatter dates
    const processDate = (date: string | undefined, fallback: string): string => {
      if (!date) return fallback;

      try {
        // For YYYY-MM-DD format, return as-is
        if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
          return date;
        }

        // For ISO format with timezone, return as-is
        if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/.test(date)) {
          return date;
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
      slug: data.slug || slug,
      excerpt: data.excerpt,
      content: mdxSource,
      publishedAt,
      updatedAt,
      author,
      tags: data.tags || [],
      readingTime: data.readingTime || 0,
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
          return getMDXPost(slug);
        })
    );

    // Filter out null posts and sort by date
    return posts
      .filter((post): post is BlogPost => post !== null)
      .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
  } catch (error) {
    console.error('Error loading posts:', error);
    return [];
  }
}
