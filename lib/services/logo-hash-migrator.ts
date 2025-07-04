import { listS3Objects, readBinaryS3, writeBinaryS3, deleteFromS3 } from "@/lib/s3-utils";
import { generateS3Key, parseS3Key } from "@/lib/utils/s3-key-generator";
import { getExtensionFromContentType } from "@/lib/utils/content-type";
import { IMAGE_S3_PATHS } from "@/lib/constants";
import type { LogoSource } from "@/types/logo";

// Type guard to verify a string is a valid LogoSource
const isLogoSource = (value: unknown): value is LogoSource => {
  return typeof value === "string" && ["google", "duckduckgo", "clearbit", "direct", "unknown"].includes(value);
};

const getLogoSourceSafe = (value: unknown): LogoSource => (isLogoSource(value) ? value : "unknown");

/**
 * Scan images/logos/ for manually-added files using the pattern
 * `{domain}_{tld}_{source?}.{ext}` (no hash). When found:
 *   1. Copy to the deterministic hashed key via generateS3Key
 *   2. Move the original to images/logos/archive/
 *   3. Ensure ACL is public-read via writeBinaryS3 (it already defaults)
 *
 * Returns the new S3 key if a migration occurred, otherwise null.
 */
export async function hashAndArchiveManualLogo(domain: string): Promise<string | null> {
  try {
    // Narrow the S3 list to just this domain for efficiency
    const prefix = `${IMAGE_S3_PATHS.LOGOS_DIR}/`;
    const keys = await listS3Objects(prefix);

    // Cache the parsed result to avoid parsing the same key twice
    const candidateInfo = keys
      .map((k) => ({ key: k, parsed: parseS3Key(k) }))
      .find(({ key, parsed }) => {
        return (
          key.toLowerCase().startsWith(prefix) && parsed.type === "logo" && parsed.domain === domain && !parsed.hash
        );
      });

    if (!candidateInfo) return null; // nothing to migrate

    const { key: candidate, parsed: parsedCandidate } = candidateInfo;

    let buffer: Buffer;
    try {
      const rawBuffer = await readBinaryS3(candidate);
      if (!(rawBuffer instanceof Buffer)) {
        console.warn(`[LogoHashMigrator] readBinaryS3 returned non-Buffer for ${candidate}`);
        return null;
      }
      buffer = rawBuffer;
    } catch (readError: unknown) {
      if (readError instanceof Error) {
        console.error(`[LogoHashMigrator] Failed to read ${candidate}:`, readError.message);
      } else {
        console.error(`[LogoHashMigrator] Failed to read ${candidate}:`, String(readError));
      }
      return null;
    }

    const source: LogoSource = getLogoSourceSafe(parsedCandidate.source);

    let ext: string;
    if (typeof parsedCandidate.extension === "string") {
      ext = parsedCandidate.extension;
    } else {
      ext = getExtensionFromContentType("image/png");
    }

    const newKey = generateS3Key({
      type: "logo",
      domain,
      source,
      url: `https://${domain}/favicon.${ext}`,
      extension: ext,
    });

    // 1. copy to hashed key
    await writeBinaryS3(newKey, buffer, `image/${ext === "svg" ? "svg+xml" : ext}`);

    // 2. move original into archive/ (copy + delete)
    const archiveKey = `${IMAGE_S3_PATHS.LOGOS_DIR}/archive/${candidate.split("/").pop()}`;
    await writeBinaryS3(archiveKey, buffer, `image/${ext}`);
    await deleteFromS3(candidate);

    console.log(`[LogoHashMigrator] Migrated manual logo ${candidate} → ${newKey}`);
    return newKey;
  } catch (err: unknown) {
    if (err instanceof Error) {
      console.error("[LogoHashMigrator] migration error:", err);
    } else {
      console.error("[LogoHashMigrator] migration error:", new Error(String(err)));
    }
    return null;
  }
}

/**
 * Locate the first legacy logo key for a given domain. A "legacy" logo is
 * defined as a file inside images/logos/ that matches the pattern
 * `{domain}_{tld}_{source?}.{ext}` **without** the deterministic hash segment.
 *
 * The search is intentionally narrow (single prefix) to avoid expensive full
 * directory scans. Returns the key (string) or null if no match.
 */
export async function findLegacyLogoKey(domain: string): Promise<string | null> {
  const { extractTld } = await import("@/lib/utils/url-utils");

  const { name: domainNameWithDots, tld } = extractTld(domain);
  const domainName = domainNameWithDots.replace(/\./g, "_");
  const tldName = tld.replace(/\./g, "_");
  const prefix = `${IMAGE_S3_PATHS.LOGOS_DIR}/${domainName}_${tldName}_`;

  // Use lightweight listS3Objects helper (guards against gigantic listings)
  const keys = await listS3Objects(prefix);
  if (!keys.length) return null;

  // Pick the first key that is *truly* legacy (no hash segment)
  for (const key of keys) {
    const parsed = parseS3Key(key);
    if (parsed.type === "logo" && parsed.domain === domain && !parsed.hash) {
      return key;
    }
  }

  return null;
}
