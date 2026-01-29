/**
 * Smoke-tests the blog MDX pipeline – verifies every post parses via
 * `getMDXPost`, has a valid slug, and that the posts directory is non-empty.
 * Network calls are mocked (`listS3Objects`) so it runs offline; suite timeout
 * set to 60 s for slow machines.
 */

// Suite-specific timeout for slow environments
jest.setTimeout(60_000);

// Mock the S3 directory listing to avoid network latency/timeouts
jest.mock("@/lib/s3-utils", () => ({
  __esModule: true,
  ...jest.requireActual("@/lib/s3-utils"),
  listS3Objects: jest.fn().mockResolvedValue([]),
}));

import type { BlogFrontmatter } from "@/types/test";
import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
// IMPORTANT: Use the real serializer. Keep ESM rehype/remark plugins mocked by config.
jest.unmock("next-mdx-remote/serialize");
jest.unmock("next-mdx-remote");

import { getMDXPost } from "../../src/lib/blog/mdx";

const POSTS_DIRECTORY = path.join(process.cwd(), "data/blog/posts");

describe("Blog MDX Smoke Tests", () => {
  let mdxFiles: string[] = [];

  beforeAll(async () => {
    try {
      const files = await fs.readdir(POSTS_DIRECTORY);
      mdxFiles = files.filter((file) => file.endsWith(".mdx"));
      console.log(`Found ${mdxFiles.length} MDX files in ${POSTS_DIRECTORY}`);
    } catch (error) {
      console.error("Failed to read blog posts directory:", POSTS_DIRECTORY, error);
      throw error; // Fail the setup
    }

    if (mdxFiles.length === 0) {
      console.warn(`No .mdx files found in ${POSTS_DIRECTORY}. Skipping file tests.`);
    }
  });

  it("blog post directory exists and contains MDX files", () => {
    expect(mdxFiles.length).toBeGreaterThan(0);
  });

  it("all blog posts have valid frontmatter", async () => {
    await Promise.all(
      mdxFiles.map(async (fileName) => {
        const fullPath = path.join(POSTS_DIRECTORY, fileName);
        let fileContents: string;

        try {
          fileContents = await fs.readFile(fullPath, "utf8");
        } catch (readError) {
          console.error(`Failed to read file ${fileName}:`, readError);
          expect(readError).toBeNull(); // Fail test if file can't be read
          return;
        }

        const { data: frontmatter } = matter(fileContents) as unknown as { data: BlogFrontmatter };

        expect(frontmatter.slug).toEqual(expect.any(String));
        expect(frontmatter.slug.trim()).not.toBe("");
      }),
    );
  });

  it("all blog posts can be processed by getMDXPost", async () => {
    await Promise.all(
      mdxFiles.map(async (fileName) => {
        const fullPath = path.join(POSTS_DIRECTORY, fileName);
        const fileContents = await fs.readFile(fullPath, "utf8");
        const { data: frontmatter } = matter(fileContents) as unknown as { data: BlogFrontmatter };
        const frontmatterSlug = frontmatter.slug.trim();

        const post = await getMDXPost(frontmatterSlug, fullPath, fileContents);

        // Check that the post was processed correctly
        expect(post).not.toBeNull();
        if (post) {
          expect(post.title).toEqual(expect.any(String));
          expect(post.title.length).toBeGreaterThan(0);
          expect(post.content).toBeDefined();
          // Verify other critical properties as needed
          expect(post.slug).toBe(frontmatterSlug);

          // Guardrail: ensure we did not hit the MDX fallback renderer
          // Fallback string is produced when MDX compilation fails in lib/blog/mdx.ts
          const FALLBACK_MDX_MARKER = "Unable to render content due to MDX errors.";
          const compiled = JSON.stringify(post.content);
          expect(compiled).not.toContain(FALLBACK_MDX_MARKER);
        }
      }),
    );
  });
});
