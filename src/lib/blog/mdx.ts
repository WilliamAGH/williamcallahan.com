import fs from "node:fs/promises";
import path from "node:path";
import { getPlaiceholder } from "plaiceholder";
import rehypePrism from "@mapbox/rehype-prism";
import type { MDXRemoteSerializeResult } from "next-mdx-remote";
import { serialize } from "next-mdx-remote/serialize";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypeSlug from "rehype-slug";
import remarkGfm from "remark-gfm";
import { authors } from "@/data/blog/authors";
import { BLOG_POSTS_DIRECTORY, isValidBlogSlug, parseBlogMdxDocument } from "@/lib/blog/validation";
import { cacheContextGuards, USE_NEXTJS_CACHE, withCacheFallback } from "@/lib/cache";
import { getBlogPostImageCdnUrl } from "@/lib/utils/cdn-utils";
import type { BlogPost } from "@/types/blog";
import { formatSeoDate } from "../seo/utils";
import { assertServerOnly } from "../utils/ensure-server-only";

assertServerOnly();

const PUBLIC_DIRECTORY = path.join(process.cwd(), "public");
const legacyParagraphWrapperTags = ["BackgroundInfo", "CollapseDropdown"];

function normalizeCodeExpressionBlocks(content: string): string {
  return content.replaceAll(/<code([^>]*)>\{`([\s\S]*?)`}<\/code>/g, (_match, attributes, code) => {
    const serializedLines = code
      .split("\n")
      .map((line) => JSON.stringify(line))
      .join(", ");
    return `<code${attributes}>{[${serializedLines}].join("\\n")}</code>`;
  });
}

function normalizeParagraphWrappers(content: string): string {
  return legacyParagraphWrapperTags.reduce((normalizedContent, tagName) => {
    const pattern = new RegExp(`<${tagName}(\\b[^>]*)>([\\s\\S]*?)</${tagName}>`, "g");
    return normalizedContent.replaceAll(pattern, (_match, attributes, innerContent) => {
      const normalizedInnerContent = innerContent
        .replaceAll(/<p(\s[^>]*)?>/g, "<div$1>")
        .replaceAll("</p>", "</div>");
      return `<${tagName}${attributes ?? ""}>${normalizedInnerContent}</${tagName}>`;
    });
  }, content);
}

function normalizeBlogMdxContent(content: string): string {
  return normalizeParagraphWrappers(normalizeCodeExpressionBlocks(content))
    .replaceAll(/```cmd\b/g, "```batch")
    .replaceAll(/```dos\b/g, "```batch")
    .replaceAll(/```ps\b/g, "```powershell")
    .replaceAll(/```ps1\b/g, "```powershell");
}

async function serializeBlogMdxContent(
  content: string,
): Promise<MDXRemoteSerializeResult<Record<string, unknown>, Record<string, unknown>>> {
  return serialize(normalizeBlogMdxContent(content), {
    mdxOptions: {
      remarkPlugins: [remarkGfm],
      rehypePlugins: [rehypePrism, rehypeSlug, rehypeAutolinkHeadings],
    },
    scope: {},
    parseFrontmatter: false,
  });
}

async function generateBlurDataURL(localImagePath: string): Promise<string | undefined> {
  if (!localImagePath.startsWith("/images/posts/")) return undefined;

  const normalizedPath = path.normalize(path.join(PUBLIC_DIRECTORY, localImagePath));
  if (!normalizedPath.startsWith(PUBLIC_DIRECTORY)) {
    console.warn(`[blog] Blocked invalid cover image path: ${localImagePath}`);
    return undefined;
  }

  try {
    const imageBuffer = await fs.readFile(normalizedPath);
    const { base64 } = await getPlaiceholder(imageBuffer, { size: 10 });
    return base64;
  } catch (error) {
    console.warn(`[blog] Failed to generate blur data for ${localImagePath}:`, error);
    throw error;
  }
}

function sanitizeCoverImage(coverImage: string | undefined): string | undefined {
  if (coverImage === undefined || !coverImage.startsWith("/images/posts/")) return coverImage;

  try {
    const cdnUrl = getBlogPostImageCdnUrl(coverImage);
    if (cdnUrl !== undefined) return cdnUrl;
    console.warn(`[blog] Missing cover image manifest entry for ${coverImage}.`);
  } catch (error) {
    console.warn(`[blog] Failed to resolve cover image ${coverImage}:`, error);
  }

  return coverImage;
}

async function createMdxPost(
  document: NonNullable<ReturnType<typeof parseBlogMdxDocument>>,
  filePath: string,
  skipHeavyProcessing: boolean,
): Promise<BlogPost | null> {
  const { content, frontmatter } = document;
  const author = authors[frontmatter.author];
  if (!author) {
    console.error(`[blog] Unknown author "${frontmatter.author}" in ${filePath}.`);
    return null;
  }

  const mdxSource = skipHeavyProcessing
    ? { compiledSource: "", scope: {}, frontmatter: {} }
    : await serializeBlogMdxContent(content);
  const coverImageBlurDataURL =
    frontmatter.coverImage === undefined || skipHeavyProcessing
      ? undefined
      : await generateBlurDataURL(frontmatter.coverImage);

  return {
    id: `mdx-${frontmatter.slug}`,
    title: frontmatter.title,
    slug: frontmatter.slug,
    excerpt: frontmatter.excerpt,
    content: mdxSource,
    rawContent: content,
    publishedAt: formatSeoDate(frontmatter.publishedAt),
    ...(frontmatter.updatedAt !== undefined && { updatedAt: formatSeoDate(frontmatter.updatedAt) }),
    author,
    tags: frontmatter.tags,
    ...(frontmatter.readingTime !== undefined && { readingTime: frontmatter.readingTime }),
    coverImage: sanitizeCoverImage(frontmatter.coverImage),
    ...(coverImageBlurDataURL !== undefined && { coverImageBlurDataURL }),
    filePath,
    ...(frontmatter.draft === true && { draft: true }),
  };
}

export async function getMDXPost(
  frontmatterSlug: string,
  filePath: string,
  fileContentOverride?: string,
  skipHeavyProcessing = false,
): Promise<BlogPost | null> {
  try {
    const source =
      fileContentOverride !== undefined ? fileContentOverride : await fs.readFile(filePath, "utf8");
    const document = parseBlogMdxDocument(source);
    if (!document) {
      console.warn(`[blog] Invalid frontmatter in ${filePath}.`);
      return null;
    }

    if (!isValidBlogSlug(frontmatterSlug) || document.frontmatter.slug !== frontmatterSlug) {
      console.warn(`[blog] Frontmatter slug mismatch in ${filePath}.`);
      return null;
    }

    const post = await createMdxPost(document, filePath, skipHeavyProcessing);
    return post;
  } catch (error) {
    console.error(`[blog] Failed to process ${filePath} for slug "${frontmatterSlug}":`, error);
    throw error;
  }
}

async function getCachedMDXPost(
  frontmatterSlug: string,
  filePath: string,
  skipHeavyProcessing = false,
): Promise<BlogPost | null> {
  "use cache";
  cacheContextGuards.cacheLife("BlogMDX", "hours");
  cacheContextGuards.cacheTag("BlogMDX", "blog-mdx", `blog-post-${frontmatterSlug}`);
  return getMDXPost(frontmatterSlug, filePath, undefined, skipHeavyProcessing);
}

export async function getMDXPostCached(
  frontmatterSlug: string,
  filePath: string,
  fileContentOverride?: string,
  skipHeavyProcessing = false,
): Promise<BlogPost | null> {
  if (fileContentOverride !== undefined) {
    return getMDXPost(frontmatterSlug, filePath, fileContentOverride, skipHeavyProcessing);
  }

  if (!USE_NEXTJS_CACHE)
    return getMDXPost(frontmatterSlug, filePath, undefined, skipHeavyProcessing);

  return withCacheFallback(
    () => getCachedMDXPost(frontmatterSlug, filePath, skipHeavyProcessing),
    () => getMDXPost(frontmatterSlug, filePath, undefined, skipHeavyProcessing),
  );
}

export async function getAllMDXPosts(skipHeavyProcessing = false): Promise<BlogPost[]> {
  try {
    const directoryEntries = await fs.readdir(BLOG_POSTS_DIRECTORY);
    const fileNames = directoryEntries.filter((file) => file.endsWith(".mdx"));
    const posts = await Promise.all(
      fileNames.map(async (fileName) => {
        const filePath = path.join(BLOG_POSTS_DIRECTORY, fileName);
        try {
          const document = parseBlogMdxDocument(await fs.readFile(filePath, "utf8"));
          if (!document) {
            console.warn(`[blog] Invalid frontmatter in ${fileName}; skipping.`);
            return null;
          }
          return createMdxPost(document, filePath, skipHeavyProcessing);
        } catch (error) {
          console.error(`[blog] Failed to load ${fileName}:`, error);
          throw error;
        }
      }),
    );

    const seenSlugs = new Set<string>();
    return posts.flatMap((post) => {
      if (!post) return [];
      if (seenSlugs.has(post.slug)) {
        console.warn(`[blog] Duplicate frontmatter slug "${post.slug}" in ${post.filePath}.`);
        return [];
      }
      seenSlugs.add(post.slug);
      return [post];
    });
  } catch (error) {
    console.error("[blog] Failed to load blog posts:", error);
    throw error;
  }
}

async function getCachedAllMDXPosts(skipHeavyProcessing = false): Promise<BlogPost[]> {
  "use cache";
  cacheContextGuards.cacheLife("BlogMDX", "hours");
  cacheContextGuards.cacheTag("BlogMDX", "blog", "mdx", "blog-posts-all");
  return getAllMDXPosts(skipHeavyProcessing);
}

export async function getAllMDXPostsCached(skipHeavyProcessing = false): Promise<BlogPost[]> {
  if (!USE_NEXTJS_CACHE) return getAllMDXPosts(skipHeavyProcessing);
  return withCacheFallback(
    () => getCachedAllMDXPosts(skipHeavyProcessing),
    () => getAllMDXPosts(skipHeavyProcessing),
  );
}

export async function getAllMDXPostsForSearch(): Promise<BlogPost[]> {
  const posts = await getAllMDXPosts();
  return posts.map(({ rawContent: _rawContent, ...post }) => post);
}

export function invalidateBlogCache(): void {
  if (!USE_NEXTJS_CACHE) return;
  cacheContextGuards.revalidateTag("BlogMDX", "blog", "mdx", "blog-posts-all", "blog-mdx");
  console.log("[Blog] Cache invalidated for all blog posts");
}

export function invalidateBlogPostCache(slug: string): void {
  if (!USE_NEXTJS_CACHE) return;
  cacheContextGuards.revalidateTag("BlogMDX", `blog-post-${slug}`);
  console.log(`[Blog] Cache invalidated for post: ${slug}`);
}
