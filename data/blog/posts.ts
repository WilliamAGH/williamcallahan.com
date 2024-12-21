/**
 * Blog Posts Data
 */

import type { BlogPost } from '@/types/blog';
import { authors } from './authors';

export const posts: BlogPost[] = [
  {
    id: 'building-future-investment-tech',
    title: "Building the Future of Investment Technology",
    slug: "building-future-investment-tech",
    excerpt: "Exploring how modern technology is reshaping the investment landscape",
    content: `The intersection of technology and investment management has created unprecedented opportunities...

## The Evolution of Investment Platforms

Modern investment platforms are revolutionizing how we think about asset allocation...`,
    publishedAt: "2024-03-14",
    author: authors['william-callahan'],
    tags: ["investing", "technology", "fintech"],
    coverImage: "https://images.unsplash.com/photo-1642543492481-44e81e3914a7?auto=format&fit=crop&q=80",
    readingTime: 5
  }
];