/**
 * Blog Types
 * 
 * Type definitions for blog posts and related entities
 */

export interface BlogPost {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  publishedAt: string;
  updatedAt?: string;
  author: Author;
  tags: string[];
  readingTime: number;
  coverImage?: string;
}

export interface Author {
  id: string;
  name: string;
  avatar?: string;
  bio?: string;
}

export type BlogTag = {
  id: string;
  name: string;
  slug: string;
  count: number;
}