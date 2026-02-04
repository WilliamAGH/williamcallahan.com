#!/usr/bin/env bun
/**
 * Upload missing blog post images to S3
 * Quick surgical fix for images that aren't in S3 CDN
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { writeBinaryS3 } from "@/lib/s3/binary";
import { checkIfS3ObjectExists } from "@/lib/s3/objects";
import logger from "@/lib/utils/logger";

// Images identified as missing from the logs
const MISSING_IMAGES = [
  "/images/posts/modern_terminal_blog.svg",
  "/images/posts/llm-data-structures-optimization.png",
  "/images/posts/terminal-component-cover.svg",
  "/images/posts/William Callahan winning mechanical keyboard at SF hackathon.jpeg",
  "/images/posts/terminal_pop_os.svg",
];

/**
 * Generate content hash for cache busting (matches existing pattern)
 */
function generateContentHash(buffer: Buffer): string {
  return crypto.createHash("md5").update(buffer).digest("hex").substring(0, 8);
}

/**
 * Generate S3 key following existing pattern
 * Example: images/other/blog-posts/filename_hash.ext
 */
function generateS3Key(imagePath: string, buffer: Buffer): string {
  const filename = path.basename(imagePath);
  const ext = path.extname(filename);
  const nameWithoutExt = path.basename(filename, ext);
  const hash = generateContentHash(buffer);

  // Follow existing pattern: images/other/blog-posts/name_hash.ext
  return `images/other/blog-posts/${nameWithoutExt}_${hash}${ext}`;
}

/**
 * Get content type based on file extension
 */
function getContentType(imagePath: string): string {
  const ext = path.extname(imagePath).toLowerCase();
  const contentTypes: Record<string, string> = {
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
  };
  return contentTypes[ext] || "application/octet-stream";
}

async function uploadMissingImages() {
  logger.info("Starting upload of missing blog images to S3...");

  let uploadedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  for (const imagePath of MISSING_IMAGES) {
    try {
      // Construct local file path
      const localPath = path.join(process.cwd(), "public", imagePath);

      // Check if file exists locally
      if (!fs.existsSync(localPath)) {
        logger.warn(`File not found locally: ${localPath}`);
        errorCount++;
        continue;
      }

      // Read file
      const buffer = fs.readFileSync(localPath);
      logger.info(`Read ${imagePath} (${buffer.length} bytes)`);

      // Generate S3 key with content hash
      const s3Key = generateS3Key(imagePath, buffer);

      // Check if already exists in S3
      const exists = await checkIfS3ObjectExists(s3Key);
      if (exists) {
        logger.info(`Already exists in S3: ${s3Key}`);
        skippedCount++;
        continue;
      }

      // Upload to S3 - use forceWrite to bypass memory checks for this one-time migration
      logger.info(`Uploading to S3: ${s3Key}`);

      // For large files, set environment variable to bypass memory check temporarily
      const originalEnv = process.env.S3_FORCE_WRITE;
      process.env.S3_FORCE_WRITE = "true";

      try {
        await writeBinaryS3(s3Key, buffer, getContentType(imagePath));
      } finally {
        // Restore original environment
        if (originalEnv === undefined) {
          delete process.env.S3_FORCE_WRITE;
        } else {
          process.env.S3_FORCE_WRITE = originalEnv;
        }
      }

      logger.info(`✅ Successfully uploaded: ${imagePath} → ${s3Key}`);
      logger.info(`   CDN URL: https://s3-storage.callahan.cloud/${s3Key}`);
      uploadedCount++;
    } catch (error) {
      logger.error(`Failed to upload ${imagePath}:`, error);
      errorCount++;
    }
  }

  logger.info("\n📊 Upload Summary:");
  logger.info(`   ✅ Uploaded: ${uploadedCount}`);
  logger.info(`   ⏭️  Skipped (already exists): ${skippedCount}`);
  logger.info(`   ❌ Errors: ${errorCount}`);
  logger.info(`   📁 Total processed: ${MISSING_IMAGES.length}`);
}

// Run the upload
uploadMissingImages().catch((error) => {
  logger.error("Fatal error:", error);
  process.exit(1);
});
