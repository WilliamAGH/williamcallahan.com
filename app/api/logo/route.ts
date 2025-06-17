/**
 * Logo API endpoint - serves logos via HTTP
 *
 * Uses unified getLogo() from data access layer
 * Query params: website, company, forceRefresh
 * Returns: Image buffer with appropriate content-type
 *
 * @module app/api/logo
 */

import { getLogo, resetLogoSessionTracking } from "@/lib/data-access/logos";
import logger from "@/lib/utils/logger";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * GET handler for logo fetching
 * @param {NextRequest} request - Incoming request
 * @returns {Promise<NextResponse>} API response with logo image or error
 *
 * The unified logo system provides:
 * - In-memory cache (fastest)
 * - S3 persistent storage with source tracking
 * - External fetching from Google/DuckDuckGo
 * - Automatic validation against generic globe icons
 * - Retry logic with exponential backoff
 * - Placeholder fallback for unavailable logos
 */
export const dynamic = "force-dynamic";
export const revalidate = 3600;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const searchParams = request.nextUrl.searchParams;
  const website = searchParams.get("website");
  const company = searchParams.get("company");
  const forceRefresh = searchParams.get("forceRefresh") === "true";

  if (!website && !company) {
    return NextResponse.json({ error: "Website or company name required" }, { status: 400 });
  }

  try {
    let domain: string;
    if (website) {
      try {
        domain = new URL(website).hostname.replace("www.", "");
      } catch {
        // If URL parsing fails, try using the website string directly
        domain = website.replace(/^https?:\/\/(www\.)?/, "").split("/")[0];
      }
    } else if (company) {
      domain = company.toLowerCase().replace(/\s+/g, "");
    } else {
      throw new Error("Website or company name required");
    }

    // Reset session tracking if force refresh is requested
    // This clears the in-memory cache and forces fresh fetching
    if (forceRefresh) {
      resetLogoSessionTracking();
      logger.info(`[Logo API] Force refresh requested for domain: ${domain}`);
    }

    // Use the centralized getLogo function which handles the full flow:
    // 1. Check in-memory session cache
    // 2. Check S3 storage (with source information preserved)
    // 3. Fetch from external sources (Google, DuckDuckGo)
    // 4. Validate against generic globe icons
    // 5. Persist to S3 with source tracking
    // 6. Fall back to placeholder if all sources fail
    const logoResult = await getLogo(domain);

    if (!logoResult || !logoResult.buffer) {
      const error = logoResult?.error || "Failed to fetch logo";
      logger.warn(`[Logo API] No logo found for domain: ${domain}. Error: ${error}`);

      return new NextResponse(null, {
        status: 404,
        headers: {
          "Cache-Control": "public, max-age=3600", // Cache failures for 1 hour
          "x-logo-error": error,
          "x-logo-domain": domain,
        },
      });
    }

    // Successful response with logo data
    logger.debug(
      `[Logo API] Serving logo for domain: ${domain} from source: ${logoResult.source}, retrieval: ${logoResult.retrieval}`,
    );

    return new NextResponse(logoResult.buffer, {
      status: 200,
      headers: {
        "Content-Type": logoResult.contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
        "x-logo-source": logoResult.source || "unknown",
        "x-logo-retrieval": logoResult.retrieval || "unknown",
        "x-logo-domain": domain,
      },
    });
  } catch (error) {
    logger.error("[Logo API] Unexpected error:", error);
    return new NextResponse(null, {
      status: 500,
      headers: {
        "Cache-Control": "public, max-age=300", // Cache errors for 5 minutes
        "x-logo-error": "Internal server error",
      },
    });
  }
}
