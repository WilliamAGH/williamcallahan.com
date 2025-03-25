/**
 * Debug API Route for Blog Posts
 *
 * This endpoint provides detailed debugging information about the blog posts
 * and is only available in development mode.
 */

import { NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import path from 'node:path';
import { posts as staticPosts } from '@/data/blog/posts';
import { getAllMDXPosts } from '@/lib/blog/mdx';
import { authors } from '@/data/blog/authors';

// Only allow this endpoint in development
function checkIsDevelopment() {
  const isDev = process.env.NODE_ENV === 'development';
  if (!isDev) {
    throw new Error('This endpoint is only available in development mode');
  }
}

export async function GET() {
  try {
    checkIsDevelopment();

    // Get information about the posts directory
    const postsDir = path.join(process.cwd(), 'data/blog/posts');
    const dirContents = await fs.readdir(postsDir);
    const mdxFiles = dirContents.filter(file => file.endsWith('.mdx'));

    // Get all MDX posts with error handling
    let mdxPosts: Array<any> = [];
    let mdxErrors: any[] = [];
    try {
      mdxPosts = await getAllMDXPosts();
    } catch (error) {
      mdxPosts = [];
      mdxErrors.push({
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        cause: error instanceof Error ? error.cause : undefined
      });
    }

    // Check author validity
    const authorIssues: Record<string, string> = {};
    mdxFiles.forEach(async (filename) => {
      try {
        const fileContent = await fs.readFile(path.join(postsDir, filename), 'utf8');
        const authorMatch = fileContent.match(/author:\s*["']([^"']+)["']/);
        if (authorMatch && authorMatch[1]) {
          const authorId = authorMatch[1];
          if (!authors[authorId]) {
            authorIssues[filename] = `References non-existent author: ${authorId}`;
          }
        } else {
          authorIssues[filename] = 'No author found in frontmatter';
        }
      } catch (error) {
        authorIssues[filename] = `Error checking author: ${error instanceof Error ? error.message : String(error)}`;
      }
    });

    // Collect frontmatter issues
    const frontmatterIssues: Record<string, string[]> = {};
    mdxFiles.forEach(async (filename) => {
      try {
        const fileContent = await fs.readFile(path.join(postsDir, filename), 'utf8');
        const requiredFields = ['title', 'excerpt', 'author', 'slug', 'publishedAt'];
        const issues: string[] = [];

        for (const field of requiredFields) {
          const regex = new RegExp(`${field}:\\s*["']?([^"'\\n]*)["']?`);
          const match = fileContent.match(regex);
          if (!match || !match[1].trim()) {
            issues.push(`Missing required field: ${field}`);
          }
        }

        if (issues.length > 0) {
          frontmatterIssues[filename] = issues;
        }
      } catch (error) {
        frontmatterIssues[filename] = [
          `Error checking frontmatter: ${error instanceof Error ? error.message : String(error)}`
        ];
      }
    });

    return NextResponse.json({
      environment: {
        nodeEnv: process.env.NODE_ENV,
        postsDirectory: postsDir,
        exists: await fs.access(postsDir).then(() => true).catch(() => false)
      },
      files: {
        mdxCount: mdxFiles.length,
        mdxFiles
      },
      posts: {
        staticCount: staticPosts ? staticPosts.length : 0,
        mdxCount: mdxPosts.length,
        total: (staticPosts ? staticPosts.length : 0) + mdxPosts.length,
        validSlugs: [...mdxPosts, ...(staticPosts || [])].map(post => post.slug),
        duplicateSlugs: findDuplicateSlugs([...mdxPosts, ...(staticPosts || [])])
      },
      authors: {
        definedCount: Object.keys(authors).length,
        definedAuthors: Object.keys(authors),
        issues: authorIssues
      },
      frontmatter: {
        issues: frontmatterIssues
      },
      errors: {
        mdxErrors
      }
    });
  } catch (error) {
    console.error('[Debug Posts API] Error:', error);

    return NextResponse.json({
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    }, {
      status: error instanceof Error && error.message.includes('only available in development')
        ? 403
        : 500
    });
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
  slugs.forEach(slug => {
    counts[slug] = (counts[slug] || 0) + 1;
  });

  return Object.entries(counts)
    .filter(([_, count]) => count > 1)
    .map(([slug]) => slug);
}
