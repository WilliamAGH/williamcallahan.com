import { ServerCacheInstance } from "@/lib/server-cache";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// This middleware adds cache stats to API responses
export function middleware(request: NextRequest) {
  // Only add debug info in development
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.next();
  }

  // Only for API routes related to caching
  const { pathname } = new URL(request.url);
  if (
    !pathname.startsWith("/api/logo") &&
    !pathname.startsWith("/api/bookmarks") &&
    !pathname.startsWith("/api/github-activity")
  ) {
    return NextResponse.next();
  }

  // Get the response
  const response = NextResponse.next();

  // Add cache stats headers
  const stats = ServerCacheInstance.getStats();
  response.headers.set("x-cache-hits", stats.hits.toString());
  response.headers.set("x-cache-misses", stats.misses.toString());
  response.headers.set("x-cache-keys", stats.keys.toString());

  return response;
}
