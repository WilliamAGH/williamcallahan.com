/**
 * OpenGraph refresh workflow
 * @module data-access/opengraph-refresh
 */

import { envLogger } from "@/lib/utils/env-logger";
import { debug } from "@/lib/utils/debug";
import { getS3Override } from "@/lib/persistence/s3-persistence";
import { fetchExternalOpenGraphWithRetry } from "@/lib/opengraph/fetch";
import { createFallbackResult } from "@/lib/opengraph/fallback";
import { ServerCacheInstance } from "@/lib/server-cache";
import { writeJsonS3 } from "@/lib/s3/json";
import { hashUrl, normalizeUrl } from "@/lib/utils/opengraph-utils";
import type { OgResult } from "@/types";
import { OgError } from "@/types/opengraph";
import { karakeepImageFallbackSchema } from "@/types/seo/opengraph";
import { OPENGRAPH_METADATA_S3_DIR } from "@/lib/constants";

const inFlightOgPromises: Map<string, Promise<OgResult | null>> = new Map();

/**
 * Forces a refresh of OpenGraph data from the external URL, bypassing caches.
 */
export async function refreshOpenGraphData(
  url: string,
  idempotencyKey?: string,
  fallbackImageData?: unknown,
): Promise<OgResult | null> {
  const normalizedUrl = normalizeUrl(url);
  const urlHash = hashUrl(normalizedUrl);
  let promise = inFlightOgPromises.get(urlHash);

  void idempotencyKey;

  if (promise) {
    debug(`[DataAccess/OpenGraph] Joining in-flight request for: ${normalizedUrl}`);
    return promise;
  }

  const validatedFallback = fallbackImageData
    ? karakeepImageFallbackSchema.safeParse(fallbackImageData).data
    : null;

  promise = (async () => {
    try {
      const s3Override = await getS3Override(normalizedUrl);
      if (s3Override) {
        debug(
          `[OpenGraph Refresh] 🛡️ S3 override found during refresh, skipping external fetch: ${normalizedUrl}`,
        );
        ServerCacheInstance.setOpenGraphData(normalizedUrl, s3Override, false);
        return s3Override;
      }

      debug(`[OpenGraph Refresh] 🚀 Starting automatic refresh for: ${normalizedUrl}`);
      const result = await fetchExternalOpenGraphWithRetry(
        normalizedUrl,
        validatedFallback || undefined,
      );

      if (result && typeof result === "object" && "url" in result) {
        debug(`[OpenGraph Refresh] ✅ Successfully refreshed: ${normalizedUrl}`);
        const metadataS3Key = `${OPENGRAPH_METADATA_S3_DIR}/${urlHash}.json`;
        ServerCacheInstance.setOpenGraphData(normalizedUrl, result, false);
        await writeJsonS3(metadataS3Key, result);
        debug(`[OpenGraph S3] 💾 Persisted refreshed metadata to S3: ${metadataS3Key}`);
        return result;
      }

      if (result && typeof result === "object" && "networkFailure" in result) {
        debug(`[OpenGraph Refresh] 🌐 Network unavailable for: ${normalizedUrl}, using fallback`);
        const fallback = createFallbackResult(
          normalizedUrl,
          "Network connectivity issue",
          validatedFallback,
        );
        ServerCacheInstance.setOpenGraphData(normalizedUrl, fallback, true);
        return fallback;
      }

      debug(`[OpenGraph Refresh] ❌ External source unavailable for: ${normalizedUrl}`);
      const fallback = createFallbackResult(
        normalizedUrl,
        "External source unavailable",
        validatedFallback,
      );
      ServerCacheInstance.setOpenGraphData(normalizedUrl, fallback, true);
      return fallback;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      const ogError = new OgError(
        `Failed to refresh OpenGraph data for ${normalizedUrl}`,
        "refresh",
        {
          originalError: error,
        },
      );
      envLogger.log(
        ogError.message,
        {
          errorName: ogError.name,
          errorMessage: ogError.message,
          stack: ogError.stack,
          cause: err instanceof Error ? err.message : String(err),
          url: normalizedUrl,
        },
        { category: "OpenGraph" },
      );

      const fallback = createFallbackResult(normalizedUrl, ogError.message, validatedFallback);
      ServerCacheInstance.setOpenGraphData(normalizedUrl, fallback, true);
      return fallback;
    } finally {
      inFlightOgPromises.delete(urlHash);
    }
  })();

  inFlightOgPromises.set(urlHash, promise);
  return promise;
}
