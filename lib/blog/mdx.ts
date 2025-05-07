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
import rehypeSlug from 'rehype-slug'; // Add this import
import rehypeAutolinkHeadings from 'rehype-autolink-headings'; // Add this import
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
 * Retrieves and processes a single MDX blog post.
 * Prioritizes frontmatter slug for identification and caching.
 *
 * @param {string} identifier - The slug from frontmatter, used as the primary key.
 * @param {string} filePathForPost - The full path to the .mdx file.
 * @param {string} [fileContentOverride] - Optional. Pre-read content of the file. If not provided, reads from filePathForPost.
 * @returns {Promise<BlogPost | null>} The processed blog post or null if not found/error.
 */
export async function getMDXPost(
  identifier: string, // This should be the frontmatter slug
  filePathForPost: string,
  fileContentOverride?: string
): Promise<BlogPost | null> {
  const cacheKey = identifier; // Use the frontmatter slug for caching

  try {
    let fileContents: string;
    let stats: import('fs').Stats;

    if (fileContentOverride) {
      fileContents = fileContentOverride;
      // Need stats for lastModified, even with content override
      stats = await fs.stat(filePathForPost);
    } else {
      // Check if the file exists before trying to read it
      try {
        await fs.access(filePathForPost);
      } catch (error) {
        console.warn(`Blog post file not found at path ${filePathForPost} (identifier: ${identifier})`);
        return null;
      }
      stats = await fs.stat(filePathForPost);
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

    // Validate frontmatter slug consistency (identifier should be data.slug)
    if (!data.slug || typeof data.slug !== 'string' || data.slug.trim() === '') {
      console.warn(`[getMDXPost] Missing or invalid slug in frontmatter for file ${filePathForPost}. Expected "${identifier}". Skipping.`);
      return null;
    }
    const frontmatterSlug = data.slug.trim();
    if (frontmatterSlug !== identifier) {
      console.warn(`[getMDXPost] Frontmatter slug "${frontmatterSlug}" in file ${filePathForPost} does not match the identifier "${identifier}" used for processing. This might indicate an issue in getAllMDXPosts. Using frontmatter slug "${frontmatterSlug}" for the post object, but cache key remains "${identifier}".`);
      // This case should ideally be prevented by getAllMDXPosts logic
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
      // birthtime might not be available on all systems/filesystems
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
          rehypeSlug as any,
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
      parseFrontmatter: true,
    });

    // Use frontmatter dates, ensuring they are Pacific Time ISO strings
    const publishedAt = toPacificISOString(data.publishedAt || fileDates.created);
    const updatedAt = toPacificISOString(data.updatedAt || data.modifiedAt || fileDates.modified);

    // Validate coverImage
    let coverImage: string | undefined = undefined;
    if (data.coverImage && typeof data.coverImage === 'string' && data.coverImage.trim() !== '') {
      coverImage = data.coverImage.trim();
    } else if (data.coverImage) {
      console.warn(`[getMDXPost] Invalid coverImage frontmatter for slug "${frontmatterSlug}" (file: ${filePathForPost}): Not a non-empty string. Received:`, data.coverImage);
    }

    // Construct the full blog post object
    const post: BlogPost = { // Explicitly type here for clarity
      id: `mdx-${frontmatterSlug}`, // Use frontmatter slug for ID
      title: data.title,
      slug: frontmatterSlug, // Ensure this is the one from frontmatter
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

    // Update cache using the frontmatter slug (identifier) as key
    postCache.set(cacheKey, { post, lastModified });

    return post;
  } catch (error) {
    console.error(`Error processing post from file ${filePathForPost} (identifier: ${identifier}):`, error);
    return null;
  }
}

/**
 * Retrieves and processes all MDX blog posts.
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

    for (const fileName of mdxFiles) {
      const fullPath = path.join(POSTS_DIRECTORY, fileName);
      try {
        const fileContents = await fs.readFile(fullPath, 'utf8');
        // Parse frontmatter just to get the slug
        const { data } = matter(fileContents);

        if (!data.slug || typeof data.slug !== 'string' || data.slug.trim() === '') {
          console.warn(`[getAllMDXPosts] MDX file ${fileName} has missing or invalid slug in frontmatter. Skipping.`);
          continue;
        }
        const frontmatterSlug = data.slug.trim();

        if (seenSlugs.has(frontmatterSlug)) {
          console.warn(`[getAllMDXPosts] Duplicate slug "${frontmatterSlug}" found in MDX frontmatter (file: ${fileName}). Skipping subsequent instance to avoid conflicts.`);
          continue;
        }
        seenSlugs.add(frontmatterSlug);

        // Now fully process the post using its frontmatter slug as the identifier,
        // and pass the fullPath and pre-read fileContents.
        const post = await getMDXPost(frontmatterSlug, fullPath, fileContents);
        if (post) {
          processedPosts.push(post);
        }
      } catch (fileError) {
        console.error(`[getAllMDXPosts] Error processing file ${fileName}:`, fileError);
        // Continue to next file
      }
    }

    return processedPosts;
  } catch (error) {
    console.error('Error loading MDX posts:', error);
    return [];
  }
}
