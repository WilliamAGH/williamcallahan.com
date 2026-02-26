/**
 * OpenGraph Next.js cache path
 * @module data-access/opengraph-next-cache
 */

import { envLogger } from "@/lib/utils/env-logger";
import { debug } from "@/lib/utils/debug";
import { getS3Override } from "@/lib/persistence/s3-persistence";
import { getDomainType, hashUrl, validateOgUrl } from "@/lib/utils/opengraph-utils";
import { getUnifiedImageService } from "@/lib/services/unified-image-service";
import { OPENGRAPH_CACHE_DURATION } from "@/lib/constants";
import { createFallbackResult } from "@/lib/opengraph/fallback";
import { readOgMetadata } from "@/lib/db/queries/opengraph";
import type { OgResult } from "@/types";
import { isOgResult, type CachedOpenGraphInput } from "@/types/opengraph";
import { safeCacheLife, safeCacheTag } from "./opengraph-cache-context";

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

  debug(`[OG-Priority-3] Checking DB persistent storage for: ${normalizedUrl}`);
  const stored = await readOgMetadata(urlHash);
  if (stored && isOgResult(stored)) {
    const isDataFresh =
      stored.timestamp &&
      getOgTimestamp() - stored.timestamp < OPENGRAPH_CACHE_DURATION.SUCCESS * 1000;

    if (isDataFresh) {
      debug(
        `[OG-Priority-3] Found FRESH DB storage: ${normalizedUrl} (age: ${Math.round((getOgTimestamp() - (stored.timestamp || 0)) / 1000)}s)`,
      );
      return stored;
    }
  } else {
    debug(`[OG-Priority-3] No valid data in DB storage for: ${normalizedUrl}`);
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
