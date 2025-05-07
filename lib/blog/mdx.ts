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
import rehypePrismPlus from 'rehype-prism-plus';
import rehypeSlug from 'rehype-slug';
import rehypeAutolinkHeadings from 'rehype-autolink-headings';
import type { MDXRemoteProps } from 'next-mdx-remote';
// Removed unused type imports: Plugin, Root
import { authors } from '../../data/blog/authors';
import type { BlogPost } from '../../types/blog';
import { ServerMDXCodeBlock } from '../../components/ui/code-block/mdx-code-block.server';

/** Directory containing MDX blog posts */
const POSTS_DIRECTORY = path.join(process.cwd(), 'data/blog/posts');

// Cache for processed MDX posts
const postCache = new Map<string, { post: BlogPost | null; lastModified: string }>();

// Removed type alias: RehypePlugin
// serverComponents was unused

/**
 * Converts a date string or Date object to a Pacific Time ISO string
 * Uses the formatSeoDate utility to handle PT/DST correctly.
 * If no date is provided, uses the current time.
 */
function toPacificISOString(date: string | Date | undefined): string {
  return formatSeoDate(date);
}

/**
 * Validates and sanitizes the coverImage value from frontmatter.
 * @param coverImageValue - The value from frontmatter.
 * @param contextSlug - The slug of the post for logging purposes.
 * @param contextFilePath - The file path of the post for logging purposes.
 * @returns Sanitized cover image string or undefined.
 */
function sanitizeCoverImage(
  coverImageValue: unknown,
  contextSlug: string,
  contextFilePath: string
): string | undefined {
  if (!coverImageValue) {
    return undefined;
  }
  if (typeof coverImageValue === 'string' && coverImageValue.trim() !== '') {
    return coverImageValue.trim();
  }
  console.warn(`[sanitizeCoverImage] Invalid coverImage frontmatter for slug "${contextSlug}" (file: ${contextFilePath}): Not a non-empty string. Received:`, coverImageValue);
  return undefined;
}


/**
 * Retrieves and processes a single MDX blog post.
 * Prioritizes frontmatter slug for identification and caching.
 *
 * @param {string} frontmatterSlug - The slug from frontmatter, used as the primary key.
 * @param {string} filePathForPost - The full path to the .mdx file.
 * @param {string} [fileContentOverride] - Optional. Pre-read content of the file. If not provided, reads from filePathForPost.
 * @returns {Promise<BlogPost | null>} The processed blog post or null if not found/error.
 */
export async function getMDXPost(
  frontmatterSlug: string, // Renamed from identifier
  filePathForPost: string,
  fileContentOverride?: string
): Promise<BlogPost | null> {
  const cacheKey = frontmatterSlug; // Use the frontmatter slug for caching

  try {
    let fileContents: string;
    let stats: import('fs').Stats;

    if (fileContentOverride) {
      fileContents = fileContentOverride;
      // Need stats for lastModified, even with content override
      try {
        stats = await fs.stat(filePathForPost);
      } catch (_statError) { // Parameter is unused
         console.warn(`[getMDXPost] Could not stat file ${filePathForPost} even with content override:`, _statError);
         stats = { mtime: new Date(0) } as import('fs').Stats;
      }
    } else {
      // Stat once; failure means the file is missing or unreadable
      try {
        stats = await fs.stat(filePathForPost);
      } catch (statError) {
        console.warn(`[getMDXPost] Blog post file not found or unreadable at path ${filePathForPost} (slug: ${frontmatterSlug})`);
        return null;
      }
      fileContents = await fs.readFile(filePathForPost, 'utf8');
    }

    const lastModified = stats.mtime.toISOString();

    // Check cache using the identifier (frontmatter slug)
    const cached = postCache.get(cacheKey);
    if (cached && cached.lastModified === lastModified && !fileContentOverride) {
      return cached.post;
    }

    // Parse frontmatter
    const { data: frontmatter, content } = matter(fileContents) as unknown as { data: FrontmatterData; content: string };

    // Validate frontmatter slug consistency
    if (!frontmatter.slug || typeof frontmatter.slug !== 'string' || frontmatter.slug.trim() === '' || frontmatter.slug.trim() !== frontmatterSlug) {
      console.warn(`[getMDXPost] Mismatch or invalid slug in frontmatter for file ${filePathForPost}. Expected "${frontmatterSlug}", got "${frontmatter.slug}". Skipping.`);
      return null;
    }

    // Look up author data
    const authorId = frontmatter.author;
    const author = authors[authorId];
    if (!author) {
      console.error(`Author not found: ${authorId} in post with slug "${frontmatterSlug}" (file: ${filePathForPost})`);
      return null;
    }

    // Get file dates as fallback
    const fileDates = {
      created: stats.birthtimeMs ? stats.birthtime.toISOString() : stats.mtime.toISOString(),
      modified: stats.mtime.toISOString()
    };

    // Serialize the content with options for proper MDX features
    const mdxSource = await serialize(content, {
      mdxOptions: {
        remarkPlugins: [
          [remarkGfm, { singleTilde: false, breaks: true }]
        ],
        rehypePlugins: [
          rehypeSlug as any, // Using 'as any' for these due to complex plugin type signatures
          [rehypeAutolinkHeadings, {
            properties: {
              className: ['anchor'],
              ariaLabel: 'Link to section'
            },
            behavior: 'append'
          }] as any,
          [rehypePrismPlus, { ignoreMissing: true }] as any
        ],
        format: 'mdx'
      },
      scope: {},
      // Front-matter was already parsed by `gray-matter`
      parseFrontmatter: false,
    });

    // Use frontmatter dates, ensuring they are Pacific Time ISO strings
    const publishedAt = toPacificISOString(frontmatter.publishedAt || fileDates.created);
    const updatedAt = toPacificISOString(frontmatter.updatedAt || frontmatter.modifiedAt || fileDates.modified);

    // Validate coverImage using helper
    const coverImage = sanitizeCoverImage(frontmatter.coverImage, frontmatterSlug, filePathForPost);

    // Construct the full blog post object
    const post: BlogPost = {
      id: `mdx-${frontmatterSlug}`,
      title: frontmatter.title,
      slug: frontmatterSlug,
      excerpt: frontmatter.excerpt || '',
      content: mdxSource,
      rawContent: content,
      publishedAt,
      updatedAt,
      author,
      tags: frontmatter.tags || [],
      ...(frontmatter.readingTime !== undefined && { readingTime: frontmatter.readingTime }),
      coverImage,
      filePath: filePathForPost
    };

    // Update cache using the frontmatter slug as key
    postCache.set(cacheKey, { post, lastModified });

    return post;
  } catch (e) {
    const error = e as Error; // Type assertion for error object
    console.error(`Error processing post from file ${filePathForPost} (slug: ${frontmatterSlug}):`, error.message, error.stack);
    return null;
  }
}

interface FrontmatterData {
  slug: string;
  title: string;
  author: string;
  publishedAt?: string | Date;
  updatedAt?: string | Date;
  modifiedAt?: string | Date; // Alias for updatedAt
  excerpt?: string;
  tags?: string[];
  readingTime?: number;
  coverImage?: unknown; // Keep as unknown for sanitizeCoverImage to handle
}

/**
 * Retrieves and processes all MDX blog posts concurrently.
 * Uses frontmatter slug as the canonical identifier.
 *
 * @returns {Promise<BlogPost[]>} Array of all processed blog posts
 */
export async function getAllMDXPosts(): Promise<BlogPost[]> {
  const processedPosts: BlogPost[] = [];
  const seenSlugs = new Set<string>();

  try {
    const files = await fs.readdir(POSTS_DIRECTORY);
    const mdxFiles = files.filter(file => file.endsWith('.mdx'));

    // Map filenames to promises that read/parse frontmatter and then fully process
    const postPromises = mdxFiles.map(async (fileName) => {
      const fullPath = path.join(POSTS_DIRECTORY, fileName);
      let frontmatterSlug: string | null = null;
      try {
        const fileContents = await fs.readFile(fullPath, 'utf8');
        // Parse frontmatter just to get the slug
        const { data: frontmatter } = matter(fileContents) as unknown as { data: FrontmatterData; content: string };

        if (!frontmatter.slug || typeof frontmatter.slug !== 'string' || frontmatter.slug.trim() === '') {
          console.warn(`[getAllMDXPosts] MDX file ${fileName} has missing or invalid slug in frontmatter. Skipping.`);
          return null; // Skip this file
        }
        frontmatterSlug = frontmatter.slug.trim();

        // Now fully process the post using its frontmatter slug as the identifier,
        // and pass the fullPath and pre-read fileContents.
        return await getMDXPost(frontmatterSlug, fullPath, fileContents);

      } catch (fileError) {
        console.error(`[getAllMDXPosts] Error initially processing file ${fileName} (slug: ${frontmatterSlug ?? 'unknown'}):`, fileError);
        return null; // Ensure errors in this map return null
      }
    });

    // Wait for all processing attempts to settle
    const settledResults = await Promise.allSettled(postPromises);

    // Process settled results, ensuring uniqueness and filtering out failures/nulls
    for (const result of settledResults) {
      if (result.status === 'fulfilled' && result.value) {
        const post = result.value;
        // Final duplicate check after all promises settled
        if (seenSlugs.has(post.slug)) {
           console.warn(`[getAllMDXPosts] Duplicate slug "${post.slug}" detected after processing (file: ${post.filePath}). Skipping subsequent instance.`);
        } else {
          seenSlugs.add(post.slug);
          processedPosts.push(post);
        }
      } else if (result.status === 'rejected') {
        // Log errors from promises that were rejected
        console.error('[getAllMDXPosts] A post processing promise was rejected:', result.reason);
      }
    }

    return processedPosts;
  } catch (error) {
    // Catch errors from fs.readdir itself
    console.error('Error reading posts directory:', error);
    return [];
  }
}
