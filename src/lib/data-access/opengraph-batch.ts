/**
 * OpenGraph Batch Data Access
 *
 * Simplified OpenGraph fetching for batch operations (data-updater)
 * Bypasses all runtime caches and focuses on S3 persistence
 *
 * @module data-access/opengraph-batch
 */

import { readJsonS3Optional, writeJsonS3 } from "@/lib/s3/json";
import { hashUrl, normalizeUrl, validateOgUrl } from "@/lib/utils/opengraph-utils";
import { OPENGRAPH_CACHE_DURATION } from "@/lib/constants";
import { fetchExternalOpenGraphWithRetry } from "@/lib/opengraph/fetch";
import { createFallbackResult } from "@/lib/opengraph/fallback";
import { generateS3Key } from "@/lib/utils/hash-utils";
import { BatchProcessor, BatchProgressReporter } from "@/lib/batch-processing";
import { getMonotonicTime } from "@/lib/utils";
import { isOgResult, type OgResult, type KarakeepImageFallback } from "@/types";
import { ogResultSchema } from "@/types/seo/opengraph";

/**
 * Batch-optimized OpenGraph data fetching
 * Simple flow: Check S3 → Fetch if stale/missing → Store to S3
 * No memory caches, no overrides, no complex priority levels
 */
export async function getOpenGraphDataBatch(
  url: string,
  fallbackImageData?: KarakeepImageFallback | null,
  forceRefresh = false,
): Promise<OgResult> {
  const normalizedUrl = normalizeUrl(url);
  const urlHash = hashUrl(normalizedUrl);
  const s3Key = generateS3Key({
    type: "opengraph",
    url: normalizedUrl,
    hash: urlHash,
  });

  // Validate URL
  if (!validateOgUrl(normalizedUrl)) {
    return createFallbackResult(normalizedUrl, "Invalid or unsafe URL", fallbackImageData);
  }

  // Step 1: Check S3 for existing data
  // readJsonS3Optional returns null for 404, throws for real S3 errors
  if (!forceRefresh) {
    try {
      const stored = await readJsonS3Optional(s3Key, ogResultSchema);
      if (stored && isOgResult(stored)) {
        const age = getMonotonicTime() - (stored.timestamp || 0);
        const isDataFresh = age < OPENGRAPH_CACHE_DURATION.SUCCESS * 1000;

        if (isDataFresh) {
          // Data is fresh, return it
          return stored;
        }
        // Data is stale, will fetch fresh data below
      }
    } catch (s3Error) {
      // Log S3 read errors explicitly before propagating per [RC1a]
      // Do NOT silently fall through to fetch - real S3 errors indicate infrastructure issues
      console.error(`[OpenGraph Batch] S3 read error for ${s3Key}:`, s3Error);
      throw s3Error;
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

    // Step 3: Store to S3
    await writeJsonS3(s3Key, result);

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
  urls: Array<{ url: string; fallback?: KarakeepImageFallback | null }>,
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
    { url: string; fallback?: KarakeepImageFallback | null },
    OgResult
  >(
    "opengraph-batch",
    async (item) => getOpenGraphDataBatch(item.url, item.fallback, options.forceRefresh),
    {
      batchSize: options.batchSize || 5, // Lower concurrency for external sites
      batchDelay: 100, // Small delay between batches
      memoryThreshold: 0.85,
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

  // Add skipped results (due to memory pressure)
  for (const item of result.skipped) {
    ogResults.set(
      item.url,
      createFallbackResult(item.url, "Skipped due to memory pressure", item.fallback),
    );
  }

  // Log summary
  console.log(`[OpenGraph Batch] Completed in ${result.totalTime}ms`);
  console.log(
    `[OpenGraph Batch] Success: ${result.successful.size}, Failed: ${result.failed.size}, Skipped: ${result.skipped.length}`,
  );
  if (result.memoryPressureEvents > 0) {
    console.log(`[OpenGraph Batch] Memory pressure events: ${result.memoryPressureEvents}`);
  }

  return ogResults;
}
