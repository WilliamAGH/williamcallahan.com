/**
 * OpenGraph Next.js cache path
 * @module data-access/opengraph-next-cache
 */

import { envLogger } from "@/lib/utils/env-logger";
import { debug } from "@/lib/utils/debug";
import { readJsonS3 } from "@/lib/s3/json";
import { getS3Override } from "@/lib/persistence/s3-persistence";
import { getDomainType, hashUrl, validateOgUrl } from "@/lib/utils/opengraph-utils";
import { getUnifiedImageService } from "@/lib/services/unified-image-service";
import { OPENGRAPH_METADATA_S3_DIR, OPENGRAPH_CACHE_DURATION } from "@/lib/constants";
import { createFallbackResult } from "@/lib/opengraph/fallback";
import { S3NotFoundError } from "@/lib/s3/errors";
import type { OgResult } from "@/types";
import { isOgResult } from "@/types/opengraph";
import { ogResultSchema, type KarakeepImageFallback } from "@/types/seo/opengraph";
import { safeCacheLife, safeCacheTag } from "./opengraph-cache-context";

type RefreshOpenGraphData = (
  url: string,
  idempotencyKey?: string,
  fallbackImageData?: unknown,
) => Promise<OgResult | null>;

type CachedOpenGraphInput = {
  normalizedUrl: string;
  skipExternalFetch: boolean;
  idempotencyKey?: string;
  validatedFallback?: KarakeepImageFallback | null;
  getOgTimestamp: () => number;
  refreshOpenGraphData: RefreshOpenGraphData;
};

export async function getCachedOpenGraphDataInternal({
  normalizedUrl,
  skipExternalFetch,
  idempotencyKey,
  validatedFallback,
  getOgTimestamp,
  refreshOpenGraphData,
}: CachedOpenGraphInput): Promise<OgResult> {
  "use cache";
  safeCacheLife("OpenGraph", "days");
  safeCacheTag("OpenGraph", "opengraph");

  const urlHash = hashUrl(normalizedUrl);
  safeCacheTag("OpenGraph", `opengraph-${urlHash}`);

  debug(`[DataAccess/OpenGraph] 🔍 Getting OpenGraph data for: ${normalizedUrl}`);

  debug(`[OG-Priority-1] 🔍 Checking S3 override for: ${normalizedUrl}`);
  const s3Override = await getS3Override(normalizedUrl);
  if (s3Override) {
    debug(`[OG-Priority-1] ✅ Found S3 override: ${normalizedUrl}`);
    return s3Override;
  }
  debug(`[OG-Priority-1] ❌ No S3 override found for: ${normalizedUrl}`);

  if (!validateOgUrl(normalizedUrl)) {
    envLogger.log("Invalid or unsafe URL", { url: normalizedUrl }, { category: "OpenGraph" });
    return createFallbackResult(normalizedUrl, "Invalid or unsafe URL", validatedFallback);
  }

  const domain = getDomainType(normalizedUrl);
  const imageService = getUnifiedImageService();
  if (imageService.hasDomainFailedTooManyTimes(domain)) {
    debug(`[DataAccess/OpenGraph] Domain ${domain} has failed too many times, using fallback`);
    return createFallbackResult(normalizedUrl, "Domain temporarily unavailable", validatedFallback);
  }

  debug(`[OG-Priority-3] 🔍 Checking S3 persistent storage for: ${normalizedUrl}`);
  try {
    const stored = await readJsonS3(`${OPENGRAPH_METADATA_S3_DIR}/${urlHash}.json`, ogResultSchema);
    if (isOgResult(stored)) {
      const isDataFresh =
        stored.timestamp &&
        getOgTimestamp() - stored.timestamp < OPENGRAPH_CACHE_DURATION.SUCCESS * 1000;

      if (isDataFresh) {
        debug(
          `[OG-Priority-3] ✅ Found FRESH S3 storage: ${normalizedUrl} (age: ${Math.round((getOgTimestamp() - (stored.timestamp || 0)) / 1000)}s)`,
        );
        return stored;
      }
    }
    debug(`[OG-Priority-3] ❌ No valid data in S3 storage for: ${normalizedUrl}`);
  } catch (e) {
    if (e instanceof S3NotFoundError) {
      debug(`[OG-Priority-3] ❌ Not found in S3 storage: ${normalizedUrl}`);
    } else {
      const error = e instanceof Error ? e : new Error(String(e));
      debug(`[OG-Priority-3] ❌ S3 read error for: ${normalizedUrl} - ${error.message}`);
    }
  }

  if (skipExternalFetch) {
    debug(
      `[DataAccess/OpenGraph] 🚫 Skipping external fetch, returning fallback: ${normalizedUrl}`,
    );
    return createFallbackResult(normalizedUrl, "Skipped external fetch", validatedFallback);
  }

  debug(`[OG-Priority-4] 🔍 Attempting external OpenGraph fetch for: ${normalizedUrl}`);
  const externalResult = await refreshOpenGraphData(
    normalizedUrl,
    idempotencyKey,
    validatedFallback,
  );

  if (externalResult) {
    debug(`[OG-Priority-4] ✅ External OpenGraph fetch succeeded for: ${normalizedUrl}`);
    return externalResult;
  }

  debug(`[OG-Priority-4] ❌ External OpenGraph fetch failed for: ${normalizedUrl}`);
  debug(`[OG-Fallback] 🔄 Moving to Karakeep fallback chain for: ${normalizedUrl}`);
  return createFallbackResult(normalizedUrl, "External source unavailable", validatedFallback);
}
