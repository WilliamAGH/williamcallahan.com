/**
 * Logo data access layer - FACADE for UnifiedImageService
 *
 * This module now acts as a facade, delegating all operations to UnifiedImageService
 * while maintaining backward compatibility for existing code.
 *
 * Flow: UnifiedImageService → Memory cache → S3 → External APIs
 * Storage: S3 with CDN delivery
 *
 * @module lib/data-access/logos
 */

import { revalidateTag } from "next/cache";
import { getUnifiedImageService } from "@/lib/services/unified-image-service";
import { ServerCacheInstance, getDeterministicTimestamp } from "@/lib/server-cache";
import type { LogoResult, LogoInversion, LogoData } from "@/types/logo";
import type { LogoValidationResult } from "@/types/cache";
import { USE_NEXTJS_CACHE } from "@/lib/cache";
import { buildCdnUrl, getCdnConfigFromEnv } from "@/lib/utils/cdn-utils";

// Type assertions for Next.js cache functions to fix ESLint errors
const safeRevalidateTag = revalidateTag as (tag: string) => void;

/**
 * Resets logo session tracking by clearing the server cache.
 * This forces fresh fetches on next request.
 */
export function resetLogoSessionTracking(): void {
  ServerCacheInstance.clearAllLogoFetches();
  console.debug("[Logos] Logo cache cleared, forcing fresh fetches");
}

/**
 * Invalidates the S3 store for logos, forcing fresh fetches on next request.
 * This is a placeholder for actual cache invalidation logic if needed.
 */
export function invalidateLogoS3Cache(): void {
  // Currently a no-op or can be implemented with a cache-busting mechanism if needed
  console.debug("[Logos] S3 logo cache invalidated (placeholder operation)");
}

export async function getLogo(domain: string): Promise<LogoResult | null> {
  const imageService = getUnifiedImageService();

  try {
    // Delegate to UnifiedImageService
    const logoResult = await imageService.getLogo(domain);

    if (logoResult.error) {
      console.error(`[Logos] Failed to get logo for domain ${domain}: ${logoResult.error}`);
      // Return error information in the result for better debugging
      return {
        s3Key: undefined,
        url: null,
        cdnUrl: undefined,
        source: null,
        retrieval: "api",
        error: logoResult.error,
        contentType: "image/png",
        timestamp: getDeterministicTimestamp(),
      };
    }

    // Guarantee cdnUrl when we have an s3Key
    const resolvedCdnUrl =
      logoResult.cdnUrl || (logoResult.s3Key ? buildCdnUrl(logoResult.s3Key, getCdnConfigFromEnv()) : undefined);

    const result: LogoResult = {
      s3Key: logoResult.s3Key,
      url: resolvedCdnUrl ?? logoResult.url,
      cdnUrl: resolvedCdnUrl,
      source: logoResult.source || null,
      retrieval: logoResult.s3Key ? "s3-store" : logoResult.source ? "external" : "api",
      contentType: logoResult.contentType || "image/png",
      timestamp: logoResult.timestamp,
    };

    // No longer fetch buffers - serve directly from CDN

    // Invalidate cache for this domain if we fetched new data
    if (USE_NEXTJS_CACHE && !logoResult.s3Key) {
      safeRevalidateTag(`logo-${domain}`);
      console.info(`[Logos] Cache invalidated for domain: ${domain}`);
    }

    return result;
  } catch (error) {
    // Extract just the error message to avoid trace dumps
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[Logos] Error getting logo for domain ${domain}: ${errorMessage}`);
    return null;
  }
}

/**
 * Resolve a CDN-safe logo URL directly via UnifiedImageService without using the API proxy.
 * Returns null when no persistent asset exists.
 */
export async function getLogoCdnData(domain: string): Promise<LogoData | null> {
  if (!domain) {
    return null;
  }

  const result = await getLogo(domain);
  if (!result) {
    return null;
  }

  const resolvedUrl = result.cdnUrl ?? result.url ?? null;
  if (!resolvedUrl) {
    return null;
  }

  return {
    url: resolvedUrl,
    source: result.source ?? null,
    needsInversion: result.inversion?.needsDarkInversion ?? false,
  };
}

/**
 * Invalidate all logo cache entries
 */
export function invalidateLogoCache(): void {
  if (USE_NEXTJS_CACHE) {
    safeRevalidateTag("logos");
    console.info("[Logos] Cache invalidated for all logos");
  } else {
    // Legacy: clear memory cache
    ServerCacheInstance.clearAllLogoFetches();
    console.info("[Logos] Legacy cache cleared for all logos");
  }
}

/**
 * Build a runtime logo fetch URL that proxies through the `/api/logo` route.
 * This is used when a CDN/manifest hit is unavailable during build-time rendering.
 */
export function getRuntimeLogoUrl(
  domain: string | null | undefined,
  options: { company?: string | null; forceRefresh?: boolean } = {},
): string | null {
  const normalizedDomain = domain?.trim();
  if (!normalizedDomain) {
    return null;
  }

  const params = new URLSearchParams();
  params.set("website", normalizedDomain);
  params.set("domain", normalizedDomain);

  const { company, forceRefresh = true } = options;
  if (company && company.trim().length > 0) {
    params.set("company", company.trim());
  }

  if (forceRefresh) {
    params.set("forceRefresh", "true");
  }

  return `/api/logo?${params.toString()}`;
}

/**
 * Get logo validation - delegates to ServerCache for backward compatibility
 */
export function getLogoValidation(imageHash: string): LogoValidationResult | null {
  // Direct delegation to ServerCache - UnifiedImageService handles validation internally
  return ServerCacheInstance.getLogoValidation(imageHash) || null;
}

/**
 * Set logo validation with Next.js cache invalidation when enabled
 */
export function setLogoValidation(imageHash: string, isGlobeIcon: boolean): void {
  // Set validation in cache

  if (USE_NEXTJS_CACHE) {
    // Store in ServerCache for immediate access
    ServerCacheInstance.setLogoValidation(imageHash, isGlobeIcon);

    // Invalidate Next.js cache to trigger re-fetch on next access
    safeRevalidateTag(`logo-validation-${imageHash}`);
    safeRevalidateTag("logo-validations");
  } else {
    // Legacy: only use ServerCache
    ServerCacheInstance.setLogoValidation(imageHash, isGlobeIcon);
  }
}

/**
 * Get logo analysis - delegates to ServerCache for backward compatibility
 */
export function getLogoAnalysis(cacheKey: string): LogoInversion | null {
  // Direct delegation to ServerCache - UnifiedImageService handles analysis internally
  return ServerCacheInstance.getLogoAnalysis(cacheKey) || null;
}

/**
 * Set logo analysis with Next.js cache invalidation when enabled
 */
export function setLogoAnalysis(cacheKey: string, analysis: LogoInversion): void {
  if (USE_NEXTJS_CACHE) {
    // Store in ServerCache for immediate access
    ServerCacheInstance.setLogoAnalysis(cacheKey, analysis);

    // Invalidate Next.js cache to trigger re-fetch on next access
    safeRevalidateTag(`logo-analysis-${cacheKey}`);
    safeRevalidateTag("logo-analyzes");
  } else {
    // Legacy: only use ServerCache
    ServerCacheInstance.setLogoAnalysis(cacheKey, analysis);
  }
}
