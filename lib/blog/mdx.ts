/**
 * MDX Processing Utilities
 *
 * Handles reading, parsing, and serializing MDX blog posts with frontmatter.
 * Provides functionality to:
 * - Read MDX files from the posts directory
 * - Parse frontmatter metadata
 * - Serialize MDX content with syntax highlighting
 *
 * @note Plugin Compatibility Workaround
 * This file uses `// @ts-nocheck` to suppress TypeScript errors caused by
 * version mismatches in the unified ecosystem between:
 * - next-mdx-remote@4.4.1
 * - @mdx-js/mdx@^3.1.0
 * - remark-gfm@^3.0.1
 * - rehype-prism@^2.3.3
 * - rehype-slug@^6.0.0
 * - rehype-autolink-headings@^7.1.0
 *
 * The plugins work correctly at runtime despite TypeScript type mismatches
 * from nested unified/vfile version dependencies. The `@ts-nocheck` directive
 * is necessary because the type incompatibilities are too deep in the unified
 * ecosystem to resolve with targeted `@ts-ignore` comments.
 *
 * If you encounter "Plugin<...> is not assignable to type 'Pluggable<any[]>'"
 * errors when updating these packages, ensure the versions listed above are
 * compatible and maintain the `@ts-nocheck` directive.
 */

assertServerOnly(); // Ensure this module runs only on the server

import { assertServerOnly } from "../utils/ensure-server-only";
import { formatSeoDate } from "../seo/utils"; // Import the Pacific Time formatter
import type { FrontmatterData } from "@/types/features/blog";

import fs from "node:fs/promises";
import path from "node:path";
import rehypePrism from "@mapbox/rehype-prism";
import matter from "gray-matter";
import type { MDXRemoteSerializeResult } from "next-mdx-remote";
import { serialize } from "next-mdx-remote/serialize";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypeSlug from "rehype-slug";
import remarkGfm from "remark-gfm";
import { authors } from "../../data/blog/authors";
import type { BlogPost } from "../../types/blog";

/** Directory containing MDX blog posts */
const POSTS_DIRECTORY = path.join(process.cwd(), "data/blog/posts");

import { unstable_cacheLife as cacheLife, unstable_cacheTag as cacheTag, revalidateTag } from "next/cache";
import { USE_NEXTJS_CACHE, withCacheFallback } from "@/lib/cache";

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
 * Automatically maps local blog post images to S3 CDN URLs if available.
 * @param coverImageValue - The value from frontmatter.
 * @param contextSlug - The slug of the post for logging purposes.
 * @param contextFilePath - The file path of the post for logging purposes.
 * @returns Sanitized cover image string (S3 CDN URL if available) or undefined.
 */
async function sanitizeCoverImage(
  coverImageValue: unknown,
  contextSlug: string,
  contextFilePath: string,
): Promise<string | undefined> {
  if (!coverImageValue) {
    return undefined;
  }
  if (typeof coverImageValue === "string" && coverImageValue.trim() !== "") {
    const trimmedValue = coverImageValue.trim();
    
    // Check if it's a local blog post image path
    // eslint-disable-next-line s3/no-hardcoded-images -- This is a path prefix check, not a hardcoded image
    if (trimmedValue.startsWith("/images/posts/")) {
      // Extract filename without path
      const filename = trimmedValue.split("/").pop();
      if (filename) {
        // Remove extension to create base name for S3 lookup
        const baseName = filename.replace(/\.[^.]+$/, "");
        
        try {
          // Import S3 utilities dynamically to avoid circular dependencies
          const { listS3Objects } = await import("@/lib/s3-utils");
          const { buildCdnUrl, getCdnConfigFromEnv } = await import("@/lib/utils/cdn-utils");
          
          // List all objects in the blog posts S3 directory
          const s3Keys = await listS3Objects("images/other/blog-posts/");
          
          // Find matching S3 key (starts with baseName and underscore for hash)
          const matchingKey = s3Keys.find(key => {
            const s3Filename = key.split("/").pop();
            return s3Filename?.startsWith(`${baseName}_`);
          });
          
          if (matchingKey) {
            // Build and return CDN URL
            const cdnConfig = getCdnConfigFromEnv();
            const cdnUrl = buildCdnUrl(matchingKey, cdnConfig);
            console.log(`[sanitizeCoverImage] Mapped ${trimmedValue} to S3 CDN: ${cdnUrl}`);
            return cdnUrl;
          } else {
            console.log(`[sanitizeCoverImage] No S3 match found for ${trimmedValue}, using local path`);
          }
        } catch (error) {
          console.warn(`[sanitizeCoverImage] Error mapping to S3 for ${trimmedValue}:`, error);
        }
      }
    }
    
    return trimmedValue;
  }
  console.warn(
    `[sanitizeCoverImage] Invalid coverImage frontmatter for slug "${contextSlug}" (file: ${contextFilePath}): Not a non-empty string. Received:`,
    coverImageValue,
  );
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
  fileContentOverride?: string,
): Promise<BlogPost | null> {
  try {
    let fileContents: string;
    let stats: import("fs").Stats;

    if (fileContentOverride) {
      fileContents = fileContentOverride;
      // Need stats for lastModified, even with content override
      try {
        stats = await fs.stat(filePathForPost);
      } catch {
        console.warn(`[getMDXPost] Could not stat file ${filePathForPost} even with content override`);
        stats = {
          mtime: new Date(0),
          birthtime: new Date(0),
          birthtimeMs: 0,
          mtimeMs: 0,
          // Include all properties that are accessed later in the code
        } as unknown as import("fs").Stats;
      }
    } else {
      // Stat once; failure means the file is missing or unreadable
      try {
        stats = await fs.stat(filePathForPost);
      } catch {
        console.warn(
          `[getMDXPost] Blog post file not found or unreadable at path ${filePathForPost} (slug: ${frontmatterSlug})`,
        );
        return null;
      }
      fileContents = await fs.readFile(filePathForPost, "utf8");
    }

    // Parse frontmatter
    const parsed = matter(fileContents);
    const frontmatter = parsed.data as FrontmatterData;
    const content = parsed.content;

    // Validate frontmatter slug consistency
    const normalizedParam = frontmatterSlug.trim();
    if (
      !frontmatter.slug ||
      typeof frontmatter.slug !== "string" ||
      frontmatter.slug.trim() === "" ||
      frontmatter.slug.trim() !== normalizedParam
    ) {
      console.warn(
        `[getMDXPost] Mismatch or invalid slug in frontmatter for file ${filePathForPost}. Expected "${normalizedParam}", got "${frontmatter.slug}". Skipping.`,
      );
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
      modified: stats.mtime.toISOString(),
    };

    /**
     * Serialize the MDX content with syntax highlighting and enhanced features.
     *
     * @note Plugin Type Casting Required
     * The rehype plugins are cast to `Pluggable` type to work around TypeScript
     * type mismatches between unified ecosystem versions. This is safe because:
     * - All plugins are compatible at runtime
     * - The type mismatch is only in the nested vfile/unified type definitions
     * - The `@ts-nocheck` directive at the top handles broader compatibility issues
     *
     * Plugins used:
     * - remarkGfm: GitHub Flavored Markdown support (tables, strikethrough, etc.)
     * - rehypePrism: Syntax highlighting for code blocks
     * - rehypeSlug: Auto-generates anchor IDs for headings
     * - rehypeAutolinkHeadings: Makes headings clickable with anchor links
     */
    let mdxSource: MDXRemoteSerializeResult<Record<string, unknown>, Record<string, unknown>>;
    try {
      mdxSource = await serialize(content, {
        mdxOptions: {
          remarkPlugins: [remarkGfm],
          rehypePlugins: [rehypePrism, rehypeSlug, rehypeAutolinkHeadings],
        },
        scope: {},
        parseFrontmatter: false,
      });
    } catch (mdxError) {
      console.error(`[getMDXPost] MDX compile error for slug "${frontmatterSlug}":`, mdxError);
      // Fallback minimal content to prevent crash
      mdxSource = await serialize("<p>Unable to render content due to MDX errors.</p>", {
        scope: {},
        parseFrontmatter: false,
      });
    }

    // Use frontmatter dates, ensuring they are Pacific Time ISO strings
    const publishedAt = toPacificISOString(frontmatter.publishedAt || fileDates.created);
    const updatedAt = toPacificISOString(frontmatter.updatedAt || frontmatter.modifiedAt || fileDates.modified);

    // Validate coverImage using helper (now async to support S3 lookup)
    const coverImage = await sanitizeCoverImage(frontmatter.coverImage, frontmatterSlug, filePathForPost);

    // Construct the full blog post object
    const post: BlogPost = {
      id: `mdx-${frontmatterSlug}`,
      title: frontmatter.title,
      slug: frontmatterSlug,
      excerpt: frontmatter.excerpt || "",
      content: mdxSource,
      rawContent: content,
      publishedAt,
      updatedAt,
      author,
      tags: frontmatter.tags || [],
      ...(frontmatter.readingTime !== undefined && { readingTime: frontmatter.readingTime }),
      coverImage,
      filePath: filePathForPost,
    };

    return post;
  } catch (e) {
    const error = e as Error; // Type assertion for error object
    console.error(
      `Error processing post from file ${filePathForPost} (slug: ${frontmatterSlug}):`,
      error.message,
      error.stack,
    );
    return null;
  }
}

// Internal direct read function for MDX posts (always available)
async function getMDXPostDirect(
  frontmatterSlug: string,
  filePathForPost: string,
  fileContentOverride?: string,
): Promise<BlogPost | null> {
  return getMDXPost(frontmatterSlug, filePathForPost, fileContentOverride);
}

// Cached version using 'use cache' directive
async function getCachedMDXPost(frontmatterSlug: string, filePathForPost: string): Promise<BlogPost | null> {
  "use cache";

  cacheLife("weeks"); // Blog posts are relatively static
  cacheTag("blog");
  cacheTag("mdx");
  cacheTag(`blog-post-${frontmatterSlug}`);

  return getMDXPostDirect(frontmatterSlug, filePathForPost);
}

// Updated export to use caching when enabled
export async function getMDXPostCached(
  frontmatterSlug: string,
  filePathForPost: string,
  fileContentOverride?: string,
): Promise<BlogPost | null> {
  // Don't use cache if content override is provided
  if (fileContentOverride) {
    return getMDXPostDirect(frontmatterSlug, filePathForPost, fileContentOverride);
  }

  // If caching is enabled, try to use it with fallback to direct
  if (USE_NEXTJS_CACHE) {
    return withCacheFallback(
      () => getCachedMDXPost(frontmatterSlug, filePathForPost),
      () => getMDXPostDirect(frontmatterSlug, filePathForPost),
    );
  }

  // Default: Always use direct read
  return getMDXPostDirect(frontmatterSlug, filePathForPost);
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
    const mdxFiles = files.filter((file) => file.endsWith(".mdx"));

    // Map filenames to promises that read/parse frontmatter and then fully process
    const postPromises = mdxFiles.map(async (fileName) => {
      const fullPath = path.join(POSTS_DIRECTORY, fileName);
      let frontmatterSlug: string | null = null;
      try {
        const fileContents = await fs.readFile(fullPath, "utf8");
        // Parse frontmatter just to get the slug
        const { data: frontmatter } = matter(fileContents) as unknown as {
          data: FrontmatterData;
          content: string;
        };

        if (!frontmatter.slug || typeof frontmatter.slug !== "string" || frontmatter.slug.trim() === "") {
          console.warn(`[getAllMDXPosts] MDX file ${fileName} has missing or invalid slug in frontmatter. Skipping.`);
          return null; // Skip this file
        }
        frontmatterSlug = frontmatter.slug.trim();

        // Now fully process the post using its frontmatter slug as the identifier,
        // and pass the fullPath and pre-read fileContents.
        return await getMDXPost(frontmatterSlug, fullPath, fileContents);
      } catch (fileError) {
        console.error(
          `[getAllMDXPosts] Error initially processing file ${fileName} (slug: ${frontmatterSlug ?? "unknown"}):`,
          fileError,
        );
        return null; // Ensure errors in this map return null
      }
    });

    // Wait for all processing attempts to settle
    const settledResults = await Promise.allSettled(postPromises);

    // Process settled results, ensuring uniqueness and filtering out failures/nulls
    for (const result of settledResults) {
      if (result.status === "fulfilled" && result.value) {
        const post = result.value;
        // Final duplicate check after all promises settled
        if (seenSlugs.has(post.slug)) {
          console.warn(
            `[getAllMDXPosts] Duplicate slug "${post.slug}" detected after processing (file: ${post.filePath}). Skipping subsequent instance.`,
          );
        } else {
          seenSlugs.add(post.slug);
          processedPosts.push(post);
        }
      } else if (result.status === "rejected") {
        // Log errors from promises that were rejected
        console.error("[getAllMDXPosts] A post processing promise was rejected:", result.reason);
      }
    }

    return processedPosts;
  } catch (error) {
    // Catch errors from fs.readdir itself
    console.error("Error reading posts directory:", error);
    return [];
  }
}

// Internal direct read function for all MDX posts (always available)
async function getAllMDXPostsDirect(): Promise<BlogPost[]> {
  return getAllMDXPosts();
}

// Cached version using 'use cache' directive
async function getCachedAllMDXPosts(): Promise<BlogPost[]> {
  "use cache";

  cacheLife("weeks"); // Blog posts are relatively static
  cacheTag("blog");
  cacheTag("mdx");
  cacheTag("blog-posts-all");

  return getAllMDXPostsDirect();
}

// Updated export to use caching when enabled
export async function getAllMDXPostsCached(): Promise<BlogPost[]> {
  // If caching is enabled, try to use it with fallback to direct
  if (USE_NEXTJS_CACHE) {
    return withCacheFallback(
      () => getCachedAllMDXPosts(),
      () => getAllMDXPostsDirect(),
    );
  }

  // Default: Always use direct read
  return getAllMDXPostsDirect();
}

/**
 * Lightweight version of getAllMDXPosts that excludes rawContent for search operations.
 * This significantly reduces memory usage during search.
 *
 * @returns {Promise<BlogPost[]>} Array of blog posts without rawContent
 */
export async function getAllMDXPostsForSearch(): Promise<BlogPost[]> {
  const posts = await getAllMDXPosts();
  // Return posts without rawContent to save memory
  return posts.map((post) => {
    // Destructure to exclude rawContent - intentionally unused to save memory
    const { rawContent, ...lightweightPost } = post;
    void rawContent; // Explicitly mark as intentionally unused
    return lightweightPost as BlogPost;
  });
}

// Cache invalidation functions for blog/MDX
export function invalidateBlogCache(): void {
  if (USE_NEXTJS_CACHE) {
    // Invalidate all blog cache tags
    revalidateTag("blog");
    revalidateTag("mdx");
    revalidateTag("blog-posts-all");
    console.log("[Blog] Cache invalidated for all blog posts");
  }
}

// Invalidate specific blog post cache
export function invalidateBlogPostCache(slug: string): void {
  if (USE_NEXTJS_CACHE) {
    revalidateTag(`blog-post-${slug}`);
    console.log(`[Blog] Cache invalidated for post: ${slug}`);
  }
}
