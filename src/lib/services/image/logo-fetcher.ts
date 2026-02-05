/**
 * External logo fetching and source prioritization
 * @module lib/services/image/logo-fetcher
 */

import { ServerCacheInstance } from "@/lib/server-cache";
import { getDeterministicTimestamp } from "@/lib/utils/deterministic-timestamp";
import { generateS3Key } from "@/lib/utils/hash-utils";
import { getDomainVariants } from "@/lib/utils/domain-utils";
import { UNIFIED_IMAGE_SERVICE_CONFIG } from "@/lib/constants";
import { fetchBinary, DEFAULT_IMAGE_HEADERS, getBrowserHeaders } from "@/lib/utils/http-client";
import { safeStringifyValue, isRetryableError } from "@/lib/utils/error-utils";
import { getExtensionFromContentType, DEFAULT_IMAGE_CONTENT_TYPE } from "@/lib/utils/content-type";
import { extractBasicImageMeta } from "@/lib/image-handling/image-metadata";
import { isDebug } from "@/lib/utils/debug";
import { logoDebugger } from "@/lib/utils/logo-debug";
import logger from "@/lib/utils/logger";
import { getLogoSourcePriority } from "@/lib/services/image/logo-source-priority";

import type { LogoSource, LogoInversion } from "@/types/logo";
import type { ExternalFetchResult } from "@/types/image";
import type { LogoFetchResult } from "@/types/cache";
import type { LogoValidators } from "./logo-validators";
import type { S3Operations } from "./s3-operations";
import type { SessionManager } from "./session-manager";

const CONFIG = UNIFIED_IMAGE_SERVICE_CONFIG;

/**
 * External logo fetching service
 */
export class LogoFetcher {
  private readonly isReadOnly: boolean;
  private readonly devStreamImagesToS3: boolean;
  private validators: LogoValidators;
  private s3Ops: S3Operations;
  private sessionMgr: SessionManager;

  constructor(
    isReadOnly: boolean,
    devStreamImagesToS3: boolean,
    validators: LogoValidators,
    s3Ops: S3Operations,
    sessionMgr: SessionManager,
  ) {
    this.isReadOnly = isReadOnly;
    this.devStreamImagesToS3 = devStreamImagesToS3;
    this.validators = validators;
    this.s3Ops = s3Ops;
    this.sessionMgr = sessionMgr;
  }

  /**
   * Get file extension from content type, defaulting to "png"
   */
  getLogoExtension(contentType?: string | null): string {
    return getExtensionFromContentType(contentType || DEFAULT_IMAGE_CONTENT_TYPE);
  }

  /**
   * Generate S3 key for logo storage with consistent parameters
   */
  generateLogoS3Key(
    domain: string,
    source: LogoSource,
    options: { url?: string | null; extension?: string; inverted?: boolean } = {},
  ): string {
    const ext = options.extension ?? "png";
    return generateS3Key({
      type: "logo",
      domain,
      source,
      url: options.url || `https://${domain}/logo.${ext}`,
      extension: ext,
      inverted: options.inverted,
    });
  }

  /**
   * Build a LogoFetchResult with standard fields populated
   */
  buildLogoFetchResult(
    domain: string,
    options: {
      s3Key?: string;
      url?: string | null;
      source: LogoSource | null;
      contentType?: string;
      isValid?: boolean;
      isGlobeIcon?: boolean;
      error?: string;
    },
  ): LogoFetchResult {
    return {
      domain,
      s3Key: options.s3Key,
      cdnUrl: options.s3Key ? this.s3Ops.getCdnUrl(options.s3Key) || undefined : undefined,
      url: options.url ?? undefined,
      source: options.source,
      contentType: options.contentType ?? "image/png",
      timestamp: getDeterministicTimestamp(),
      isValid: options.isValid ?? false,
      isGlobeIcon: options.isGlobeIcon,
      error: options.error,
    };
  }

  /**
   * Cache result and log debug info, then return the result
   */
  finalizeLogoResult(result: LogoFetchResult): LogoFetchResult {
    if (result.domain) ServerCacheInstance.setLogoFetch(result.domain, result);
    if (result.isValid) {
      logoDebugger.setFinalResult(
        result.domain ?? "",
        true,
        result.source ?? undefined,
        result.s3Key,
        result.cdnUrl,
      );
    } else {
      logoDebugger.setFinalResult(result.domain ?? "", false);
    }
    logoDebugger.printDebugInfo(result.domain ?? "");
    return result;
  }

  /**
   * Fetch logo from external sources
   */
  async fetchExternalLogo(domain: string): Promise<ExternalFetchResult | null> {
    if (await this.sessionMgr.shouldSkipDomain(domain)) {
      logger.debug(`Domain ${domain} is permanently blocked or in cooldown, skipping`, {
        service: "LogoFetcher",
      });
      logoDebugger.logAttempt(
        domain,
        "external-fetch",
        "Domain is blocked or in cooldown",
        "failed",
      );
      return null;
    }
    if (this.sessionMgr.hasDomainFailedTooManyTimes(domain)) {
      logger.debug(`Domain ${domain} has failed too many times in this session, skipping`, {
        service: "LogoFetcher",
      });
      logoDebugger.logAttempt(
        domain,
        "external-fetch",
        "Domain has failed too many times",
        "failed",
      );
      return null;
    }
    const domainVariants = getDomainVariants(domain);
    const sources = getLogoSourcePriority();

    for (const testDomain of domainVariants) {
      for (const { name, urlFn, size } of sources) {
        const result = await this.tryFetchLogo(testDomain, name, urlFn, size, domain);
        if (result) {
          // Success - remove from failure tracker if it was there
          this.sessionMgr.removeDomainFailure(domain);
          logoDebugger.logAttempt(
            domain,
            "external-fetch",
            `Successfully fetched from ${name} (${size})`,
            "success",
          );
          return result;
        }
      }
    }
    this.sessionMgr.markDomainAsFailed(domain);
    // Save failure tracker periodically
    await this.sessionMgr.saveFailureTracker();
    return null;
  }

  /**
   * Try to fetch logo from a specific source
   */
  private async tryFetchLogo(
    testDomain: string,
    name: LogoSource,
    urlFn: (d: string) => string,
    size: string,
    originalDomain: string,
  ): Promise<ExternalFetchResult | null> {
    const url = urlFn(testDomain);
    try {
      if (isDebug) logger.debug(`[LogoFetcher] Attempting ${name} (${size}) fetch: ${url}`);
      logoDebugger.logAttempt(
        originalDomain,
        "external-fetch",
        `Trying ${name} (${size}): ${url}`,
        "success",
      );

      const fetchOptions = {
        headers: { ...DEFAULT_IMAGE_HEADERS, ...getBrowserHeaders() },
        timeout: name === "direct" ? 10000 : CONFIG.LOGO_FETCH_TIMEOUT,
      };

      // Use fetchBinary which includes proper error handling and content type detection
      const { buffer: rawBuffer, contentType: responseContentType } = await fetchBinary(url, {
        ...fetchOptions,
        validateAsLogo: true,
      });
      if (isDebug) logger.debug(`[LogoFetcher] ${name} (${size}) fetched successfully for ${url}`);
      if (!rawBuffer || rawBuffer.byteLength < CONFIG.MIN_BUFFER_SIZE) {
        if (isDebug)
          logger.debug(
            `[LogoFetcher] ${name} (${size}) buffer too small: ${rawBuffer?.byteLength || 0} bytes for ${testDomain}`,
          );
        return null;
      }

      const mockResponse = {
        headers: new Map([["content-type", responseContentType]]),
      } as unknown as Response;

      // In streaming mode for dev, skip globe detection and validation; return raw buffer
      if (this.devStreamImagesToS3) {
        logger.info(
          `[LogoFetcher] (dev-stream) Using raw logo for ${originalDomain} from ${name} (${size})`,
        );
        return { buffer: rawBuffer, source: name, contentType: responseContentType, url };
      }

      if (await this.validators.checkIfGlobeIcon(rawBuffer, url, mockResponse, testDomain, name))
        return null;

      if (await this.validators.validateLogoBuffer(rawBuffer, url)) {
        const { processedBuffer, contentType } =
          await this.validators.processImageBuffer(rawBuffer);
        logger.info(
          `[LogoFetcher] Fetched logo for ${originalDomain} from ${name} (${size}) using ${testDomain}`,
        );
        return { buffer: processedBuffer, source: name, contentType, url };
      }

      if (isDebug) {
        const meta = await extractBasicImageMeta(rawBuffer);
        logger.debug(
          `[LogoFetcher] ${name} (${size}) validation failed for ${testDomain}: ${meta.width}x${meta.height} (${meta.format})`,
        );
      }
    } catch (error) {
      // Direct fetches have different error patterns - be more forgiving
      if (name === "direct") {
        const errorMessage = safeStringifyValue(error);
        if (
          errorMessage.includes("ENOTFOUND") ||
          errorMessage.includes("ECONNREFUSED") ||
          errorMessage.includes("ETIMEDOUT") ||
          errorMessage.includes("certificate") ||
          errorMessage.includes("SSL") ||
          errorMessage.includes("404") ||
          errorMessage.includes("403")
        ) {
          if (isDebug)
            logger.debug(`Expected error for direct fetch from ${testDomain}`, {
              service: "LogoFetcher",
              error: errorMessage,
            });
          logoDebugger.logAttempt(
            originalDomain,
            "external-fetch",
            `Direct fetch failed: ${errorMessage}`,
            "failed",
          );
          return null;
        }
      }

      // Use isRetryableError to check if this error is worth retrying
      if (!isRetryableError(error)) {
        logger.warn(
          `Non-retryable error fetching logo for ${testDomain} from ${name} (${size}) at ${url}`,
          {
            service: "LogoFetcher",
            error: safeStringifyValue(error),
          },
        );
      }
      logoDebugger.logAttempt(
        originalDomain,
        "external-fetch",
        `${name} fetch error: ${safeStringifyValue(error)}`,
        "failed",
      );
    }
    return null;
  }

  /**
   * Invert logo buffer (dark-theme variant) and persist to S3
   */
  async invertLogo(
    buffer: Buffer,
    domain: string,
  ): Promise<{ buffer?: Buffer; analysis?: LogoInversion; cdnUrl?: string }> {
    try {
      // Import dynamically to avoid cost when not needed
      const { invertLogoBuffer } = await import("@/lib/image-handling/invert-logo");

      // Run analysis & inversion in parallel where possible
      const analysisPromise = this.validators.analyzeLogo(buffer, domain);
      const inversionPromise = invertLogoBuffer(buffer, "LogoFetcher.invertLogo");

      const [analysis, inverted] = await Promise.all([analysisPromise, inversionPromise]);

      const invertedBuffer = inverted.buffer;
      if (!invertedBuffer || invertedBuffer.length === 0) {
        return { buffer: buffer, analysis }; // Fallback – return original buffer
      }

      // Persist inverted logo to dedicated S3 path for cache-friendly retrieval
      const extension = getExtensionFromContentType(
        inverted.contentType || DEFAULT_IMAGE_CONTENT_TYPE,
      );
      const s3Key = `images/logos/inverted/${domain}.${extension}`;

      if (!this.isReadOnly) {
        await this.s3Ops.uploadToS3(s3Key, invertedBuffer, inverted.contentType);
      }

      const cdnUrl = this.s3Ops.getCdnUrl(s3Key);

      return { buffer: invertedBuffer, analysis, cdnUrl };
    } catch (error) {
      logger.error(`[LogoFetcher] Failed to invert logo`, error, { domain });
      return {};
    }
  }
}
