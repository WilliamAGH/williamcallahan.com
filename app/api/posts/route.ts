/**
 * Posts API Route
 */

import { NextResponse } from 'next/server';
import { getAllMDXPosts } from '@/lib/blog/mdx';
import type { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const tag = searchParams.get('tag');

  const posts = await getAllMDXPosts();

  // Sort posts by publishedAt in descending order
  const sortedPosts = posts.sort((a, b) =>
    new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  );

  if (tag) {
    const filteredPosts = sortedPosts.filter(post =>
      post.tags.some(t => t.toLowerCase() === tag.toLowerCase())
    );
    return NextResponse.json(filteredPosts);
  }

  return NextResponse.json(sortedPosts);
}
