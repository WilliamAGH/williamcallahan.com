#!/usr/bin/env bun
/**
 * Synchronize blog cover images with S3 and manifest
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { checkIfS3ObjectExists, writeBinaryS3 } from "@/lib/s3-utils";
import { buildCdnUrl, getCdnConfigFromEnv } from "@/lib/utils/cdn-utils";
import logger from "@/lib/utils/logger";

const ROOT = process.cwd();
const POSTS_IMAGE_DIR = path.join(ROOT, "public", "images", "posts");
const COVER_IMAGE_MAP_PATH = path.join(ROOT, "data", "blog", "cover-image-map.json");

const DRY_RUN = process.argv.includes("--dry-run") || process.env.DRY_RUN === "true";

const RAILWAY_ENV_SIGNALS = [
  "RAILWAY_STATIC_URL",
  "RAILWAY_PUBLIC_DOMAIN",
  "RAILWAY_PRIVATE_DOMAIN",
  "RAILWAY_PROJECT_NAME",
  "RAILWAY_PROJECT_ID",
  "RAILWAY_ENVIRONMENT_NAME",
  "RAILWAY_ENVIRONMENT_ID",
  "RAILWAY_SERVICE_NAME",
  "RAILWAY_SERVICE_ID",
];

const isRailwayEnv = RAILWAY_ENV_SIGNALS.some((name) => Boolean(process.env[name]));

const SUPPORTED_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".svg", ".webp", ".gif", ".avif"]);

function getAllFiles(dir: string): string[] {
  return fs.readdirSync(dir).flatMap((entry) => {
    const entryPath = path.join(dir, entry);
    const stats = fs.statSync(entryPath);
    if (stats.isDirectory()) return getAllFiles(entryPath);
    return [entryPath];
  });
}

function generateContentHash(buffer: Buffer): string {
  return crypto.createHash("md5").update(buffer).digest("hex").substring(0, 8);
}

function generateS3Key(filePath: string, buffer: Buffer): string {
  const filename = path.basename(filePath);
  const ext = path.extname(filename);
  const nameWithoutExt = path.basename(filename, ext);
  return `images/other/blog-posts/${nameWithoutExt}_${generateContentHash(buffer)}${ext}`;
}

function detectContentType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case ".svg":
      return "image/svg+xml";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    case ".gif":
      return "image/gif";
    case ".avif":
      return "image/avif";
    default:
      return "application/octet-stream";
  }
}

function normalizeBaseName(localPath: string): string {
  const filename = path.basename(localPath);
  return path.basename(filename, path.extname(filename));
}

function loadExistingMap(): Record<string, string> {
  if (!fs.existsSync(COVER_IMAGE_MAP_PATH)) {
    return {};
  }
  try {
    const raw = fs.readFileSync(COVER_IMAGE_MAP_PATH, "utf8");
    return JSON.parse(raw) as Record<string, string>;
  } catch (error) {
    logger.error("Failed to read existing cover image map:", error);
    return {};
  }
}

function writeMap(map: Record<string, string>): void {
  const sortedEntries = Object.entries(map).toSorted(([a], [b]) => a.localeCompare(b));
  const sortedMap = Object.fromEntries(sortedEntries);
  fs.mkdirSync(path.dirname(COVER_IMAGE_MAP_PATH), { recursive: true });
  fs.writeFileSync(COVER_IMAGE_MAP_PATH, `${JSON.stringify(sortedMap, null, 2)}\n`);
}

async function syncCoverImages(): Promise<void> {
  logger.info("🖼️  Syncing blog cover images with S3...");

  const hasS3Credentials = Boolean(
    process.env.S3_BUCKET && process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY,
  );
  const shouldUpload = !DRY_RUN && hasS3Credentials;
  if (!shouldUpload) {
    logger.warn("S3 credentials missing or dry-run enabled. Skipping uploads.");
  }

  const files = getAllFiles(POSTS_IMAGE_DIR).filter((file) =>
    SUPPORTED_EXTENSIONS.has(path.extname(file).toLowerCase()),
  );
  if (files.length === 0) {
    logger.warn("No blog cover images found under public/images/posts.");
  }

  const coverImageMap = loadExistingMap();
  const cdnConfig = getCdnConfigFromEnv();

  if (!cdnConfig.cdnBaseUrl && !cdnConfig.s3BucketName) {
    if (isRailwayEnv) {
      logger.warn(
        "⚠️  CDN configuration missing, but Railway environment detected. Skipping blog cover image sync for this build.",
      );
      return;
    }
  }

  let uploaded = 0;
  let skipped = 0;

  for (const filePath of files) {
    const relPath = path.relative(path.join(ROOT, "public"), filePath).replace(/\\/g, "/");
    const localPath = `/${relPath}`;
    const baseName = normalizeBaseName(localPath);
    const buffer = fs.readFileSync(filePath);
    const s3Key = generateS3Key(filePath, buffer);
    const cdnUrl = buildCdnUrl(s3Key, cdnConfig);

    if (coverImageMap[baseName] && coverImageMap[baseName] !== s3Key) {
      logger.warn(
        `Base name collision for "${baseName}". Existing key: ${coverImageMap[baseName]}, new key: ${s3Key}. Overwriting with new key.`,
      );
    }

    coverImageMap[baseName] = s3Key;

    if (shouldUpload) {
      const exists = await checkIfS3ObjectExists(s3Key);
      if (exists) {
        logger.info(`⏭️  Skipping upload (already exists): ${s3Key}`);
        skipped++;
      } else {
        logger.info(`⬆️  Uploading ${localPath} → ${s3Key}`);
        const originalForceWrite = process.env.S3_FORCE_WRITE;
        process.env.S3_FORCE_WRITE = "true";
        try {
          await writeBinaryS3(s3Key, buffer, detectContentType(filePath));
          logger.info(`✅ Uploaded ${localPath}. CDN: ${cdnUrl}`);
          uploaded++;
        } finally {
          if (originalForceWrite === undefined) {
            delete process.env.S3_FORCE_WRITE;
          } else {
            process.env.S3_FORCE_WRITE = originalForceWrite;
          }
        }
      }
    }
  }

  writeMap(coverImageMap);

  logger.info("\n📦 Cover image sync summary:");
  logger.info(`   Total images processed: ${files.length}`);
  logger.info(`   Uploaded: ${uploaded}`);
  logger.info(`   Already existed: ${skipped}`);
  if (DRY_RUN) {
    logger.info("   (dry-run) Manifest updated without uploading");
  }
}

syncCoverImages()
  .then(() => {
    logger.info("Blog cover image sync complete.");
    return undefined;
  })
  .catch((error) => {
    logger.error("Blog cover image sync failed:", error);
    process.exit(1);
  });
