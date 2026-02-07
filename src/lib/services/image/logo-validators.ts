/**
 * Logo validation and analysis logic
 * @module lib/services/image/logo-validators
 */

import { ServerCacheInstance } from "@/lib/server-cache";
import { getDeterministicTimestamp } from "@/lib/utils/deterministic-timestamp";
import { getBufferHash } from "@/lib/utils/hash-utils";
import { extractBasicImageMeta } from "@/lib/image-handling/image-metadata";
import { analyzeImage } from "@/lib/image-handling/image-analysis";
import { processImageBuffer as sharedProcessImageBuffer } from "@/lib/image-handling/shared-image-processing";
import { fetchWithTimeout } from "@/lib/utils/http-client";
import { getBaseUrl } from "@/lib/utils/get-base-url";
import { isDebug } from "@/lib/utils/debug";
import { UNIFIED_IMAGE_SERVICE_CONFIG } from "@/lib/constants";
import logger from "@/lib/utils/logger";

import type { LogoSource, LogoInversion } from "@/types/logo";
import type { LogoValidationResult } from "@/types/cache";
import { LogoValidationResponseSchema } from "@/types/schemas/logo-validation";

const CONFIG = UNIFIED_IMAGE_SERVICE_CONFIG;

/**
 * Logo validation and analysis service
 */
export class LogoValidators {
  private readonly isReadOnly: boolean;

  constructor(isReadOnly: boolean) {
    this.isReadOnly = isReadOnly;
  }

  /**
   * Validate logo buffer and check for globe icon
   */
  async validateLogo(buffer: Buffer): Promise<LogoValidationResult> {
    const bufferHash = getBufferHash(buffer);
    const cached = ServerCacheInstance.getLogoValidation(bufferHash);
    if (cached) return cached;

    // First check basic validation
    const isBasicValid = await this.validateLogoBuffer(buffer, "");
    if (!isBasicValid) {
      ServerCacheInstance.setLogoValidation(bufferHash, true); // It's a globe/invalid
      return { isGlobeIcon: true, timestamp: getDeterministicTimestamp() };
    }

    // Import analysis functions
    const { isBlankOrPlaceholder } = await import("@/lib/image-handling/image-analysis");
    const blankCheck = await isBlankOrPlaceholder(buffer);

    const isGlobeIcon = blankCheck.isBlank || blankCheck.isGlobe;
    ServerCacheInstance.setLogoValidation(bufferHash, isGlobeIcon);
    return { isGlobeIcon, timestamp: getDeterministicTimestamp() };
  }

  /**
   * Basic validation of logo buffer dimensions and aspect ratio
   */
  async validateLogoBuffer(buffer: Buffer, url: string): Promise<boolean> {
    // keep function asynchronous for potential future async validation
    await Promise.resolve();
    if (this.isReadOnly) return true;
    try {
      const metadata = await extractBasicImageMeta(buffer);
      return Boolean(
        metadata.width &&
        metadata.height &&
        metadata.width >= CONFIG.MIN_LOGO_SIZE &&
        metadata.height >= CONFIG.MIN_LOGO_SIZE &&
        Math.abs(metadata.width / metadata.height - 1) < CONFIG.ASPECT_RATIO_TOLERANCE,
      );
    } catch (error) {
      logger.error("[LogoValidators] Logo validation failed", error, { url });
      return false;
    }
  }

  /**
   * Analyze logo for inversion requirements
   */
  async analyzeLogo(buffer: Buffer, url: string): Promise<LogoInversion> {
    const cacheKey = `${url}-${getBufferHash(buffer)}`;
    const cached = ServerCacheInstance.getLogoAnalysis(cacheKey);
    if (cached) return cached;
    const analysis = await analyzeImage(buffer);
    ServerCacheInstance.setLogoAnalysis(cacheKey, analysis);
    return analysis;
  }

  /**
   * Check if a fetched logo is a generic globe icon via validation API
   */
  async checkIfGlobeIcon(
    rawBuffer: Buffer,
    url: string,
    response: Response,
    testDomain: string,
    name: LogoSource,
  ): Promise<boolean> {
    const baseUrl = getBaseUrl();
    if (!baseUrl || process.env.NEXT_PHASE?.includes("build")) return false;
    try {
      const formData = new FormData();
      const contentType = response.headers.get("content-type");
      formData.append(
        "image",
        new Blob([new Uint8Array(rawBuffer)], { type: contentType ?? "application/octet-stream" }),
        "logo-to-validate",
      );
      formData.append("url", url);
      const validateResponse = await fetchWithTimeout(
        new URL("/api/validate-logo", baseUrl).toString(),
        {
          method: "POST",
          body: formData,
          timeout: 5000,
        },
      );
      if (validateResponse.ok) {
        const rawData = await validateResponse.json();
        const parsed = LogoValidationResponseSchema.safeParse(rawData);
        if (!parsed.success) {
          logger.error("[LogoValidators] Invalid validation response", parsed.error);
          return false;
        }
        const { isGlobeIcon } = parsed.data;
        if (isGlobeIcon) {
          if (isDebug)
            logger.debug(`[LogoValidators] ${name} detected as globe icon for ${testDomain}`);
          return true;
        }
      }
    } catch (validateError) {
      if (isDebug)
        logger.debug(`[LogoValidators] validate-logo API error for ${testDomain}`, {
          validateError,
        });
    }
    return false;
  }

  /**
   * Process image buffer (resize, optimize)
   */
  async processImageBuffer(
    buffer: Buffer,
  ): Promise<{ processedBuffer: Buffer; isSvg: boolean; contentType: string }> {
    return sharedProcessImageBuffer(buffer, "LogoValidators");
  }
}
