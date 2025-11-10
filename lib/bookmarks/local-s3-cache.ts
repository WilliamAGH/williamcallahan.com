import { promises as fs } from "node:fs";
import path from "node:path";

/**
 * Local directory where build-time scripts persist S3 snapshots.
 * Path mirrors the remote key structure so callers can join S3 keys directly.
 */
export const LOCAL_S3_CACHE_DIR = path.join(process.cwd(), "lib/data/s3-cache");

/**
 * Resolve an absolute filesystem path for a given S3 key inside the local cache.
 */
export function getLocalS3Path(s3Key: string): string {
  const normalizedKey = s3Key.replace(/^\/+/, "");
  return path.join(LOCAL_S3_CACHE_DIR, normalizedKey);
}

/**
 * Read JSON content for a given S3 key from the local cache directory.
 * Returns null when the cached file does not exist.
 */
export async function readLocalS3Json<T>(s3Key: string): Promise<T | null> {
  const filePath = getLocalS3Path(s3Key);
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw) as T;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException)?.code;
    if (code !== "ENOENT") {
      console.warn(`[LocalS3Cache] Failed to read ${s3Key} from ${filePath}:`, error);
    }
    return null;
  }
}
