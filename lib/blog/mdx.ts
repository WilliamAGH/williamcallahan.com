/**
 * MDX Processing Utilities
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import matter from 'gray-matter';
import type { BlogPost } from '@/types/blog';

const POSTS_DIRECTORY = path.join(process.cwd(), 'data/blog/posts');

export async function getMDXPost(slug: string): Promise<BlogPost | null> {
  try {
    const fullPath = path.join(POSTS_DIRECTORY, `${slug}.mdx`);
    const fileContents = await fs.readFile(fullPath, 'utf8');
    const { data, content } = matter(fileContents);

    return {
      ...data,
      content,
      slug
    } as BlogPost;
  } catch (error) {
    console.error(`Error loading post ${slug}:`, error);
    return null;
  }
}

export async function getAllMDXPosts(): Promise<BlogPost[]> {
  try {
    const files = await fs.readdir(POSTS_DIRECTORY);
    const posts = await Promise.all(
      files
        .filter(file => file.endsWith('.mdx'))
        .map(async file => {
          const slug = file.replace(/\.mdx$/, '');
          const post = await getMDXPost(slug);
          return post;
        })
    );

    return posts.filter((post): post is BlogPost => post !== null);
  } catch (error) {
    console.error('Error loading posts:', error);
    return [];
  }
}