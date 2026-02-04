/**
 * Logo Maintenance Utilities
 *
 * Contains maintenance/cleanup operations for logo files in S3.
 * Run periodically to ensure naming conventions are followed.
 *
 * @module persistence/logo-maintenance
 */

import { isS3ReadOnly } from "@/lib/utils/s3-read-only";

/**
 * Cleanup and normalize logo filenames in S3
 * This function can be run periodically to ensure all logos follow the standard naming convention
 */
export async function normalizeLogoFilenames(): Promise<void> {
  if (isS3ReadOnly()) {
    console.log("[S3 Persistence] Read-only mode, skipping logo normalization");
    return;
  }

  try {
    const { ListObjectsV2Command, CopyObjectCommand, DeleteObjectCommand } =
      await import("@aws-sdk/client-s3");
    const { IMAGE_S3_PATHS } = await import("@/lib/constants");
    const { parseS3Key, generateS3Key } = await import("@/lib/utils/hash-utils");
    const { getS3Client } = await import("@/lib/s3/client");
    const { getS3Config } = await import("@/lib/s3/config");

    const { bucket } = getS3Config();
    const s3Client = getS3Client();
    const prefix = IMAGE_S3_PATHS.LOGOS_DIR + "/";

    // List all logos with pagination
    const objects: Array<{ Key?: string }> = [];
    let continuationToken: string | undefined;

    do {
      const response = await s3Client.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: prefix,
          MaxKeys: 1000,
          ContinuationToken: continuationToken,
        }),
      );
      if (response.Contents && response.Contents.length > 0) {
        objects.push(...response.Contents);
      }
      continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
    } while (continuationToken);

    console.log(`[S3 Persistence] Found ${objects.length} logos to check`);

    for (const obj of objects) {
      if (!obj.Key) continue;

      const parsed = parseS3Key(obj.Key);

      // Check if it needs normalization
      if (parsed.type === "logo" && parsed.domain && !parsed.hash) {
        console.log(`[S3 Persistence] Found logo without hash: ${obj.Key}`);

        // Generate the proper filename with hash
        const newKey = generateS3Key({
          type: "logo",
          domain: parsed.domain,
          source: parsed.source as import("@/types/logo").LogoSource,
          extension: parsed.extension || "png",
          inverted: parsed.inverted,
        });

        console.log(`[S3 Persistence] Renaming to: ${newKey}`);

        // Copy to new location
        await s3Client.send(
          new CopyObjectCommand({
            Bucket: bucket,
            CopySource: `${bucket}/${obj.Key}`,
            Key: newKey,
            ACL: "public-read",
          }),
        );

        // Delete old file
        await s3Client.send(
          new DeleteObjectCommand({
            Bucket: bucket,
            Key: obj.Key,
          }),
        );

        console.log(`[S3 Persistence] Successfully normalized: ${obj.Key} -> ${newKey}`);
      }
    }

    console.log("[S3 Persistence] Logo normalization complete");
  } catch (error) {
    console.error("[S3 Persistence] Error normalizing logo filenames:", error);
  }
}
