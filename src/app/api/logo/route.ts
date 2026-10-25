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
import { createErrorResponse, NO_STORE_HEADERS, preventCaching } from "@/lib/utils/api-utils";
import { NextResponse, type NextRequest } from "next/server";
import { buildCdnUrl, getCdnConfigFromEnv, isOurCdnUrl } from "@/lib/utils/cdn-utils";
import { IMAGE_CDN_CACHE_HEADERS, IMAGE_SECURITY_HEADERS } from "@/lib/validators/url";
import { getStaticImageUrl } from "@/lib/data-access/static-images";
import { normalizeDomain } from "@/lib/utils/domain-utils";
import { parseS3Key } from "@/lib/utils/hash-utils";
import { logoUrlSchema } from "@/types/schemas/url";
import { fetchWithTimeout } from "@/lib/utils/http-client";
import { createMonitoredStream } from "@/lib/utils/stream-utils";

// Match the existing image cache route's CDN fetch deadline, including body reads.
const LOGO_FETCH_TIMEOUT_MS = 15_000;

/** Local Next.js image fetches require bytes, not a CDN redirect. */
async function serveLogoImage(url: string, domain: string): Promise<NextResponse> {
  const validatedUrl = logoUrlSchema.parse(url);
  if (!isOurCdnUrl(validatedUrl, getCdnConfigFromEnv())) {
    throw new Error("Logo URL is outside the configured CDN");
  }

  const signal = AbortSignal.timeout(LOGO_FETCH_TIMEOUT_MS);
  try {
    // Persisted CDN URLs are canonical; do not follow a redirect to another identity.
    const upstream = await fetchWithTimeout(validatedUrl, { signal, followRedirects: false });
    const contentType = upstream.headers.get("content-type");
    if (upstream.status !== 200 || !upstream.body || !contentType?.startsWith("image/")) {
      await upstream.body?.cancel();
      logger.warn(`[Logo API] Invalid CDN image response for ${domain}: ${upstream.status}`);
      return new NextResponse(null, { status: 502, headers: NO_STORE_HEADERS });
    }

    return new NextResponse(createMonitoredStream(upstream.body, `logo:${domain}`), {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
        ...IMAGE_CDN_CACHE_HEADERS,
        ...IMAGE_SECURITY_HEADERS,
      },
    });
  } catch (error) {
    logger.warn(`[Logo API] CDN image fetch failed for ${domain}:`, error);
    return new NextResponse(null, {
      status: signal.aborted ? 504 : 502,
      headers: NO_STORE_HEADERS,
    });
  }
}

/**
 * GET handler for logo fetching
 * @param {NextRequest} request - Incoming request
 * @returns {Promise<NextResponse>} API response with logo image or error
 *
 * The unified logo system provides:
 * - Next.js cache tag invalidation hooks
 * - S3 persistent storage with source tracking
 * - External fetching from Google/DuckDuckGo
 * - Automatic validation against generic globe icons
 * - Retry logic with exponential backoff
 * - Placeholder fallback for unavailable logos
 */

export async function GET(request: NextRequest): Promise<NextResponse> {
  preventCaching();
  const requestUrl = new URL(request.url);
  const searchParams = requestUrl.searchParams;
  const website = searchParams.get("website") ?? searchParams.get("domain");
  const company = searchParams.get("company");
  const forceRefresh = searchParams.get("forceRefresh") === "true";

  if (!website && !company) {
    return createErrorResponse("Website or company name required", 400);
  }

  try {
    const resolveDomainInput = (input: string): string | null => {
      const trimmed = input.trim();
      if (!trimmed) return null;

      const normalized = normalizeDomain(trimmed);
      if (normalized.includes(".")) {
        return normalized.toLowerCase();
      }

      const cleaned = trimmed.split("?")[0]?.split("#")[0] ?? trimmed;
      const normalizedKey =
        cleaned.startsWith("logos/") || cleaned.startsWith("logo/") ? `/${cleaned}` : cleaned;
      const parsed = parseS3Key(normalizedKey);
      if (parsed.type === "logo" && parsed.domain?.includes(".")) {
        return parsed.domain.toLowerCase();
      }

      return null;
    };

    let domain: string;
    if (website) {
      const resolved = resolveDomainInput(website);
      if (!resolved) {
        return createErrorResponse("Website must include a valid domain", 400);
      }
      domain = resolved;
    } else if (company) {
      const resolved = resolveDomainInput(company);
      if (!resolved) {
        return createErrorResponse(
          "Company fallback requires a domain (e.g., example.com) or a website parameter",
          400,
        );
      }
      domain = resolved;
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
          ...NO_STORE_HEADERS,
          "x-logo-error": error,
          "x-logo-domain": domain,
        },
      });
    }

    let logoUrl = logoMeta.cdnUrl;
    // If a valid S3 key exists but cdnUrl is missing, construct a URL directly.
    if (!logoUrl && logoMeta.s3Key) {
      try {
        logoUrl = buildCdnUrl(logoMeta.s3Key, getCdnConfigFromEnv());
      } catch (e) {
        logger.warn(`[Logo API] Failed to build CDN URL for ${domain}:`, e);
      }
    }

    // Final fallback – return placeholder rather than 404 to avoid broken icons
    if (!logoUrl) {
      logger.error(`[Logo API] No content available for logo of domain: ${domain}`);
      logoUrl = getStaticImageUrl("/images/opengraph-placeholder.png");
    }
    return await serveLogoImage(logoUrl, domain);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error("[Logo API] Unexpected error:", errorMessage);
    return new NextResponse(null, {
      status: 500,
      headers: {
        ...NO_STORE_HEADERS,
        "x-logo-error": "Internal server error",
      },
    });
  }
}
