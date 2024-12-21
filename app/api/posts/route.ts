/**
 * Posts API Route
 */

import { NextResponse } from 'next/server';
import { getAllPosts } from '@/lib/blog';

export async function GET() {
  const posts = await getAllPosts();
  return NextResponse.json(posts);
}