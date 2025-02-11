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
import rehypePrism from 'rehype-prism';
import remarkGfm from 'remark-gfm';
import type { MDXRemoteProps } from 'next-mdx-remote';
type MDXComponents = MDXRemoteProps['components'];
import { authors } from '../../data/blog/authors';
import type { BlogPost } from '../../types/blog';
import { ServerMDXCodeBlock } from '../../components/ui/mdx-code-block';

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
 * Converts a date string or Date object to ISO string with time
 * If the input is just a date (YYYY-MM-DD), adds midnight time
 */
function toISOString(date: string | Date | undefined): string {
  if (!date) return new Date().toISOString();

  const parsed = typeof date === 'string'
    ? new Date(date + (date.includes('T') ? '' : 'T00:00:00.000Z'))
    : date;

  return parsed.toISOString();
}

/**
 * Gets file creation and modification dates
 */
async function getFileDates(filePath: string): Promise<{ created: string; modified: string }> {
  const stats = await fs.stat(filePath);
  return {
    created: stats.birthtime.toISOString(),
    modified: stats.mtime.toISOString()
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

    // Use frontmatter dates or fall back to file dates
    const publishedAt = toISOString(data.publishedAt || fileDates.created);
    const updatedAt = toISOString(data.updatedAt || data.modifiedAt || fileDates.modified);

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
