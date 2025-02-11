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

  if (tag) {
    const filteredPosts = posts.filter(post =>
      post.tags.some(t => t.toLowerCase() === tag.toLowerCase())
    );
    return NextResponse.json(filteredPosts);
  }

  return NextResponse.json(posts);
}
