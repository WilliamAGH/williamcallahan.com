#!/usr/bin/env tsx
/**
 * Copies this build's public chunks and media into the CDN bucket under their
 * original `_next/static/` paths. Never publishes server output or source maps.
 *
 * Swarm's start-first rollout serves old and new replicas side by side, so a document one
 * release rendered can request a hashed asset that only the other release's image holds. Every
 * replica relays a public chunk or media file it lacks to this archive (the `rewrites().fallback` in
 * next.config.ts), so the web image build runs this before any replica of the release serves.
 * docs/ops/deployment.md "Static asset archive" explains the design.
 */

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { putObject } from "@/lib/s3/objects";
import { getArchivedAssetContentType } from "@/lib/validators/static-archive";
import logger from "@/lib/utils/logger";

const STATIC_DIR = path.join(process.cwd(), ".next", "static");
const UPLOAD_CONCURRENCY = 8;
// Next serves `/_next/static` with this header; the archived copy behaves the same.
const IMMUTABLE_CACHE_CONTROL = "public, max-age=31536000, immutable";

async function listStaticFiles(): Promise<string[]> {
  // Only public static output is visited, never `.next/server` or other build output.
  const entries = await readdir(STATIC_DIR, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(STATIC_DIR, path.join(entry.parentPath, entry.name)))
    .map((relativePath) => relativePath.split(path.sep).join("/"))
    .filter((relativePath) => getArchivedAssetContentType(relativePath) !== undefined);
}

async function archiveFile(relativePath: string): Promise<void> {
  const contentType = getArchivedAssetContentType(relativePath);
  if (!contentType) throw new Error(`[archive-static-assets] Not a public asset: ${relativePath}`);
  await putObject(
    `_next/static/${relativePath}`,
    await readFile(path.join(STATIC_DIR, relativePath)),
    {
      contentType,
      cacheControl: IMMUTABLE_CACHE_CONTROL,
      acl: "public-read",
    },
  );
}

async function main(): Promise<void> {
  // The fallback rewrite targets this origin; a build without it would serve no archive.
  if (!process.env.NEXT_PUBLIC_S3_CDN_URL?.trim()) {
    throw new Error("[archive-static-assets] NEXT_PUBLIC_S3_CDN_URL is required.");
  }
  const files = await listStaticFiles();
  if (files.length === 0) {
    throw new Error(`[archive-static-assets] ${STATIC_DIR} holds no public assets.`);
  }

  const pending = [...files];
  const workers = Array.from({ length: UPLOAD_CONCURRENCY }, async () => {
    for (let next = pending.shift(); next !== undefined; next = pending.shift()) {
      await archiveFile(next);
    }
  });
  await Promise.all(workers);
  logger.info(`[archive-static-assets] Archived ${files.length} files to _next/static/.`);
}

await main();
