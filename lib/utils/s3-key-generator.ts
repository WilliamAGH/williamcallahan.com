/**
 * Shared S3 Key Generator
 *
 * Consistent S3 key generation for various asset types
 */

import { IMAGE_S3_PATHS, OPENGRAPH_METADATA_S3_DIR } from "@/lib/constants";
import { generateHash, getShortHash } from "./hash-utils";
import { getExtensionFromContentType } from "./content-type";
import { extractTld, extractDomain } from "./url-utils";
import type { S3KeyOptions } from "@/types/s3-cdn";

/**
 * Generate consistent S3 keys for different asset types
 */
export function generateS3Key(options: S3KeyOptions): string {
  const { type, domain, source, url, hash, extension = "png", inverted, variant } = options;

  switch (type) {
    case "logo": {
      if (!domain) throw new Error("Domain required for logo S3 key");

      // Use the enhanced TLD extraction that handles complex TLDs
      const { name, tld } = extractTld(domain);
      if (!tld) {
        throw new Error(`Invalid domain format: ${domain}`);
      }

      // Convert dots to underscores in both name and TLD for filename
      const domainName = name.replace(/\./g, "_");
      const tldName = tld.replace(/\./g, "_"); // e.g., co.uk -> co_uk

      // Standardize source name (duckduckgo -> ddg)
      const sourceStr = source === "duckduckgo" ? "ddg" : source || "unknown";

      // Use SHA256 hash (first 8 chars) of full domain
      const domainHash = hash || generateHash(domain).slice(0, 8);

      // Standard format: domain_tld_source_hash.ext
      const filename = `${domainName}_${tldName}_${sourceStr}_${domainHash}`;

      const parts: string[] = [IMAGE_S3_PATHS.LOGOS_DIR];
      if (inverted) parts.push("inverted");

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
  // Logo pattern: logos/[inverted/]domain_tld_source_hash.ext
  if (key.includes("/logos/") || key.includes("/logo/")) {
    const inverted = key.includes("/inverted/");
    const filename = key.split("/").pop()?.split(".")[0];
    if (filename?.includes("_")) {
      const parts = filename.split("_");

      // Expected format: domain_tld_source_hash or domain_complex_tld_source_hash
      // We need at least 4 parts (domain, tld/tld_part, source, hash)
      if (parts.length >= 4) {
        // Extract hash and source from the end
        const hash = parts[parts.length - 1];
        const source = parts[parts.length - 2];

        // Check if hash looks valid (8 hex chars)
        const isValidHash = hash ? /^[a-f0-9]{8}$/i.test(hash) : false;

        if (isValidHash) {
          // Everything before source and hash is the domain + tld
          const domainAndTldParts = parts.slice(0, -2);

          // Try to reconstruct the domain with complex TLD support
          // Check if last 2 parts might be a complex TLD like co_uk
          let domain: string;
          if (domainAndTldParts.length >= 3) {
            const secondToLast = domainAndTldParts[domainAndTldParts.length - 2];
            const last = domainAndTldParts[domainAndTldParts.length - 1];
            if (!secondToLast || !last) {
              // Not enough parts
              const tld = domainAndTldParts[domainAndTldParts.length - 1] || "";
              const domainName = domainAndTldParts.slice(0, -1).join(".");
              domain = `${domainName}.${tld}`;
            } else {
              const possibleComplexTld = `${secondToLast}.${last}`;
              // Check if this forms a known complex TLD when dots are restored
              const { tld: checkTld } = extractTld(`test.${possibleComplexTld}`);
              if (checkTld === possibleComplexTld) {
                // It's a complex TLD
                const domainName = domainAndTldParts.slice(0, -2).join(".");
                domain = `${domainName}.${possibleComplexTld}`;
              } else {
                // Simple TLD
                const tld = domainAndTldParts[domainAndTldParts.length - 1] || "";
                const domainName = domainAndTldParts.slice(0, -1).join(".");
                domain = `${domainName}.${tld}`;
              }
            }
          } else {
            // Simple case: domain_tld
            const tld = domainAndTldParts[domainAndTldParts.length - 1] || "";
            const domainName = domainAndTldParts.slice(0, -1).join(".");
            domain = `${domainName}.${tld}`;
          }

          return {
            type: "logo",
            domain,
            source: source === "ddg" ? "duckduckgo" : source,
            hash,
            extension: key.split(".").pop(),
            inverted,
          };
        }
      }

      // Try parsing without hash (legacy or manual files)
      // Format: domain_tld_source or just domain_tld
      if (parts.length >= 2) {
        // Check if last part is a known source
        const lastPart = parts[parts.length - 1];
        const knownSources = ["google", "ddg", "duckduckgo", "clearbit", "direct", "unknown"];
        let source: string = "unknown";
        let domainAndTldParts = parts;

        if (lastPart && knownSources.includes(lastPart)) {
          source = lastPart;
          domainAndTldParts = parts.slice(0, -1);
        }

        // Try to reconstruct domain
        if (domainAndTldParts.length >= 2) {
          const tld = domainAndTldParts[domainAndTldParts.length - 1] || "";
          const domainName = domainAndTldParts.slice(0, -1).join(".");
          const domain = `${domainName}.${tld}`;

          const normalizedSource = source === "ddg" ? "duckduckgo" : source;
          return {
            type: "logo",
            domain,
            source: normalizedSource,
            hash: undefined, // No hash in filename
            extension: key.split(".").pop(),
            inverted,
          };
        }
      }
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

/**
 * Generate a deterministic key from an arbitrary company/institution name.
 * Combines a slugified version of the name with a short hash to virtually
 * eliminate collisions while keeping keys human-readable (e.g. "stanford_university_a1b2c3").
 */
export function generateNameKey(name: string, hashLength = 6): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  const shortHash = getShortHash(name, hashLength);
  return `${slug}_${shortHash}`;
}

/**
 * Convenience helper: add a name → domain association to a mapping object.
 * Ensures key is generated via `generateNameKey` and domain is normalised.
 */
export function appendNameKeyDomain(map: Record<string, string>, name?: string, url?: string): void {
  if (!name || !url) return;

  const domain = extractDomain(url).replace(/^www\./, "");
  if (!domain) return;

  const key = generateNameKey(name);
  if (!key) return;

  // Prevent accidental overwrite when key already exists with same domain
  if (map[key] && map[key] !== domain) {
    let suffix = 1;
    let uniqueKey = `${key}_${suffix}`;
    while (map[uniqueKey] && map[uniqueKey] !== domain) {
      uniqueKey = `${key}_${++suffix}`;
    }
    map[uniqueKey] = domain;
  } else {
    map[key] = domain;
  }
}
