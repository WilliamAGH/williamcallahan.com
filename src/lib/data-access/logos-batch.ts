/**
 * Logo Batch Data Access
 *
 * Simplified logo fetching for batch operations (data-updater)
 * Bypasses all runtime caches and focuses on S3 persistence
 *
 * @module data-access/logos-batch
 */

import type { LogoResult, LogoSource } from "@/types/logo";
import { writeBinaryS3, checkIfS3ObjectExists, listS3Objects } from "@/lib/s3-utils";
import { getS3CdnUrl } from "@/lib/utils/cdn-utils";
import { getDomainVariants, normalizeDomain } from "@/lib/utils/domain-utils";
import { LOGO_SOURCES, LOGO_BLOCKLIST_S3_PATH } from "@/lib/constants";
import { FailureTracker } from "@/lib/utils/failure-tracker";
import { generateS3Key, getFileExtension } from "@/lib/utils/hash-utils";
import { BatchProcessor, BatchProgressReporter } from "@/lib/batch-processing";
import { Readable } from "node:stream";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";

// Initialize failure tracker for domains
const domainFailureTracker = new FailureTracker<string>(domain => domain, {
  s3Path: LOGO_BLOCKLIST_S3_PATH,
  maxRetries: 3,
  cooldownMs: 24 * 60 * 60 * 1000, // 24 hours
  name: "LogoDomainTracker",
});

/**
 * Batch-optimized logo fetching
 * Simple flow: Check S3 → Check failed cache → Fetch if missing → Store to S3
 */
export async function getLogoBatch(domain: string): Promise<LogoResult> {
  const normalizedDomain = normalizeDomain(domain);
  const cdnUrl = getS3CdnUrl();

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
  const sources = ["google", "duckduckgo"] as LogoSource[];
  const extensions = ["png", "jpg", "jpeg", "svg", "webp"];

  // Generate all possible S3 keys to check
  const keysToCheck: Array<{
    key: string;
    variant: string;
    source: LogoSource;
    ext: string;
  }> = [];

  for (const variant of variants) {
    for (const source of sources) {
      for (const ext of extensions) {
        keysToCheck.push({
          key: generateS3Key({
            type: "logo",
            domain: variant,
            source,
            extension: ext,
          }),
          variant,
          source,
          ext,
        });
      }
    }
  }

  // Check S3 keys in batches for better performance
  const batchSize = 10;
  for (let i = 0; i < keysToCheck.length; i += batchSize) {
    const batch = keysToCheck.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map(async ({ key, source, ext }) => ({
        exists: await checkIfS3ObjectExists(key),
        key,
        source,
        ext,
      })),
    );

    // Return first found result
    const found = results.find(r => r.exists);
    if (found) {
      return {
        url: `${cdnUrl}/${found.key}`,
        source: found.source,
        error: undefined,
        contentType: found.ext === "svg" ? "image/svg+xml" : `image/${found.ext}`,
      };
    }
  }

  // If no hashed files found, check for legacy files (without hashes) - same logic as runtime process
  try {
    const { findLegacyLogoKey, parseS3Key } = await import("@/lib/utils/hash-utils");

    const legacyKey = await findLegacyLogoKey(normalizedDomain, listS3Objects);

    if (legacyKey) {
      console.log(`[Logo Batch] Found existing legacy logo for ${normalizedDomain}: ${legacyKey}`);

      // Extract metadata from legacy key
      const parsed = parseS3Key(legacyKey);
      const source = (parsed.source || "unknown") as LogoSource;
      const ext = parsed.extension || "png";
      const contentType = ext === "svg" ? "image/svg+xml" : ext === "ico" ? "image/x-icon" : `image/${ext}`;

      // For batch operations, we return the legacy key as-is without migration
      // Migration will happen during runtime requests if needed
      return {
        url: `${cdnUrl}/${legacyKey}`,
        source,
        error: undefined,
        contentType,
      };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.log(`[Logo Batch] Error checking for legacy logos: ${errorMessage}`);
  }

  // Fetch from external sources
  for (const variant of variants) {
    // Type-safe access to LOGO_SOURCES with proper null checks
    const googleSources = LOGO_SOURCES.google;
    const duckduckgoSources = LOGO_SOURCES.duckduckgo;

    const sources: Array<{ name: LogoSource; url: string }> = [];

    // Only add sources if they exist
    if (googleSources?.hd) {
      sources.push({ name: "google", url: googleSources.hd(variant) });
    }
    if (duckduckgoSources?.hd) {
      sources.push({ name: "duckduckgo", url: duckduckgoSources.hd(variant) });
    }

    for (const { name, url } of sources) {
      try {
        // Set up 5-second timeout via AbortController (Bun/standard fetch has no 'timeout' option)
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 5000);

        const res = await fetch(url, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko)",
          },
          signal: controller.signal,
        });

        clearTimeout(timer);

        if (!res.ok || !res.body) {
          throw new Error(`HTTP ${res.status} fetching ${url}`);
        }

        const contentType = res.headers.get("content-type") ?? "image/png";
        const ext = getFileExtension(url, contentType);

        // Store to S3 streaming
        const s3Key = generateS3Key({
          type: "logo",
          domain: normalizedDomain,
          source: name,
          extension: ext,
        });

        /*
         * Convert the WHATWG ReadableStream returned by fetch() into a Node.js
         * stream without buffering the entire payload.  The generic parameter
         * is omitted to satisfy @types/node expectations.
         */
        const nodeStream = Readable.fromWeb(res.body as unknown as NodeReadableStream);
        await writeBinaryS3(s3Key, nodeStream, contentType);

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
        if (error instanceof Error && error.name === "AbortError") {
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
  } = {},
): Promise<Map<string, LogoResult>> {
  // Create progress reporter
  const progressReporter = new BatchProgressReporter("Logo Batch");

  // Create batch processor
  const processor = new BatchProcessor<string, LogoResult>("logo-batch", async domain => getLogoBatch(domain), {
    batchSize: options.batchSize || 10,
    batchDelay: 500, // Rate limit protection
    memoryThreshold: 0.8,
    timeout: 30000,
    onProgress: options.onProgress || progressReporter.createProgressHandler(),
    debug: true,
  });

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
  console.log(
    `[Logo Batch] Success: ${result.successful.size}, Failed: ${result.failed.size}, Skipped: ${result.skipped.length}`,
  );
  if (result.memoryPressureEvents > 0) {
    console.log(`[Logo Batch] Memory pressure events: ${result.memoryPressureEvents}`);
  }

  return logoResults;
}
