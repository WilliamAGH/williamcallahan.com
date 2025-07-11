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
  // 0. Respect explicit override first (allows integration tests to opt-in to writes)
  //    This must come **before** any automatic guards to guarantee that setting
  //    S3_READ_ONLY="false" is honored even when NODE_ENV === "test".
  const readOnlyFlag = process.env.S3_READ_ONLY?.toLowerCase();
  if (readOnlyFlag === "false") return false;
  if (readOnlyFlag === "true") return true;

  // 0.5 Integration test override: when running live S3 integration tests we
  //     set S3_TEST_MODE to a non-DRY value (e.g., "NORMAL" or "FULL").
  //     This signals that the developer provided disposable credentials and
  //     explicitly wants write paths exercised, so we allow writes.
  const testMode = process.env.S3_TEST_MODE?.toUpperCase();
  if (testMode && testMode !== "DRY") {
    return false;
  }

  // ✅ 1. By default, treat automated tests as read-only to avoid mutating remote state.
  //    This guard runs *after* the explicit override so that intentionally
  //    enabled integration tests (with S3_READ_ONLY=false) can perform writes.
  if (process.env.NODE_ENV === "test" || process.env.JEST_WORKER_ID !== undefined) {
    return true;
  }

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
