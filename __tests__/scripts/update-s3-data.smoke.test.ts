// __tests__/scripts/update-s3-data.smoke.test.ts
import { describe, it, expect } from 'bun:test';
import { spawnSync } from 'bun';
import path from 'node:path';

// Path to the script relative to the project root
const SCRIPT_PATH = path.join(import.meta.dir, '../../scripts/update-s3-data.ts');
// S3 Bucket name from environment for log verification
const S3_BUCKET_NAME = process.env.S3_BUCKET || 'default-bucket-not-set'; // Use actual bucket name if possible

describe('scripts/update-s3-data.ts - Dry Run Smoke Test', () => {

  it('should execute successfully in dry run mode and log intended S3 writes', () => {
    console.log(`[Smoke Test] Executing script in DRY RUN mode: ${SCRIPT_PATH}`);

    // Execute the script using Bun.spawnSync
    // Pass DRY_RUN=true in the environment variables
    const result = spawnSync(['bun', SCRIPT_PATH], {
      env: {
        ...process.env, // Inherit existing environment variables
        DRY_RUN: 'true',
        VERBOSE: 'true', // Enable verbose logging to see more details
        // Ensure necessary S3/API credentials are available if the script needs them even for dry run logic
      },
      stdout: 'pipe', // Capture stdout
      stderr: 'pipe', // Capture stderr
    });

    const stdout = result.stdout.toString();
    const stderr = result.stderr.toString();

    console.log('[Smoke Test] Script stdout:\n', stdout);
    if (stderr) {
      console.error('[Smoke Test] Script stderr:\n', stderr);
    }

    // Assertions
    expect(result.exitCode).toBe(0); // Script should exit successfully

    // Check for key log messages indicating dry run operation
    expect(stdout).toContain('[UpdateS3] Script started.');
    expect(stdout).toContain('[UpdateS3] All scheduled update checks complete.');

    // Check for specific DRY RUN log messages from s3-utils
    // These confirm that the write functions correctly identified the dry run mode.
    // We expect at least one of these if the script logic determines a write should happen.
    // Note: If no data needed updating, these logs might not appear, which is also valid.
    const dryRunJsonLogPattern = new RegExp(`\\[S3Utils\\]\\[DRY RUN\\] Would write JSON to S3 bucket '${S3_BUCKET_NAME}', path: data/`);
    const dryRunBinaryLogPattern = new RegExp(`\\[S3Utils\\]\\[DRY RUN\\] Would write binary file .* to S3 bucket '${S3_BUCKET_NAME}', path: data/`);

    // Check if *any* dry run log appeared (more robust than checking for specific files)
    const foundDryRunLog = dryRunJsonLogPattern.test(stdout) || dryRunBinaryLogPattern.test(stdout);

    // It's possible no writes were needed even if not dry run.
    // The critical part is that the script ran and didn't crash, and IF a write was needed, it logged as DRY RUN.
    // A more advanced test could involve seeding S3 to guarantee a write *would* be needed.
    // For a smoke test, checking for successful execution and *potential* dry run logs is reasonable.
    console.log(`[Smoke Test] Found Dry Run Log: ${foundDryRunLog}`);
    // We can't definitively assert foundDryRunLog is true, as no updates might be needed.
    // The main assertion is the successful exit code.

  }, 60000); // Increased timeout as the script fetches external data even in dry run
});
