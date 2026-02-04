/**
 * Quick S3 directory lister – intended for local, ad-hoc verification only.
 *
 * Usage:
 *   # List root of bucket
 *   DRY_RUN=false bun run debug:list-s3
 *
 *   # List a specific prefix
 *   DRY_RUN=false bun run debug:list-s3 images/other/blog-posts/
 */

import "dotenv/config";
import { listS3Objects } from "../src/lib/s3/objects";

/**
 * Retrieve CLI prefix argument – defaults to empty string to list full bucket.
 */
const prefix: string = process.argv[2] ?? "";

(async (): Promise<void> => {
  try {
    const keys = await listS3Objects(prefix);
    console.log(`Prefix: "${prefix}"`);
    console.log(`Found  ${keys.length} object${keys.length === 1 ? "" : "s"}`);
    if (keys.length) {
      // Print at most first 10 keys
      console.log(keys.slice(0, 10));
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[debug-list-s3] Error listing objects:", errorMessage);
    process.exitCode = 1;
  }
})();
