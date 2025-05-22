import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/**
 * Context for the dynamic route, containing the path parameter for Twitter images
 */
interface TwitterImageContext {
  // Dynamic API context params are asynchronous in Next.js 15
  params: Promise<{ path: string[] }>
}

export async function GET(
  request: NextRequest,
  { params }: TwitterImageContext
) {
  // Reconstruct the Twitter image URL by awaiting dynamic params
  const { path: pathSegments } = await params;
  // Preserve any query parameters (e.g., format, name)
  const { search } = request.nextUrl;
  const upstreamUrl = `https://pbs.twimg.com/${pathSegments.join('/')}${search}`;
  console.log(`[Twitter Image Proxy] Attempting to fetch: ${upstreamUrl}`);

  // Fetch from Twitter
  const upstreamResponse = await fetch(upstreamUrl);
  console.log(`[Twitter Image Proxy] Upstream response status for ${upstreamUrl}: ${upstreamResponse.status} ${upstreamResponse.statusText}`);

  if (!upstreamResponse.ok) {
    return new NextResponse(null, { status: upstreamResponse.status });
  }

  // Mirror content type and set caching headers
  const contentType = upstreamResponse.headers.get('Content-Type') || 'application/octet-stream';
  const responseHeaders = new Headers({
    'Content-Type': contentType,
    'Cache-Control': 'public, max-age=86400, immutable'
  });

  // Mirror status and headers (omit only content-length to allow streaming)
  upstreamResponse.headers.forEach((value, key) => {
    // Omit content-length since streaming chunk size may differ, but preserve content-encoding
    if (key.toLowerCase() === 'content-length') return;
    responseHeaders.set(key, value);
  });

  // Stream the image data back
  return new NextResponse(upstreamResponse.body, { headers: responseHeaders });
}
