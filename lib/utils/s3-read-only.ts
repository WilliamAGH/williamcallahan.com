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

  // Allow writes during data-updater runs
  if (process.env.IS_DATA_UPDATER === "true") return false;

  // Allow writes during Next.js build phase
  if (process.env.NEXT_PHASE === "phase-production-build") return false;

  // 🔄 Default: WRITE-ENABLED (false). This ensures the app can self-heal missing assets
  // in development and production unless an explicit read-only flag is provided.
  return false;
}
