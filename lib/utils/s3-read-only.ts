/**
 * S3 Read-Only Mode Detection
 *
 * Centralized logic for determining if S3 writes should be disabled.
 * Used by both UnifiedImageService and OpenGraph image persistence.
 *
 * @module utils/s3-read-only
 */

/**
 * Determines if the application is in read-only mode for S3 operations.
 *
 * S3 writes are only allowed when:
 * 1. Explicitly running data-updater script (IS_DATA_UPDATER=true)
 * 2. During Next.js build phase
 * 3. Explicitly disabled (S3_READ_ONLY=false)
 *
 * @returns true if S3 writes should be disabled
 */
export function isS3ReadOnly(): boolean {
  // ✅ 1. Always treat automated tests as read-only to avoid mutating remote state
  if (process.env.NODE_ENV === "test" || process.env.JEST_WORKER_ID !== undefined) {
    return true;
  }

  // If explicitly set, use that
  const readOnlyFlag = process.env.S3_READ_ONLY?.toLowerCase();
  if (readOnlyFlag === "false") return false;
  if (readOnlyFlag === "true") return true;

  // 🚫 2. Build phase (image assembly) must never write to S3, even if
  //    scripts set IS_DATA_UPDATER=true.  This guarantees read-only builds.
  if (process.env.NEXT_PHASE === "phase-production-build") return true;

  // Allow writes during data-updater runs that happen **outside** the image build
  // (e.g. runtime scheduler, manual CLI).  When we are inside the build the
  // previous guard has already returned.
  if (process.env.IS_DATA_UPDATER === "true") return false;

  // In all other cases, WRITE-ENABLED (false) to allow runtime self-healing
  return false;
}

/**
 * Determines if S3 credentials are available for write operations.
 * Used to prevent build failures when credentials aren't available.
 *
 * @returns true if S3 write credentials are configured
 */
export function hasS3WriteCredentials(): boolean {
  const bucket = process.env.S3_BUCKET;
  const accessKeyId = process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;

  return !!(bucket && accessKeyId && secretAccessKey);
}
