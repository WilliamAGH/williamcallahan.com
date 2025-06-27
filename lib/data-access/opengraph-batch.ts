/**
 * OpenGraph Batch Data Access
 * 
 * Simplified OpenGraph fetching for batch operations (data-updater)
 * Bypasses all runtime caches and focuses on S3 persistence
 * 
 * @module data-access/opengraph-batch
 */

import { readJsonS3, writeJsonS3 } from "@/lib/s3-utils";
import { hashUrl, normalizeUrl, validateOgUrl } from "@/lib/utils/opengraph-utils";
import { OPENGRAPH_CACHE_DURATION } from "@/lib/constants";
import { fetchExternalOpenGraphWithRetry } from "@/lib/opengraph/fetch";
import { createFallbackResult } from "@/lib/opengraph/fallback";
import { generateS3Key } from "@/lib/utils/s3-key-generator";
import { BatchProcessor, BatchProgressReporter } from "@/lib/batch-processing";
import type { OgResult } from "@/types";
import { isOgResult } from "@/types/opengraph";
import type { KarakeepImageFallback } from "@/types/seo/opengraph";

/**
 * Batch-optimized OpenGraph data fetching
 * Simple flow: Check S3 → Fetch if stale/missing → Store to S3
 * No memory caches, no overrides, no complex priority levels
 */
export async function getOpenGraphDataBatch(
  url: string,
  fallbackImageData?: KarakeepImageFallback | null,
  forceRefresh = false
): Promise<OgResult> {
  const normalizedUrl = normalizeUrl(url);
  const urlHash = hashUrl(normalizedUrl);
  const s3Key = generateS3Key({
    type: 'opengraph',
    url: normalizedUrl,
    hash: urlHash,
  });

  // Validate URL
  if (!validateOgUrl(normalizedUrl)) {
    return createFallbackResult(normalizedUrl, "Invalid or unsafe URL", fallbackImageData);
  }

  // Step 1: Check S3 for existing data
  if (!forceRefresh) {
    try {
      const stored = await readJsonS3(s3Key);
      if (isOgResult(stored)) {
        const age = Date.now() - (stored.timestamp || 0);
        const isDataFresh = age < OPENGRAPH_CACHE_DURATION.SUCCESS * 1000;
        
        if (isDataFresh) {
          // Data is fresh, return it
          return stored;
        }
        // Data is stale, will fetch fresh data below
      }
    } catch {
      // S3 read failed, will fetch fresh data
    }
  }

  // Step 2: Fetch fresh data from external source
  try {
    const result = await fetchExternalOpenGraphWithRetry(normalizedUrl, fallbackImageData || undefined);
    
    // Check if result is null or a network failure
    if (!result) {
      return createFallbackResult(normalizedUrl, "Failed to fetch OpenGraph data", fallbackImageData);
    }
    
    if ('networkFailure' in result) {
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
  } = {}
): Promise<Map<string, OgResult>> {
  // Create progress reporter
  const progressReporter = new BatchProgressReporter('OpenGraph Batch', 10000); // Report every 10 seconds
  
  // Create batch processor with lower concurrency for OpenGraph (to be polite to external sites)
  const processor = new BatchProcessor<{ url: string; fallback?: KarakeepImageFallback | null }, OgResult>(
    'opengraph-batch',
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
    }
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
    ogResults.set(item.url, createFallbackResult(
      item.url,
      error.message || "Processing failed",
      item.fallback
    ));
  }
  
  // Add skipped results (due to memory pressure)
  for (const item of result.skipped) {
    ogResults.set(item.url, createFallbackResult(
      item.url,
      "Skipped due to memory pressure",
      item.fallback
    ));
  }
  
  // Log summary
  console.log(`[OpenGraph Batch] Completed in ${result.totalTime}ms`);
  console.log(`[OpenGraph Batch] Success: ${result.successful.size}, Failed: ${result.failed.size}, Skipped: ${result.skipped.length}`);
  if (result.memoryPressureEvents > 0) {
    console.log(`[OpenGraph Batch] Memory pressure events: ${result.memoryPressureEvents}`);
  }
  
  return ogResults;
}