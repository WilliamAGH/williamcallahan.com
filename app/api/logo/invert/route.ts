/**
 * Logo Inversion API Route
 * @module app/api/logo/invert
 * @description
 * Server-side API endpoint for inverting logo images based on theme.
 * This route handles image inversion, caching, and serving inverted logos.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getUnifiedImageService } from "@/lib/services/unified-image-service";
import type { UnifiedImageService } from "@/lib/services/unified-image-service";
import { ImageMemoryManagerInstance } from "@/lib/image-memory-manager";
import type { ImageMemoryManager } from "@/lib/image-memory-manager";
import type { LogoFetchResult } from "@/types/cache";
import { ServerCacheInstance } from "@/lib/server-cache";
import { analyzeImage } from "@/lib/image-handling/image-analysis";

/**
 * Safely parse and validate URL
 * @param {string} urlString - URL string to parse
 * @returns {string} Validated URL string
 */
function validateUrl(urlString: string): string {
  try {
    // If it's a relative URL starting with /api, keep it relative
    if (urlString.startsWith("/api")) {
      return urlString;
    }
    // Otherwise, ensure it's a valid URL
    return new URL(urlString).toString();
  } catch {
    throw new Error(`Invalid URL: ${urlString}`);
  }
}

/**
 * GET handler for logo inversion
 * @param {NextRequest} request - Incoming request
 * @returns {Promise<NextResponse>} API response with inverted image
 */
// Enable dynamic rendering to allow API calls during server-side rendering
export const dynamic = "force-dynamic";
export const revalidate = 3600; // Cache for 1 hour

export async function GET(request: NextRequest): Promise<NextResponse> {
  const searchParams = request.nextUrl.searchParams;
  const domain = searchParams.get("domain");
  const forceRefresh = searchParams.get("forceRefresh") === "true";

  if (!domain) {
    return NextResponse.json({ error: "Domain parameter required" }, { status: 400 });
  }

  try {
    const imageService: UnifiedImageService = getUnifiedImageService();
    const imageManager: ImageMemoryManager = ImageMemoryManagerInstance;

    const logoMeta: LogoFetchResult = await imageService.getLogo(domain, {
      invertColors: true,
      forceRefresh,
    });

    if (logoMeta.error || (!logoMeta.cdnUrl && !logoMeta.s3Key)) {
      const error = logoMeta.error || "Inverted logo not found";
      return new NextResponse(null, {
        status: 404,
        headers: { "x-logo-error": error },
      });
    }

    if (logoMeta.s3Key) {
      const bufferEntry = await imageManager.get(logoMeta.s3Key);
      if (bufferEntry?.buffer) {
        return new NextResponse(bufferEntry.buffer, {
          status: 200,
          headers: {
            "Content-Type": logoMeta.contentType || "image/png",
            "Cache-Control": "public, max-age=31536000, immutable",
          },
        });
      }
    }

    if (logoMeta.cdnUrl) {
      return NextResponse.redirect(logoMeta.cdnUrl, 301);
    }

    return new NextResponse(null, {
      status: 404,
      headers: { "x-logo-error": "No content available for inverted logo" },
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`[API Logo Invert] Error for domain ${domain}:`, errorMessage);
    return new NextResponse(null, {
      status: 500,
      headers: { "x-logo-error": errorMessage },
    });
  }
}

/**
 * HEAD handler for checking if inversion is needed
 * @param {NextRequest} request - Incoming request
 * @returns {Promise<NextResponse>} API response with inversion status
 */
export async function HEAD(request: NextRequest): Promise<NextResponse> {
  const serverCache = ServerCacheInstance;
  const searchParams = request.nextUrl.searchParams;
  const urlParam = searchParams.get("url");
  const isDarkTheme = searchParams.get("theme") === "dark";

  if (!urlParam) {
    return new NextResponse(null, {
      status: 400,
      headers: {
        "Cache-Control": "no-store",
      },
    });
  }

  try {
    const url = validateUrl(urlParam);

    // Check cache first
    const cacheKey = `${url}-analysis`;
    const cached = serverCache.getLogoAnalysis(cacheKey);
    if (cached) {
      const needsInv = isDarkTheme ? cached.needsDarkInversion : cached.needsLightInversion;
      return new NextResponse(null, {
        headers: {
          "X-Needs-Inversion": needsInv.toString(),
          "X-Has-Transparency": cached.hasTransparency.toString(),
          "X-Brightness": cached.brightness.toString(),
          "Cache-Control": "public, max-age=31536000",
        },
      });
    }

    // Fetch and analyze image
    const response = await fetch(url, {
      next: { revalidate: 3600 }, // Cache for 1 hour
    });

    if (!response.ok) {
      return new NextResponse(null, {
        status: response.status,
        headers: {
          "Cache-Control": "no-store",
        },
      });
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const analysis = await analyzeImage(buffer);

    // Cache the analysis
    serverCache.setLogoAnalysis(cacheKey, analysis);

    return new NextResponse(null, {
      headers: {
        "X-Needs-Inversion": (isDarkTheme ? analysis.needsDarkInversion : analysis.needsLightInversion).toString(),
        "X-Has-Transparency": analysis.hasTransparency.toString(),
        "X-Brightness": analysis.brightness.toString(),
        "Cache-Control": "public, max-age=31536000",
      },
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Error analyzing logo:", errorMessage);
    return new NextResponse(null, {
      status: 500,
      headers: {
        "Cache-Control": "no-store",
      },
    });
  }
}
