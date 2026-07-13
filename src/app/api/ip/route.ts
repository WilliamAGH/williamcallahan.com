import { type NextRequest, NextResponse } from "next/server";
import { getClientIp } from "@/lib/utils/request-utils";

/**
 * Cache control headers to prevent IP caching
 * @constant
 */
const CACHE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
  Pragma: "no-cache",
  Expires: "0",
} as const;

/**
 * API Route handler for /api/ip
 * Returns the real client IP address as plain text
 * Uses various headers to determine the true client IP, prioritizing Cloudflare headers
 * @param request - The incoming Next.js request
 * @returns A Next.js response containing the IP address with no-cache headers
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  // Use Promise.resolve to satisfy require-await rule
  const ip = await Promise.resolve(getClientIp(request.headers));

  return new NextResponse(ip, {
    headers: CACHE_HEADERS,
  });
}
