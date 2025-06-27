/**
 * Logo API endpoint - serves logos via HTTP
 *
 * Uses unified getLogo() from data access layer
 * Query params: website, company, forceRefresh
 * Returns: Image buffer with appropriate content-type
 *
 * @module app/api/logo
 */

import { getUnifiedImageService } from "@/lib/services/unified-image-service";
import type { LogoFetchResult } from "@/types/cache";
import logger from "@/lib/utils/logger";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { buildCdnUrl, getCdnConfigFromEnv } from "@/lib/utils/cdn-utils";

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
        domain = website.replace(/^https?:\/\/(www\.)?/, "").split("/")[0] ?? "";
      }
    } else if (company) {
      domain = company.toLowerCase().replace(/\s+/g, "");
    } else {
      throw new Error("Website or company name required");
    }

    const logoSvc = getUnifiedImageService();

    const logoMeta: LogoFetchResult = await logoSvc.getLogo(domain, { forceRefresh });

    if (logoMeta.error || (!logoMeta.cdnUrl && !logoMeta.s3Key)) {
      const error = logoMeta.error || "Logo metadata not found";
      logger.warn(`[Logo API] No logo found for domain: ${domain}. Error: ${error}`);
      return new NextResponse(null, {
        status: 404,
        headers: {
          "Cache-Control": "public, max-age=3600",
          "x-logo-error": error,
          "x-logo-domain": domain,
        },
      });
    }

    // Redirect to CDN if available
    if (logoMeta.cdnUrl) {
      logger.debug(`[Logo API] Redirecting logo for ${domain} to CDN: ${logoMeta.cdnUrl}`);
      return NextResponse.redirect(logoMeta.cdnUrl, 301);
    }

    // If a valid S3 key exists but cdnUrl is missing, construct a URL directly.
    if (logoMeta.s3Key) {
      try {
        const cdnUrl = buildCdnUrl(logoMeta.s3Key, getCdnConfigFromEnv());
        logger.debug(`[Logo API] Reconstructing CDN/S3 URL for ${domain}: ${cdnUrl}`);
        return NextResponse.redirect(cdnUrl, 301);
      } catch (e) {
        logger.warn(`[Logo API] Failed to build CDN URL for ${domain}:`, e);
      }
    }

    // Final fallback – return placeholder rather than 404 to avoid broken icons
    logger.error(`[Logo API] No content available for logo of domain: ${domain}`);
    return NextResponse.redirect("/images/opengraph-placeholder.png", 302);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error("[Logo API] Unexpected error:", errorMessage);
    return new NextResponse(null, {
      status: 500,
      headers: {
        "Cache-Control": "public, max-age=300", // Cache errors for 5 minutes
        "x-logo-error": "Internal server error",
      },
    });
  }
}
