/**
 * Logo Batch Data Access
 * 
 * Simplified logo fetching for batch operations (data-updater)
 * Bypasses all runtime caches and focuses on S3 persistence
 * 
 * @module data-access/logos-batch
 */

import type { LogoResult, LogoSource } from "@/types/logo";
import { writeBinaryS3, checkIfS3ObjectExists } from "@/lib/s3-utils";
import { getDomainVariants, normalizeDomain } from "@/lib/utils/domain-utils";
import { LOGO_SOURCES, LOGO_BLOCKLIST_S3_PATH } from "@/lib/constants";
import { FailureTracker } from "@/lib/utils/failure-tracker";
import { generateS3Key, getFileExtension } from "@/lib/utils/s3-key-generator";
import { fetchBinary } from "@/lib/utils/http-client";
import { BatchProcessor, BatchProgressReporter } from "@/lib/batch-processing";

// Initialize failure tracker for domains
const domainFailureTracker = new FailureTracker<string>(
  (domain) => domain,
  {
    s3Path: LOGO_BLOCKLIST_S3_PATH,
    maxRetries: 3,
    cooldownMs: 24 * 60 * 60 * 1000, // 24 hours
    name: 'LogoDomainTracker',
  }
);

/**
 * Batch-optimized logo fetching
 * Simple flow: Check S3 → Check failed cache → Fetch if missing → Store to S3
 */
export async function getLogoBatch(domain: string): Promise<LogoResult> {
  const normalizedDomain = normalizeDomain(domain);
  const cdnUrl = process.env.NEXT_PUBLIC_S3_CDN_URL || '';
  
  // Check if domain should be skipped due to previous failures
  if (await domainFailureTracker.shouldSkip(normalizedDomain)) {
    return {
      url: null,
      source: null,
      error: "Domain marked as permanently failed or in cooldown period",
      contentType: "image/png",
    };
  }
  
  // Check all domain variants for existing logos in S3
  const variants = getDomainVariants(normalizedDomain);
  
  // Check for existing logos in S3
  for (const variant of variants) {
    for (const source of ['google', 'duckduckgo'] as LogoSource[]) {
      // Check common image formats
      for (const ext of ['png', 'jpg', 'jpeg', 'svg', 'webp']) {
        const s3Key = generateS3Key({
          type: 'logo',
          domain: variant,
          source,
          extension: ext,
        });
        const exists = await checkIfS3ObjectExists(s3Key);
        if (exists) {
          return {
            url: `${cdnUrl}/${s3Key}`,
            source,
            error: undefined,
            contentType: ext === 'svg' ? 'image/svg+xml' : `image/${ext}`,
          };
        }
      }
    }
  }
  
  // Fetch from external sources
  for (const variant of variants) {
    const sources: Array<{ name: LogoSource; url: string }> = [
      { name: "google", url: LOGO_SOURCES.google.hd(variant) },
      { name: "duckduckgo", url: LOGO_SOURCES.duckduckgo.hd(variant) },
    ];
    
    for (const { name, url } of sources) {
      try {
        const { buffer, contentType } = await fetchBinary(url, {
          timeout: 5000,
          userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        });
        
        const ext = getFileExtension(url, contentType);
        
        // Store to S3
        const s3Key = generateS3Key({
          type: 'logo',
          domain: normalizedDomain,
          source: name,
          extension: ext,
        });
        await writeBinaryS3(s3Key, buffer, contentType);
        
        // Success - remove from failure tracker if it was there
        domainFailureTracker.removeFailure(normalizedDomain);
        
        return {
          url: `${cdnUrl}/${s3Key}`,
          source: name,
          error: undefined,
          contentType,
        };
      } catch (error) {
        // Handle timeout gracefully
        if (error instanceof Error && error.name === 'AbortError') {
          console.log(`[Logo Batch] Timeout fetching ${name} logo for ${variant}`);
        }
        // Continue to next source
      }
    }
  }
  
  // No logo found - record the failure
  await domainFailureTracker.recordFailure(normalizedDomain, "No logo found from any source");
  
  return {
    url: null,
    source: null,
    error: "No logo found from any source",
    contentType: "image/png",
  };
}

/**
 * Process multiple domains in batch with progress logging
 */
export async function processLogoBatch(
  domains: string[],
  options: {
    onProgress?: (current: number, total: number) => void;
    batchSize?: number;
  } = {}
): Promise<Map<string, LogoResult>> {
  // Create progress reporter
  const progressReporter = new BatchProgressReporter('Logo Batch');
  
  // Create batch processor
  const processor = new BatchProcessor<string, LogoResult>(
    'logo-batch',
    async (domain) => getLogoBatch(domain),
    {
      batchSize: options.batchSize || 10,
      batchDelay: 500, // Rate limit protection
      memoryThreshold: 0.8,
      timeout: 30000,
      onProgress: options.onProgress || progressReporter.createProgressHandler(),
      debug: true,
    }
  );
  
  // Process the batch
  const result = await processor.processBatch(domains);
  
  // Convert result format
  const logoResults = new Map<string, LogoResult>();
  
  // Add successful results
  for (const [domain, logoResult] of result.successful) {
    logoResults.set(domain, logoResult);
  }
  
  // Add failed results
  for (const [domain, error] of result.failed) {
    logoResults.set(domain, {
      url: null,
      source: null,
      error: error.message,
      contentType: "image/png",
    });
  }
  
  // Add skipped results (due to memory pressure)
  for (const domain of result.skipped) {
    logoResults.set(domain, {
      url: null,
      source: null,
      error: "Skipped due to memory pressure",
      contentType: "image/png",
    });
  }
  
  // Save failed domains at the end
  await domainFailureTracker.save();
  
  // Log summary
  console.log(`[Logo Batch] Completed in ${result.totalTime}ms`);
  console.log(`[Logo Batch] Success: ${result.successful.size}, Failed: ${result.failed.size}, Skipped: ${result.skipped.length}`);
  if (result.memoryPressureEvents > 0) {
    console.log(`[Logo Batch] Memory pressure events: ${result.memoryPressureEvents}`);
  }
  
  return logoResults;
}