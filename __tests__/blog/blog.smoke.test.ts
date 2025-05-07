import { describe, test, expect, beforeAll } from 'bun:test';
import fs from 'node:fs/promises';
import path from 'node:path';
import matter from 'gray-matter';
import { getMDXPost } from '../../lib/blog/mdx'; // Adjust path if necessary based on actual location

const POSTS_DIRECTORY = path.join(process.cwd(), 'data/blog/posts');

interface BlogFrontmatter {
  slug: string;
  // Add other expected frontmatter properties here if needed
}

describe('Blog MDX Smoke Tests', () => {
  let mdxFiles: string[] = [];

  beforeAll(async () => {
    try {
      const files = await fs.readdir(POSTS_DIRECTORY);
      mdxFiles = files.filter(file => file.endsWith('.mdx'));
    } catch (error) {
      console.error('Failed to read blog posts directory:', POSTS_DIRECTORY, error);
      throw error; // Fail the setup
    }
    if (mdxFiles.length === 0) {
      console.warn(`No .mdx files found in ${POSTS_DIRECTORY}. Skipping file tests.`);
    }
  });

  mdxFiles.forEach(fileName => {
    const fullPath = path.join(POSTS_DIRECTORY, fileName);

    test(`should correctly process MDX file: ${fileName}`, async () => {
      let fileContents;
      try {
        fileContents = await fs.readFile(fullPath, 'utf8');
      } catch (readError) {
        console.error(`Failed to read file ${fileName}:`, readError);
        expect(readError).toBeNull(); // Fail test if file can't be read
        return;
      }

      const { data: frontmatter } = matter(fileContents) as unknown as { data: BlogFrontmatter };

      expect(frontmatter.slug).toBeString();
      expect(frontmatter.slug.trim()).not.toBe('');
      if (!frontmatter.slug || typeof frontmatter.slug !== 'string' || frontmatter.slug.trim() === '') {
        // This expectation primarily serves to make the test fail if slug is bad,
        // as getMDXPost might also catch it but this is an earlier check.
        throw new Error(`Missing or invalid slug in frontmatter for ${fileName}`);
      }
      const frontmatterSlug = frontmatter.slug.trim();

      const post = await getMDXPost(frontmatterSlug, fullPath, fileContents);

      // getMDXPost returns null on error and logs specifics internally
      if (!post) {
        // To make the test output clearer about *which* post failed at the getMDXPost stage
        console.error(`getMDXPost returned null for ${fileName} (slug: ${frontmatterSlug}), indicating a processing error. Check logs above for details from getMDXPost.`);
      }
      expect(post).not.toBeNull();
      if (post) {
        expect(post.title).toBeString(); // Basic check for successful processing
        expect(post.content).toBeDefined(); // Check that MDX content was serialized
      }
    });
  });
});