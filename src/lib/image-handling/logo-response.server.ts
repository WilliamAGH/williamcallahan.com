import "server-only";

import { NextResponse } from "next/server";
import logger from "@/lib/utils/logger";
import { NO_STORE_HEADERS } from "@/lib/utils/api-utils";
import { getCdnConfigFromEnv, isOurCdnUrl } from "@/lib/utils/cdn-utils";
import { IMAGE_CDN_CACHE_HEADERS, IMAGE_SECURITY_HEADERS } from "@/lib/validators/url";
import { openGraphUrlSchema } from "@/types/schemas/url";
import { fetchWithTimeout } from "@/lib/utils/http-client";
import { createMonitoredStream } from "@/lib/utils/stream-utils";

const LOGO_FETCH_TIMEOUT_MS = 15_000;

/** Both local logo routes must return bytes: Next's internal optimizer does not follow redirects. */
export async function createLogoImageResponse(url: string, domain: string): Promise<NextResponse> {
  const validatedUrl = openGraphUrlSchema.parse(url);
  if (!isOurCdnUrl(validatedUrl, getCdnConfigFromEnv())) {
    throw new Error("Logo URL is outside the configured CDN");
  }
  const signal = AbortSignal.timeout(LOGO_FETCH_TIMEOUT_MS);
  try {
    const upstream = await fetchWithTimeout(validatedUrl, {
      timeout: LOGO_FETCH_TIMEOUT_MS,
      signal,
      followRedirects: false,
    });
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
    return new NextResponse(null, { status: 502, headers: NO_STORE_HEADERS });
  }
}
