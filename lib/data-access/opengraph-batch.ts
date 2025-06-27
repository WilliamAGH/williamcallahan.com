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
import { OPENGRAPH_METADATA_S3_DIR, OPENGRAPH_CACHE_DURATION } from "@/lib/constants";
import { fetchExternalOpenGraphWithRetry } from "@/lib/opengraph/fetch";
import { createFallbackResult } from "@/lib/opengraph/fallback";
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
  const s3Key = `${OPENGRAPH_METADATA_S3_DIR}/${urlHash}.json`;

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
  } = {}
): Promise<Map<string, OgResult>> {
  const results = new Map<string, OgResult>();
  const total = urls.length;
  
  for (let i = 0; i < urls.length; i++) {
    const item = urls[i];
    if (!item) continue;
    
    const { url, fallback } = item;
    
    try {
      const result = await getOpenGraphDataBatch(url, fallback, options.forceRefresh);
      results.set(url, result);
    } catch {
      console.error(`[OpenGraph Batch] Failed to process ${url}`);
      results.set(url, createFallbackResult(url, "Processing failed", fallback));
    }
    
    // Report progress
    if (options.onProgress && (i + 1) % 10 === 0) {
      options.onProgress(i + 1, total);
    }
    
    // Small delay to avoid rate limiting
    if (i < urls.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  
  return results;
}