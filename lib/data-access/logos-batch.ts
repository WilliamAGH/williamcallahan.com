/**
 * Logo Batch Data Access
 * 
 * Simplified logo fetching for batch operations (data-updater)
 * Bypasses all runtime caches and focuses on S3 persistence
 * 
 * @module data-access/logos-batch
 */

import type { LogoResult, LogoSource } from "@/types/logo";
import { writeBinaryS3, checkIfS3ObjectExists, readJsonS3, writeJsonS3 } from "@/lib/s3-utils";
import { getDomainVariants, normalizeDomain } from "@/lib/utils/domain-utils";
import { createHash } from "node:crypto";
import { LOGO_SOURCES, LOGO_BLOCKLIST_S3_PATH, IMAGE_S3_PATHS } from "@/lib/constants";

// In-memory cache for current session
const sessionFailedDomains = new Map<string, {
  domain: string;
  attempts: number;
  lastAttempt: number;
  permanentFailure?: boolean;
}>();
const FAILED_DOMAINS_S3_PATH = LOGO_BLOCKLIST_S3_PATH;
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours
let failedDomainsLoaded = false;

/**
 * Load failed domains list from S3
 */
async function loadFailedDomains(): Promise<void> {
  if (failedDomainsLoaded) return;
  
  try {
    const data = await readJsonS3<Record<string, {
      domain: string;
      attempts: number;
      lastAttempt: number;
      permanentFailure?: boolean;
    }>>(FAILED_DOMAINS_S3_PATH);
    if (data && typeof data === 'object') {
      Object.entries(data).forEach(([domain, entry]) => {
        sessionFailedDomains.set(domain, entry);
      });
    }
    failedDomainsLoaded = true;
  } catch {
    // File doesn't exist yet, that's fine
    failedDomainsLoaded = true;
  }
}

/**
 * Save failed domains list to S3
 */
async function saveFailedDomains(): Promise<void> {
  try {
    const data: Record<string, {
      domain: string;
      attempts: number;
      lastAttempt: number;
      permanentFailure?: boolean;
    }> = {};
    sessionFailedDomains.forEach((entry, domain) => {
      data[domain] = entry;
    });
    await writeJsonS3(FAILED_DOMAINS_S3_PATH, data);
  } catch (error) {
    console.error("[Logo Batch] Failed to save failed domains list:", error);
  }
}

/**
 * Check if domain should be skipped due to previous failures
 */
async function shouldSkipDomain(domain: string): Promise<boolean> {
  await loadFailedDomains();
  
  const entry = sessionFailedDomains.get(domain);
  if (!entry) return false;
  
  // Skip permanently failed domains
  if (entry.permanentFailure) return true;
  
  // Skip if max attempts reached and still in cooldown period
  if (entry.attempts >= MAX_RETRY_ATTEMPTS) {
    const timeSinceLastAttempt = Date.now() - entry.lastAttempt;
    if (timeSinceLastAttempt < RETRY_COOLDOWN_MS) {
      return true;
    }
  }
  
  return false;
}

/**
 * Record a failed domain attempt
 */
async function recordFailedDomain(domain: string): Promise<void> {
  await loadFailedDomains();
  
  const existing = sessionFailedDomains.get(domain);
  const entry = existing ? {
    ...existing,
    attempts: existing.attempts + 1,
    lastAttempt: Date.now(),
  } : {
    domain,
    attempts: 1,
    lastAttempt: Date.now(),
  };
  
  // Mark as permanent failure after too many attempts
  if (entry.attempts >= MAX_RETRY_ATTEMPTS * 2) {
    entry.permanentFailure = true;
  }
  
  sessionFailedDomains.set(domain, entry);
  
  // Save to S3 periodically (every 10 failed domains)
  if (sessionFailedDomains.size % 10 === 0) {
    await saveFailedDomains();
  }
}

/**
 * Batch-optimized logo fetching
 * Simple flow: Check S3 → Check failed cache → Fetch if missing → Store to S3
 */
export async function getLogoBatch(domain: string): Promise<LogoResult> {
  const normalizedDomain = normalizeDomain(domain);
  const domainHash = createHash("sha256").update(normalizedDomain).digest("hex").substring(0, 8);
  const cdnUrl = process.env.NEXT_PUBLIC_S3_CDN_URL || '';
  
  // Check if domain should be skipped due to previous failures
  if (await shouldSkipDomain(normalizedDomain)) {
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
    for (const source of ['google', 'duckduckgo']) {
      // Check common image formats
      for (const ext of ['png', 'jpg', 'jpeg', 'svg', 'webp']) {
        const s3Key = `${IMAGE_S3_PATHS.LOGOS_DIR}/${variant}_${source}_${domainHash}.${ext}`;
        const exists = await checkIfS3ObjectExists(s3Key);
        if (exists) {
          return {
            url: `${cdnUrl}/${s3Key}`,
            source: source as LogoSource,
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
        const response = await fetch(url, {
          signal: AbortSignal.timeout(5000),
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          },
        });
        
        if (response.ok) {
          const buffer = Buffer.from(await response.arrayBuffer());
          const contentType = response.headers.get('content-type') || 'image/png';
          const ext = contentType.split('/')[1] || 'png';
          
          // Store to S3
          const s3Key = `${IMAGE_S3_PATHS.LOGOS_DIR}/${normalizedDomain}_${name}_${domainHash}.${ext}`;
          await writeBinaryS3(s3Key, buffer, contentType);
          
          return {
            url: `${cdnUrl}/${s3Key}`,
            source: name,
            error: undefined,
            contentType,
          };
        }
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
  await recordFailedDomain(normalizedDomain);
  
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
  const results = new Map<string, LogoResult>();
  const total = domains.length;
  const batchSize = options.batchSize || 10;
  
  // Process in batches
  for (let i = 0; i < domains.length; i += batchSize) {
    const batch = domains.slice(i, i + batchSize);
    
    // Process batch concurrently
    const batchPromises = batch.map(async (domain) => {
      try {
        const result = await getLogoBatch(domain);
        results.set(domain, result);
      } catch (error) {
        // Extract just the error message to avoid trace dumps
        const errorMessage = error instanceof Error ? error.message : "Processing failed";
        
        // Only log non-timeout errors or use simplified message for timeouts
        if (errorMessage.includes("timed out")) {
          console.warn(`[Logo Batch] Timeout processing ${domain}`);
        } else {
          console.error(`[Logo Batch] Failed to process ${domain}: ${errorMessage}`);
        }
        
        results.set(domain, {
          url: null,
          source: null,
          error: errorMessage,
          contentType: "image/png",
        });
      }
    });
    
    await Promise.all(batchPromises);
    
    // Report progress
    const processed = Math.min(i + batchSize, total);
    if (options.onProgress) {
      options.onProgress(processed, total);
    }
    console.log(`[Logo Batch] Progress: ${processed}/${total} domains processed`);
    
    // Small delay between batches to avoid rate limiting
    if (i + batchSize < domains.length) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  
  // Save failed domains at the end of batch processing
  await saveFailedDomains();
  
  return results;
}