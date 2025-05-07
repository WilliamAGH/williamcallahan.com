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

/**
 * MDX components map for server-side rendering
 * These components are used during serialization
 */
const serverComponents: MDXRemoteProps['components'] = { // Correctly using imported type
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
      } catch (statError) {
         console.warn(`[getMDXPost] Could not stat file ${filePathForPost} even with content override:`, statError);
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
    const { data, content } = matter(fileContents);

    // Validate frontmatter slug consistency
    if (!data.slug || typeof data.slug !== 'string' || data.slug.trim() === '' || data.slug.trim() !== frontmatterSlug) {
      console.warn(`[getMDXPost] Mismatch or invalid slug in frontmatter for file ${filePathForPost}. Expected "${frontmatterSlug}", got "${data.slug}". Skipping.`);
      return null;
    }

    // Look up author data
    const authorId = data.author as string;
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
          rehypeSlug as any, // Add back 'as any'
          [rehypeAutolinkHeadings, { // Add back 'as any'
            properties: {
              className: ['anchor'],
              ariaLabel: 'Link to section'
            },
            behavior: 'append'
          }] as any,
          [rehypePrismPlus, { ignoreMissing: true }] as any // Add back 'as any'
        ],
        format: 'mdx'
      },
      scope: {},
      // Front-matter was already parsed by `gray-matter`
      parseFrontmatter: false,
    });

    // Use frontmatter dates, ensuring they are Pacific Time ISO strings
    const publishedAt = toPacificISOString(data.publishedAt || fileDates.created);
    const updatedAt = toPacificISOString(data.updatedAt || data.modifiedAt || fileDates.modified);

    // Validate coverImage using helper
    const coverImage = sanitizeCoverImage(data.coverImage, frontmatterSlug, filePathForPost);

    // Construct the full blog post object
    const post: BlogPost = {
      id: `mdx-${frontmatterSlug}`,
      title: data.title,
      slug: frontmatterSlug,
      excerpt: data.excerpt,
      content: mdxSource,
      rawContent: content,
      publishedAt,
      updatedAt,
      author,
      tags: data.tags,
      ...(data.readingTime !== undefined && { readingTime: data.readingTime }),
      coverImage,
      filePath: filePathForPost
    };

    // Update cache using the frontmatter slug as key
    postCache.set(cacheKey, { post, lastModified });

    return post;
  } catch (error) {
    console.error(`Error processing post from file ${filePathForPost} (slug: ${frontmatterSlug}):`, error);
    return null;
  }
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
        const { data } = matter(fileContents);

        if (!data.slug || typeof data.slug !== 'string' || data.slug.trim() === '') {
          console.warn(`[getAllMDXPosts] MDX file ${fileName} has missing or invalid slug in frontmatter. Skipping.`);
          return null; // Skip this file
        }
        frontmatterSlug = data.slug.trim();

        // Now fully process the post using its frontmatter slug as the identifier,
        // and pass the fullPath and pre-read fileContents.
        return await getMDXPost(frontmatterSlug!, fullPath, fileContents);

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
