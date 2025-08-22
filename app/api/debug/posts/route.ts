/**
 * Debug API Route for Blog Posts
 *
 * This endpoint provides detailed debugging information about the blog posts
 * and is only available in development mode.
 */

import type { MDXPost, AuthorIssue, FrontmatterIssue, ErrorInfo } from "@/types/debug";
import fs from "node:fs/promises";
import path from "node:path";
import { authors } from "@/data/blog/authors";
import { posts as staticPosts } from "@/data/blog/posts";
import { getAllMDXPosts } from "@/lib/blog/mdx";
import { NextResponse, type NextRequest } from "next/server";

// Only allow this endpoint in development
// Commented out as unused but kept for reference
// function checkIsDevelopment() {
//   const isDev = process.env.NODE_ENV === 'development';
//   if (!isDev) {
//     throw new Error('This endpoint is only available in development mode');
//   }
// }

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    // SECURITY: Require authentication for debug endpoints
    const authHeader = request.headers.get("authorization");
    const debugSecret = process.env.DEBUG_API_SECRET;

    if (!debugSecret || authHeader !== `Bearer ${debugSecret}`) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    // In production, return a simple "not available" message instead of throwing an error
    if (process.env.NODE_ENV !== "development") {
      return NextResponse.json({ message: "Debug information is only available in development mode" }, { status: 403 });
    }

    // Get information about the posts directory - BUT DON'T EXPOSE PATHS
    const postsDir = path.join(process.cwd(), "data/blog/posts");

    // Safely check if directory exists first
    let dirExists = false;
    try {
      await fs.access(postsDir);
      dirExists = true;
    } catch {
      // Directory doesn't exist
      console.warn(`Posts directory not found at ${postsDir}`);
    }

    // Only try to read directory if it exists
    let dirContents: string[] = [];
    let mdxFiles: string[] = [];

    if (dirExists) {
      dirContents = await fs.readdir(postsDir);
      mdxFiles = dirContents.filter(file => file.endsWith(".mdx"));
    }

    // Get all MDX posts with error handling
    let mdxPosts: MDXPost[] = [];
    const mdxErrors: ErrorInfo[] = [];
    try {
      mdxPosts = (await getAllMDXPosts()) as MDXPost[];
    } catch (error) {
      mdxPosts = [];
      mdxErrors.push({
        message: error instanceof Error ? error.message : String(error),
        // SECURITY: Don't expose stack traces to prevent information leakage
        stack: undefined,
        cause: undefined,
      });
    }

    // Check author validity - fix misused promises by using Promise.all
    const authorIssues: AuthorIssue = {};
    const authorPromises = mdxFiles.map(async filename => {
      try {
        const fileContent = await fs.readFile(path.join(postsDir, filename), "utf8");
        const authorMatch = fileContent.match(/author:\s*["']([^"']+)["']/);
        if (authorMatch?.[1]) {
          const authorId = authorMatch[1];
          if (!authors[authorId]) {
            authorIssues[filename] = `References non-existent author: ${authorId}`;
          }
        } else {
          authorIssues[filename] = "No author found in frontmatter";
        }
      } catch (error) {
        authorIssues[filename] = `Error checking author: ${error instanceof Error ? error.message : String(error)}`;
      }
    });

    await Promise.all(authorPromises);

    // Collect frontmatter issues - fix misused promises by using Promise.all
    const frontmatterIssues: FrontmatterIssue = {};
    const frontmatterPromises = mdxFiles.map(async filename => {
      try {
        const fileContent = await fs.readFile(path.join(postsDir, filename), "utf8");
        const requiredFields = ["title", "excerpt", "author", "slug", "publishedAt"];
        const issues: string[] = [];

        for (const field of requiredFields) {
          const regex = new RegExp(`${field}:\\s*["']?([^"'\\n]*)["']?`);
          const match = fileContent.match(regex);
          if (!match || !match[1] || !match[1].trim()) {
            issues.push(`Missing required field: ${field}`);
          }
        }

        if (issues.length > 0) {
          frontmatterIssues[filename] = issues;
        }
      } catch (error) {
        frontmatterIssues[filename] = [
          `Error checking frontmatter: ${error instanceof Error ? error.message : String(error)}`,
        ];
      }
    });

    await Promise.all(frontmatterPromises);

    // Create a type-safe version of the posts array
    const combinedPosts: { slug: string }[] = [
      ...mdxPosts,
      ...(staticPosts ? staticPosts.map(post => ({ slug: post.slug })) : []),
    ];

    return NextResponse.json({
      environment: {
        nodeEnv: process.env.NODE_ENV,
        // SECURITY: Don't expose file system paths
        postsDirectoryExists: dirExists,
      },
      files: {
        mdxCount: mdxFiles.length,
        // SECURITY: Don't expose actual filenames - just counts
        hasMdxFiles: mdxFiles.length > 0,
      },
      posts: {
        staticCount: staticPosts ? staticPosts.length : 0,
        mdxCount: mdxPosts.length,
        total: (staticPosts ? staticPosts.length : 0) + mdxPosts.length,
        validSlugs: combinedPosts.map(post => post.slug),
        duplicateSlugs: findDuplicateSlugs(combinedPosts),
      },
      authors: {
        definedCount: Object.keys(authors).length,
        definedAuthors: Object.keys(authors),
        issues: authorIssues,
      },
      frontmatter: {
        issues: frontmatterIssues,
      },
      errors: {
        mdxErrors,
      },
    });
  } catch (error) {
    console.error("[Debug Posts API] Error:", error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : String(error),
        // SECURITY: Don't expose stack traces in API responses
        stack: undefined,
      },
      {
        status: error instanceof Error && error.message.includes("only available in development") ? 403 : 500,
      },
    );
  }
}

// Helper function to find duplicate slugs
function findDuplicateSlugs(posts: { slug: string }[]): string[] {
  const slugs = posts.map(post => post.slug);
  const uniqueSlugs = new Set(slugs);

  if (slugs.length === uniqueSlugs.size) {
    return [];
  }

  // Find duplicates
  const counts: Record<string, number> = {};
  for (const slug of slugs) {
    counts[slug] = (counts[slug] || 0) + 1;
  }

  return Object.entries(counts)
    .filter(([, count]) => count > 1)
    .map(([slug]) => slug);
}
