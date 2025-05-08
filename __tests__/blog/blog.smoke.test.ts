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
      console.log(`Found ${mdxFiles.length} MDX files in ${POSTS_DIRECTORY}`);
    } catch (error) {
      console.error('Failed to read blog posts directory:', POSTS_DIRECTORY, error);
      throw error; // Fail the setup
    }

    if (mdxFiles.length === 0) {
      console.warn(`No .mdx files found in ${POSTS_DIRECTORY}. Skipping file tests.`);
    }
  });

  test('blog post directory exists and contains MDX files', () => {
    expect(mdxFiles.length).toBeGreaterThan(0);
  });

  test('all blog posts have valid frontmatter', async () => {
    for (const fileName of mdxFiles) {
      const fullPath = path.join(POSTS_DIRECTORY, fileName);
      let fileContents: string;

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
    }
  });

  test('all blog posts can be processed by getMDXPost', async () => {
    for (const fileName of mdxFiles) {
      const fullPath = path.join(POSTS_DIRECTORY, fileName);
      const fileContents = await fs.readFile(fullPath, 'utf8');
      const { data: frontmatter } = matter(fileContents) as unknown as { data: BlogFrontmatter };
      const frontmatterSlug = frontmatter.slug.trim();

      const post = await getMDXPost(frontmatterSlug, fullPath, fileContents);

      // Check that the post was processed correctly
      expect(post).not.toBeNull();
      if (post) {
        expect(post.title).toBeString();
        expect(post.title.length).toBeGreaterThan(0);
        expect(post.content).toBeDefined();
        // Verify other critical properties as needed
        expect(post.slug).toBe(frontmatterSlug);
      }
    }
  });
});
