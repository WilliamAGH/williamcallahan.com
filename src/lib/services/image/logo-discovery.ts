/**
 * Logo Discovery Utilities
 * @module lib/services/image/logo-discovery
 * @description
 * Functions for discovering existing logos in S3 (hashed and legacy formats).
 * Extracted from unified-image-service for SRP compliance per [MO1d].
 */

import { checkIfS3ObjectExists, listS3Objects, deleteFromS3 } from "@/lib/s3/objects";
import { readBinaryS3, writeBinaryS3 } from "@/lib/s3/binary";
import {
  generateS3Key,
  parseS3Key,
  findLegacyLogoKey,
  hashAndArchiveManualLogo,
} from "@/lib/utils/hash-utils";
import { getContentTypeFromExtension, IMAGE_EXTENSIONS } from "@/lib/utils/content-type";
import logger from "@/lib/utils/logger";
import type { LogoSource } from "@/types/logo";
import type { LogoFetchResult, LogoResultBuilder } from "@/types/cache";

/** Standard logo sources to check when discovering existing logos */
const LOGO_SOURCES: LogoSource[] = ["direct", "google", "duckduckgo", "clearbit"];

/**
 * Search for an existing hashed logo in S3.
 * Checks all combinations of logo sources and image extensions.
 *
 * @param domain - The domain to search logos for
 * @param buildResult - Callback to build the LogoFetchResult
 * @returns LogoFetchResult if found, null otherwise
 */
export async function findExistingHashedLogo(
  domain: string,
  buildResult: LogoResultBuilder,
): Promise<LogoFetchResult | null> {
  for (const source of LOGO_SOURCES) {
    for (const extension of IMAGE_EXTENSIONS) {
      const hashedKey = generateS3Key({
        type: "logo",
        domain,
        source,
        extension,
      });

      const exists = await checkIfS3ObjectExists(hashedKey);
      if (exists) {
        logger.info(`[LogoDiscovery] Found existing hashed logo: ${hashedKey}`);
        return buildResult(domain, {
          s3Key: hashedKey,
          source,
          contentType: getContentTypeFromExtension(extension),
          isValid: true,
        });
      }
    }
  }
  return null;
}

/**
 * Search for a legacy (non-hashed) logo and optionally migrate it.
 * Legacy logos use old naming conventions without content hashes.
 *
 * @param domain - The domain to search logos for
 * @param isReadOnly - Whether the service is in read-only mode (skip migration)
 * @param buildResult - Callback to build the LogoFetchResult
 * @returns LogoFetchResult if found, null otherwise
 */
export async function findAndMigrateLegacyLogo(
  domain: string,
  isReadOnly: boolean,
  buildResult: LogoResultBuilder,
): Promise<LogoFetchResult | null> {
  const legacyKey = await findLegacyLogoKey(domain, listS3Objects);

  if (!legacyKey) {
    return null;
  }

  logger.info(`[LogoDiscovery] Found existing legacy logo: ${legacyKey}`);

  // Extract metadata from key
  const parsed = parseS3Key(legacyKey);
  const source = parsed.source as LogoSource;
  const ext = parsed.extension || "png";
  const contentType = getContentTypeFromExtension(ext);

  let finalKey = legacyKey;

  // Migrate legacy logo to hashed format if not read-only
  if (!parsed.hash && !isReadOnly) {
    const migrated = await hashAndArchiveManualLogo(domain, {
      listS3Objects,
      readBinaryS3,
      writeBinaryS3,
      deleteFromS3,
    });
    if (migrated) {
      finalKey = migrated;
      logger.info(`[LogoDiscovery] Manual logo migrated → ${migrated}`);
    }
  }

  return buildResult(domain, {
    s3Key: finalKey,
    source,
    contentType,
    isValid: true,
  });
}
