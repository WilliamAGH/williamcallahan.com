/**
 * Hash and S3 Key Generation Utilities
 *
 * Centralized, consistent functions for hashing, cache keys, S3 key generation,
 * and key parsing across the application.
 */

import { createHash } from "node:crypto";
import { IMAGE_S3_PATHS, OPENGRAPH_METADATA_S3_DIR } from "@/lib/constants";
import { getExtensionFromContentType } from "./content-type";
import { extractTld } from "./url-utils";
import type { S3KeyOptions } from "@/types/s3-cdn";
import type { LogoSource } from "@/types/logo";

// =============================================================================
// HASHING FUNCTIONS
// =============================================================================

/**
 * Generate SHA-256 hash from string input
 * Returns full hex string (64 characters)
 */
export function generateHash(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

/**
 * Generate hash from Buffer (for file content hashing)
 * Useful for deduplication and cache keys
 */
export function getBufferHash(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

/**
 * Generate cache key from multiple inputs
 * Filters out falsy values and joins with delimiter
 */
export function getCacheKey(inputs: (string | number | boolean | undefined | null)[], delimiter = ":"): string {
  const filtered = inputs.filter(Boolean);
  const combined = filtered.join(delimiter);
  return generateHash(combined);
}

/**
 * Generate a short hash (first N characters)
 * Useful for file naming where full hash is too long
 */
export function getShortHash(input: string, length = 8): string {
  return generateHash(input).substring(0, length);
}

/**
 * Generate hash with prefix for easier identification
 * e.g., 'img_a1b2c3d4' or 'cache_e5f6g7h8'
 */
export function getPrefixedHash(input: string, prefix: string, length = 8): string {
  const hash = generateHash(input).substring(0, length);
  return `${prefix}_${hash}`;
}

/**
 * Check if two buffers have the same content by comparing hashes
 * More efficient than direct buffer comparison for large buffers
 */
export function buffersMatch(buffer1: Buffer, buffer2: Buffer): boolean {
  // Quick length check first
  if (buffer1.length !== buffer2.length) return false;

  // Compare hashes for efficiency
  return getBufferHash(buffer1) === getBufferHash(buffer2);
}

/**
 * Generate deterministic hash for object
 * Sorts keys to ensure consistent hashing regardless of property order
 */
export function getObjectHash(obj: Record<string, unknown>): string {
  const sortedJson = JSON.stringify(obj, Object.keys(obj).toSorted());
  return generateHash(sortedJson);
}

/**
 * Generate hash for file path + modification time
 * Useful for cache invalidation based on file changes
 */
export function getFileHash(filePath: string, mtime?: Date | number): string {
  const mtimeStr = mtime ? new Date(mtime).toISOString() : "";
  return generateHash(`${filePath}:${mtimeStr}`);
}

/**
 * Extract file extension from URL or content type
 */
export function getFileExtension(url?: string, contentType?: string): string {
  // Try URL first
  if (url) {
    const match = url.match(/\.([a-zA-Z0-9]+)$/);
    if (match?.[1]) return match[1].toLowerCase();
  }

  // Fall back to content type
  if (contentType) {
    return getExtensionFromContentType(contentType);
  }

  return "png";
}

/**
 * Generate a consistent S3 key for an OpenGraph image.
 * Uses an 8-character hash of the bookmark URL and ID.
 *
 * @param url - The original URL of the bookmarked page.
 * @param bookmarkId - The unique ID of the bookmark.
 * @param extension - The file extension of the image.
 * @returns The full S3 key for the OpenGraph image.
 */
export function generateOpenGraphImageKey(url: string, bookmarkId: string, extension: string): string {
  const hash = getShortHash(`${url}:${bookmarkId}`);
  // Sanitize the domain from the URL to create a clean filename
  const domain = new URL(url).hostname.replace(/^www\./, "").replace(/\./g, "-");
  const filename = `${domain}-${hash}.${extension}`;
  return `${IMAGE_S3_PATHS.OPENGRAPH_DIR}/${filename}`;
}

// =============================================================================
// S3 KEY GENERATION
// =============================================================================

/**
 * Generate consistent S3 keys for different asset types.
 */
export function generateS3Key(options: S3KeyOptions): string {
  const { type, domain, source, url, hash, extension = "png", inverted } = options;

  switch (type) {
    case "logo": {
      if (!domain) throw new Error("Domain required for logo S3 key");
      const { name, tld } = extractTld(domain);
      if (!tld) throw new Error(`Invalid domain format: ${domain}`);
      const domainName = name.replace(/\./g, "_");
      const tldName = tld.replace(/\./g, "_");
      const sourceStr = source === "duckduckgo" ? "ddg" : source || "unknown";
      const domainHash = hash || getShortHash(domain);
      const filename = `${domainName}_${tldName}_${sourceStr}_${domainHash}`;
      const parts: string[] = [IMAGE_S3_PATHS.LOGOS_DIR];
      if (inverted) parts.push("inverted");
      return `${parts.join("/")}/${filename}.${extension}`;
    }
    case "opengraph": {
      if (!url) throw new Error("URL required for opengraph S3 key");
      const urlHash = hash || getShortHash(url);
      return `${OPENGRAPH_METADATA_S3_DIR}/${urlHash}.json`;
    }
    case "image":
    case "avatar":
    case "banner": {
      if (!url) throw new Error("URL required for this image type S3 key");
      const imageHash = hash || generateHash(url);
      const parts = ["images", type];
      if (inverted) parts.push("inverted");
      return `${parts.join("/")}/${imageHash.slice(0, 16)}.${extension}`;
    }
    default: {
      const exhaustiveCheck: never = type;
      throw new Error(`Unknown S3 key type: ${String(exhaustiveCheck)}`);
    }
  }
}

// =============================================================================
// S3 KEY PARSING
// =============================================================================

/**
 * Parse S3 key to extract metadata.
 * Supports both new hashed format and legacy (hashless) format.
 */
export function parseS3Key(key: string): import("@/types/s3-cdn").ParsedS3Key {
  if (key.includes("/logos/") || key.includes("/logo/")) {
    const inverted = key.includes("/inverted/");
    const filename = key.split("/").pop()?.split(".")[0];
    if (filename?.includes("_")) {
      const parts = filename.split("_");
      const hash = parts[parts.length - 1];
      const source = parts[parts.length - 2];
      const isValidHash = hash ? /^[a-f0-9]{8}$/i.test(hash) : false;

      if (isValidHash && source) {
        const domainAndTldParts = parts.slice(0, -2);
        const tld = domainAndTldParts.pop() || "";
        const domainName = domainAndTldParts.join(".");
        const domain = `${domainName}.${tld}`;
        return {
          type: "logo",
          domain,
          source: source === "ddg" ? "duckduckgo" : source,
          hash,
          extension: key.split(".").pop(),
          inverted,
        };
      } else {
        // Legacy format
        const sourcePart = parts[parts.length - 1];
        const knownSources = ["google", "ddg", "duckduckgo", "clearbit", "direct", "unknown"];
        const hasSource = sourcePart && knownSources.includes(sourcePart);
        const domainAndTldParts = hasSource ? parts.slice(0, -1) : parts;
        const tld = domainAndTldParts.pop() || "";
        const domainName = domainAndTldParts.join(".");
        const domain = `${domainName}.${tld}`;
        return {
          type: "logo",
          domain,
          source: hasSource ? (sourcePart === "ddg" ? "duckduckgo" : sourcePart) : "unknown",
          hash: undefined,
          extension: key.split(".").pop(),
          inverted,
        };
      }
    }
  }

  if (key.includes("opengraph-metadata/")) {
    return {
      type: "opengraph",
      hash: key.split("/").pop()?.split(".")[0],
      extension: "json",
    };
  }

  return { type: "unknown" };
}

// =============================================================================
// LOGO MIGRATION HELPERS
// =============================================================================

/**
 * Type guard to verify a string is a valid LogoSource.
 */
const isLogoSource = (value: unknown): value is LogoSource => {
  return typeof value === "string" && ["google", "duckduckgo", "clearbit", "direct", "unknown"].includes(value);
};

/**
 * Safely gets a LogoSource from an unknown value.
 */
const getLogoSourceSafe = (value: unknown): LogoSource => (isLogoSource(value) ? value : "unknown");

/**
 * Finds the first legacy (hashless) logo key for a given domain.
 */
export async function findLegacyLogoKey(
  domain: string,
  listS3Objects: (prefix: string) => Promise<string[]>,
): Promise<string | null> {
  const prefix = `${IMAGE_S3_PATHS.LOGOS_DIR}/`;
  const keys = await listS3Objects(prefix);
  return (
    keys.find(key => {
      const parsed = parseS3Key(key);
      return parsed.type === "logo" && parsed.domain === domain && !parsed.hash;
    }) || null
  );
}

/**
 * Migrates a manually-added, hashless logo to the standard hashed format.
 */
export async function hashAndArchiveManualLogo(
  domain: string,
  s3Utils: {
    listS3Objects: (prefix: string) => Promise<string[]>;
    readBinaryS3: (key: string) => Promise<Buffer | null>;
    writeBinaryS3: (key: string, data: Buffer, contentType: string) => Promise<void>;
    deleteFromS3: (key: string) => Promise<void>;
  },
): Promise<string | null> {
  try {
    const candidateKey = await findLegacyLogoKey(domain, s3Utils.listS3Objects);
    if (!candidateKey) return null;

    const buffer = await s3Utils.readBinaryS3(candidateKey);
    if (!buffer) return null;

    const parsedCandidate = parseS3Key(candidateKey);
    const source = getLogoSourceSafe(parsedCandidate.source);
    const ext = parsedCandidate.extension || getExtensionFromContentType("image/png");

    const newKey = generateS3Key({
      type: "logo",
      domain,
      source,
      extension: ext,
    });

    await s3Utils.writeBinaryS3(newKey, buffer, `image/${ext === "svg" ? "svg+xml" : ext}`);

    const archiveKey = `${IMAGE_S3_PATHS.LOGOS_DIR}/archive/${candidateKey.split("/").pop()}`;
    await s3Utils.writeBinaryS3(archiveKey, buffer, `image/${ext === "svg" ? "svg+xml" : ext}`);
    await s3Utils.deleteFromS3(candidateKey);

    console.log(`[LogoHashMigrator] Migrated manual logo ${candidateKey} → ${newKey}`);
    return newKey;
  } catch (err: unknown) {
    console.error("[LogoHashMigrator] migration error:", err instanceof Error ? err : new Error(String(err)));
    return null;
  }
}
