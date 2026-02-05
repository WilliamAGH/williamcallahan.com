/**
 * Logo Persistence Utilities
 * @module lib/services/image/logo-persistence
 * @description
 * Functions for persisting logos to S3 with validation and inversion.
 * Extracted from unified-image-service for SRP compliance per [MO1d].
 */

import { ServerCacheInstance } from "@/lib/server-cache";
import { getDeterministicTimestamp } from "@/lib/utils/deterministic-timestamp";
import { DEFAULT_IMAGE_CONTENT_TYPE } from "@/lib/utils/content-type";
import { safeStringifyValue } from "@/lib/utils/error-utils";
import { logoDebugger } from "@/lib/utils/logo-debug";
import type { LogoFetchResult } from "@/types/cache";
import type {
  LogoPersistenceConfig,
  ExternalLogoData,
  LogoPersistenceOptions,
} from "@/types/image";

/**
 * Persist logo in streaming mode (skip validation/inversion).
 * Used in development for faster iteration.
 */
export async function persistStreamingLogo(
  domain: string,
  logoData: ExternalLogoData,
  config: LogoPersistenceConfig,
): Promise<LogoFetchResult> {
  const { isReadOnly, s3Ops, logoFetcher } = config;
  const ext = logoFetcher.getLogoExtension(logoData.contentType);
  const s3Key = logoFetcher.generateLogoS3Key(domain, logoData.source, {
    url: logoData.url,
    extension: ext,
  });

  if (!isReadOnly) {
    await s3Ops.uploadToS3(
      s3Key,
      logoData.buffer,
      logoData.contentType || DEFAULT_IMAGE_CONTENT_TYPE,
    );
  }

  const result = logoFetcher.buildLogoFetchResult(domain, {
    s3Key,
    url: logoData.url,
    source: logoData.source,
    contentType: logoData.contentType ?? undefined,
    isValid: true,
  });
  return logoFetcher.finalizeLogoResult(result);
}

/**
 * Validate logo and persist with optional inversion.
 * Performs full validation pipeline before storage.
 */
export async function validateAndPersistLogo(
  domain: string,
  logoData: ExternalLogoData,
  options: LogoPersistenceOptions,
  config: LogoPersistenceConfig,
): Promise<LogoFetchResult> {
  const { isReadOnly, validators, s3Ops, logoFetcher, getCdnUrl } = config;

  const validation = await validators.validateLogo(logoData.buffer);
  const isValid = !validation.isGlobeIcon;
  let finalBuffer = logoData.buffer;
  const ext = logoFetcher.getLogoExtension(logoData.contentType);

  // Start with base S3 key (non-inverted)
  let s3Key = logoFetcher.generateLogoS3Key(domain, logoData.source, {
    url: logoData.url,
    extension: ext,
  });

  // Attempt inversion if requested and logo is valid
  if (isValid && options.invertColors) {
    const inverted = await logoFetcher.invertLogo(logoData.buffer, domain);
    if (inverted.buffer) {
      finalBuffer = inverted.buffer;
      s3Key = logoFetcher.generateLogoS3Key(domain, logoData.source, {
        url: logoData.url,
        extension: ext,
        inverted: true,
      });
      ServerCacheInstance.setInvertedLogo(domain, {
        s3Key,
        cdnUrl: getCdnUrl(s3Key) || undefined,
        analysis: inverted.analysis || {
          needsDarkInversion: false,
          needsLightInversion: false,
          hasTransparency: false,
          brightness: 0.5,
          format: "png",
          dimensions: { width: 0, height: 0 },
        },
        contentType: logoData.contentType || DEFAULT_IMAGE_CONTENT_TYPE,
      });
    }
  }

  if (!isReadOnly) {
    await s3Ops.uploadToS3(s3Key, finalBuffer, logoData.contentType || DEFAULT_IMAGE_CONTENT_TYPE);
  }

  const result = logoFetcher.buildLogoFetchResult(domain, {
    s3Key,
    url: logoData.url,
    source: logoData.source,
    contentType: logoData.contentType ?? undefined,
    isValid,
    isGlobeIcon: validation.isGlobeIcon,
  });
  return logoFetcher.finalizeLogoResult(result);
}

/**
 * Fetch logo from external sources and persist to S3.
 * Orchestrates the full fetch → validate → persist pipeline.
 */
export async function fetchAndPersistExternalLogo(
  domain: string,
  options: LogoPersistenceOptions,
  config: LogoPersistenceConfig,
): Promise<LogoFetchResult> {
  const { devStreamImagesToS3, logoFetcher } = config;

  try {
    const logoData = await logoFetcher.fetchExternalLogo(domain);
    if (!logoData?.buffer) {
      logoDebugger.logAttempt(domain, "external-fetch", "All external sources failed", "failed");
      throw new Error("No logo found");
    }

    // In streaming mode for dev: skip heavy validation/inversion
    if (devStreamImagesToS3) {
      return persistStreamingLogo(domain, logoData, config);
    }

    return validateAndPersistLogo(domain, logoData, options, config);
  } catch (error) {
    const errorResult = logoFetcher.buildLogoFetchResult(domain, {
      source: null,
      error: safeStringifyValue(error),
    });
    return logoFetcher.finalizeLogoResult(errorResult);
  }
}

/**
 * Build result when logo not found in read-only mode.
 */
export function buildReadOnlyMissingResult(domain: string, isDev: boolean): LogoFetchResult {
  if (isDev) {
    // Note: import logger dynamically to avoid circular deps
    console.info(`[UnifiedImageService] Read-only: logo not found in CDN for domain '${domain}'`);
  }
  return {
    domain,
    source: null,
    contentType: DEFAULT_IMAGE_CONTENT_TYPE,
    error: "Logo not available in CDN (fetch required at runtime)",
    timestamp: getDeterministicTimestamp(),
    isValid: false,
  };
}

/**
 * Build result when memory pressure prevents logo processing.
 */
export function buildMemoryPressureResult(domain: string): LogoFetchResult {
  return {
    domain,
    source: null,
    contentType: DEFAULT_IMAGE_CONTENT_TYPE,
    error: "Insufficient memory to process logo request",
    timestamp: getDeterministicTimestamp(),
    isValid: false,
  };
}
