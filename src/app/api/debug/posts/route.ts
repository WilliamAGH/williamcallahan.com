import type { AuthorIssue, ErrorDetail, FrontmatterIssue, MDXPost } from "@/types/debug";
import fs from "node:fs/promises";
import matter from "gray-matter";
import { authors } from "@/data/blog/authors";
import { BLOG_POSTS_DIRECTORY } from "@/lib/blog/validation";
import { getAllMDXPosts } from "@/lib/blog/mdx";
import { preventCaching, NO_STORE_HEADERS } from "@/lib/utils/api-utils";
import { blogFrontmatterSchema } from "@/types/schemas/blog-frontmatter";
import { NextResponse, type NextRequest } from "next/server";

const isProductionBuild = process.env.NEXT_PHASE === "phase-production-build";

async function inspectMdxFile(
  fileName: string,
  authorIssues: AuthorIssue,
  frontmatterIssues: FrontmatterIssue,
): Promise<void> {
  try {
    const source = await fs.readFile(`${BLOG_POSTS_DIRECTORY}/${fileName}`, "utf8");
    const frontmatter = blogFrontmatterSchema.safeParse(matter(source).data);
    if (!frontmatter.success) {
      frontmatterIssues[fileName] = frontmatter.error.issues.map((issue) => issue.message);
      return;
    }

    if (!authors[frontmatter.data.author]) {
      authorIssues[fileName] = `References non-existent author: ${frontmatter.data.author}`;
    }
  } catch (error) {
    frontmatterIssues[fileName] = [
      `Error checking frontmatter: ${error instanceof Error ? error.message : String(error)}`,
    ];
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (isProductionBuild) {
    return NextResponse.json(
      { message: "Debug diagnostics disabled during build phase", buildPhase: true },
      { status: 200, headers: NO_STORE_HEADERS },
    );
  }

  preventCaching();
  try {
    const authHeader = request.headers.get("authorization");
    const debugSecret = process.env.DEBUG_API_SECRET;
    if (!debugSecret || authHeader !== `Bearer ${debugSecret}`) {
      return NextResponse.json(
        { message: "Unauthorized" },
        { status: 401, headers: NO_STORE_HEADERS },
      );
    }

    if (process.env.NODE_ENV !== "development") {
      return NextResponse.json(
        { message: "Debug information is only available in development mode" },
        { status: 403, headers: NO_STORE_HEADERS },
      );
    }

    let directoryExists = false;
    let mdxFiles: string[] = [];
    try {
      const directoryEntries = await fs.readdir(BLOG_POSTS_DIRECTORY);
      mdxFiles = directoryEntries.filter((fileName) => fileName.endsWith(".mdx"));
      directoryExists = true;
    } catch (error) {
      console.warn("[Debug Posts API] Posts directory is unavailable:", error);
    }

    const mdxErrors: ErrorDetail[] = [];
    let mdxPosts: MDXPost[] = [];
    try {
      mdxPosts = await getAllMDXPosts();
    } catch (error) {
      mdxErrors.push({
        message: error instanceof Error ? error.message : String(error),
        stack: undefined,
        cause: undefined,
      });
    }

    const authorIssues: AuthorIssue = {};
    const frontmatterIssues: FrontmatterIssue = {};
    await Promise.all(
      mdxFiles.map((fileName) => inspectMdxFile(fileName, authorIssues, frontmatterIssues)),
    );

    return NextResponse.json({
      environment: { nodeEnv: process.env.NODE_ENV, postsDirectoryExists: directoryExists },
      files: { mdxCount: mdxFiles.length, hasMdxFiles: mdxFiles.length > 0 },
      posts: {
        mdxCount: mdxPosts.length,
        total: mdxPosts.length,
        validSlugs: mdxPosts.map((post) => post.slug),
        duplicateSlugs: findDuplicateSlugs(mdxPosts),
      },
      authors: {
        definedCount: Object.keys(authors).length,
        definedAuthors: Object.keys(authors),
        issues: authorIssues,
      },
      frontmatter: { issues: frontmatterIssues },
      errors: { mdxErrors },
    });
  } catch (error) {
    console.error("[Debug Posts API] Error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : String(error),
        stack: undefined,
      },
      {
        status:
          error instanceof Error && error.message.includes("only available in development")
            ? 403
            : 500,
      },
    );
  }
}

function findDuplicateSlugs(posts: readonly MDXPost[]): string[] {
  const counts = new Map<string, number>();
  for (const { slug } of posts) {
    const currentCount = counts.get(slug);
    counts.set(slug, currentCount === undefined ? 1 : currentCount + 1);
  }

  return Array.from(counts)
    .filter(([, count]) => count > 1)
    .map(([slug]) => slug);
}
