import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import {
  type BlogFrontmatter,
  blogFrontmatterSchema,
  blogSlugSchema,
} from "@/types/schemas/blog-frontmatter";

export const BLOG_POSTS_DIRECTORY = path.join(process.cwd(), "data/blog/posts");

let blogPostFilePathIndexPromise: Promise<Map<string, string>> | null = null;

/** Reject path-like and high-cardinality values before blog lookup or route caching. */
export function isValidBlogSlug(slug: string): boolean {
  return blogSlugSchema.safeParse(slug).success;
}

export function parseBlogMdxDocument(
  source: string,
): { content: string; frontmatter: BlogFrontmatter } | null {
  const parsed = matter(source);
  const frontmatter = blogFrontmatterSchema.safeParse(parsed.data);
  if (!frontmatter.success) return null;
  return { content: parsed.content, frontmatter: frontmatter.data };
}

async function getBlogPostFilePathIndex(): Promise<Map<string, string>> {
  if (blogPostFilePathIndexPromise) return blogPostFilePathIndexPromise;

  blogPostFilePathIndexPromise = (async () => {
    const pathsBySlug = new Map<string, string>();
    const files = await fs.readdir(BLOG_POSTS_DIRECTORY);

    for (const fileName of files) {
      if (!fileName.endsWith(".mdx")) continue;

      const filePath = path.join(BLOG_POSTS_DIRECTORY, fileName);
      try {
        const document = parseBlogMdxDocument(await fs.readFile(filePath, "utf8"));
        if (!document) {
          console.warn(`[blog] Invalid frontmatter in ${fileName}; skipping slug index entry.`);
          continue;
        }

        if (pathsBySlug.has(document.frontmatter.slug)) {
          console.warn(
            `[blog] Duplicate frontmatter slug "${document.frontmatter.slug}" in ${fileName}.`,
          );
          continue;
        }

        pathsBySlug.set(document.frontmatter.slug, filePath);
      } catch (error) {
        console.error(`[blog] Failed to index ${fileName}:`, error);
      }
    }

    return pathsBySlug;
  })().catch((error) => {
    blogPostFilePathIndexPromise = null;
    throw error;
  });

  return blogPostFilePathIndexPromise;
}

export async function findBlogPostFilePath(slug: string): Promise<string | undefined> {
  if (!isValidBlogSlug(slug)) return undefined;
  const pathsBySlug = await getBlogPostFilePathIndex();
  return pathsBySlug.get(slug);
}

export function clearBlogPostFilePathIndex(): void {
  blogPostFilePathIndexPromise = null;
}
