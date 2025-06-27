/**
 * Shared S3 Key Generator
 *
 * Consistent S3 key generation for various asset types
 */

import { IMAGE_S3_PATHS, OPENGRAPH_METADATA_S3_DIR } from "@/lib/constants";
import { generateHash } from "./hash-utils";
import { getExtensionFromContentType } from "./content-type";
import type { S3KeyOptions } from "@/types/s3-cdn";

/**
 * Generate consistent S3 keys for different asset types
 */
export function generateS3Key(options: S3KeyOptions): string {
  const { type, domain, source, url, hash, extension = "png", inverted, variant } = options;

  switch (type) {
    case "logo": {
      if (!domain) throw new Error("Domain required for logo S3 key");

      const normalizedDomain = domain.replace(/[^a-zA-Z0-9.-]/g, "_");
      const sourceAbbrev = source === "duckduckgo" ? "ddg" : source || "unknown";
      const domainHash = hash || generateHash(domain);

      const parts: string[] = [IMAGE_S3_PATHS.LOGOS_DIR];
      if (inverted) parts.push("inverted");

      const filename = [normalizedDomain, sourceAbbrev, domainHash.slice(0, 8)].join("_");

      return `${parts.join("/")}/${filename}.${extension}`;
    }

    case "opengraph": {
      if (!url) throw new Error("URL required for opengraph S3 key");
      const urlHash = hash || generateHash(url);
      return `${OPENGRAPH_METADATA_S3_DIR}/${urlHash}.json`;
    }

    case "image": {
      if (!url) throw new Error("URL required for image S3 key");
      const urlHash = hash || generateHash(url);

      const parts = ["images"];
      if (variant) parts.push(variant);
      if (inverted) parts.push("inverted");

      return `${parts.join("/")}/${urlHash.slice(0, 16)}.${extension}`;
    }

    case "avatar": {
      if (!url) throw new Error("URL required for avatar S3 key");
      const urlHash = hash || generateHash(url);
      return `images/avatars/${urlHash.slice(0, 12)}.${extension}`;
    }

    case "banner": {
      if (!url) throw new Error("URL required for banner S3 key");
      const urlHash = hash || generateHash(url);
      return `images/banners/${urlHash.slice(0, 12)}.${extension}`;
    }

    default: {
      // eslint-disable-next-line @typescript-eslint/naming-convention
      const _exhaustiveCheck: never = type;
      throw new Error(`Unknown S3 key type: ${String(_exhaustiveCheck)}`);
    }
  }
}

// Hash generation is now imported from hash-utils.ts

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
 * Parse S3 key to extract metadata
 */
export function parseS3Key(key: string): import("@/types/s3-cdn").ParsedS3Key {
  // Logo pattern: logos/[inverted/]domain_source_hash.ext
  if (key.includes("/logos/") || key.includes("/logo/")) {
    const inverted = key.includes("/inverted/");
    const filename = key.split("/").pop()?.split(".")[0];
    if (filename?.includes("_")) {
      const parts = filename.split("_");
      return {
        type: "logo",
        domain: parts[0],
        source: parts[1] === "ddg" ? "duckduckgo" : parts[1],
        hash: parts[2],
        extension: key.split(".").pop(),
        inverted,
      };
    }
  }

  // OpenGraph pattern: opengraph-metadata/hash.json
  if (key.includes("opengraph-metadata/")) {
    return {
      type: "opengraph",
      hash: key.split("/").pop()?.split(".")[0],
      extension: "json",
    };
  }

  // Avatar pattern: images/avatars/hash.ext
  if (key.includes("images/avatars/")) {
    return {
      type: "avatar",
      hash: key.split("/").pop()?.split(".")[0],
      extension: key.split(".").pop(),
    };
  }

  // Banner pattern: images/banners/hash.ext
  if (key.includes("images/banners/")) {
    return {
      type: "banner",
      hash: key.split("/").pop()?.split(".")[0],
      extension: key.split(".").pop(),
    };
  }

  // Generic image
  if (key.startsWith("images/")) {
    return {
      type: "image",
      hash: key.split("/").pop()?.split(".")[0],
      extension: key.split(".").pop(),
      inverted: key.includes("/inverted/"),
    };
  }

  return { type: "unknown" };
}
