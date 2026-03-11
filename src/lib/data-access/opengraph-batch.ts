/**
 * OpenGraph Batch Data Access
 *
 * Simplified OpenGraph fetching for batch operations (data-updater)
 * Bypasses all runtime caches and focuses on S3 persistence
 *
 * @module data-access/opengraph-batch
 */

import { hashUrl, normalizeUrl, validateOgUrl } from "@/lib/utils/opengraph-utils";
import { OPENGRAPH_CACHE_DURATION } from "@/lib/constants";
import { fetchExternalOpenGraphWithRetry } from "@/lib/opengraph/fetch";
import { createFallbackResult } from "@/lib/opengraph/fallback";
import { readOgMetadata } from "@/lib/db/queries/opengraph";
import { writeOgMetadata } from "@/lib/db/mutations/opengraph";
import { BatchProcessor, BatchProgressReporter } from "@/lib/batch-processing";
import { getMonotonicTime } from "@/lib/utils";
import { isOgResult } from "@/types/opengraph";
import type { OgResult } from "@/types/opengraph";
import type { ValidatedKarakeepImageFallback } from "@/types/seo/opengraph";

/**
 * Batch-optimized OpenGraph data fetching
 * Simple flow: Check S3 → Fetch if stale/missing → Store to S3
 * No runtime cache layers, no overrides, no complex priority levels
 */
export async function getOpenGraphDataBatch(
  url: string,
  fallbackImageData?: ValidatedKarakeepImageFallback | null,
  forceRefresh = false,
): Promise<OgResult> {
  const normalizedUrl = normalizeUrl(url);
  const urlHash = hashUrl(normalizedUrl);

  // Validate URL
  if (!validateOgUrl(normalizedUrl)) {
    return createFallbackResult(normalizedUrl, "Invalid or unsafe URL", fallbackImageData);
  }

  // Step 1: Check PostgreSQL for existing data
  if (!forceRefresh) {
    const stored = await readOgMetadata(urlHash);
    if (stored && isOgResult(stored)) {
      const age = getMonotonicTime() - (stored.timestamp || 0);
      const isDataFresh = age < OPENGRAPH_CACHE_DURATION.SUCCESS * 1000;

      if (isDataFresh) {
        return stored;
      }
      // Data is stale, will fetch fresh data below
    }
  }

  // Step 2: Fetch fresh data from external source
  try {
    const result = await fetchExternalOpenGraphWithRetry(
      normalizedUrl,
      fallbackImageData || undefined,
    );

    // Check if result is null or a network failure
    if (!result) {
      return createFallbackResult(
        normalizedUrl,
        "Failed to fetch OpenGraph data",
        fallbackImageData,
      );
    }

    if ("networkFailure" in result) {
      return createFallbackResult(normalizedUrl, "Network failure", fallbackImageData);
    }

    // Step 3: Store to PostgreSQL
    await writeOgMetadata(urlHash, normalizedUrl, result as OgResult);

    return result;
  } catch (error) {
    // Create fallback result on error
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return createFallbackResult(normalizedUrl, errorMessage, fallbackImageData);
  }
}

/**
 * Process multiple URLs in batch with progress logging
 */
export async function processOpenGraphBatch(
  urls: Array<{ url: string; fallback?: ValidatedKarakeepImageFallback | null }>,
  options: {
    forceRefresh?: boolean;
    onProgress?: (current: number, total: number) => void;
    batchSize?: number;
  } = {},
): Promise<Map<string, OgResult>> {
  // Create progress reporter
  const progressReporter = new BatchProgressReporter("OpenGraph Batch", 10000); // Report every 10 seconds

  // Create batch processor with lower concurrency for OpenGraph (to be polite to external sites)
  const processor = new BatchProcessor<
    { url: string; fallback?: ValidatedKarakeepImageFallback | null },
    OgResult
  >(
    "opengraph-batch",
    async (item) => getOpenGraphDataBatch(item.url, item.fallback, options.forceRefresh),
    {
      batchSize: options.batchSize || 5, // Lower concurrency for external sites
      batchDelay: 100, // Small delay between batches
      timeout: 30000,
      onProgress: (current, total, failed) => {
        if (options.onProgress) {
          options.onProgress(current, total);
        } else {
          progressReporter.createProgressHandler()(current, total, failed);
        }
      },
      debug: true,
    },
  );

  // Process the batch
  const result = await processor.processBatch(urls);

  // Convert result format
  const ogResults = new Map<string, OgResult>();

  // Add successful results
  for (const [item, ogResult] of result.successful) {
    ogResults.set(item.url, ogResult);
  }

  // Add failed results
  for (const [item, error] of result.failed) {
    ogResults.set(
      item.url,
      createFallbackResult(item.url, error.message || "Processing failed", item.fallback),
    );
  }

  // Log summary
  console.log(`[OpenGraph Batch] Completed in ${result.totalTime}ms`);
  console.log(
    `[OpenGraph Batch] Success: ${result.successful.size}, Failed: ${result.failed.size}, Skipped: ${result.skipped.length}`,
  );

  return ogResults;
}
