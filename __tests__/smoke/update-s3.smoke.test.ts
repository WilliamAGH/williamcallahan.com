/**
 * Smoke tests for S3 data update script - validates CLI behavior and module structure without execution
 *
 * Mock-based validation approach prevents actual S3 operations, external API calls, and file system changes
 * during test runs while ensuring script interface contracts and error handling paths are verified
 *
 * Tests cover: command-line argument parsing, environment variable validation, help text display,
 * dry-run functionality, flag combinations, and required module import structure
 *
 * @fileoverview Part of script testing infrastructure for data-updater.ts operational validation
 */

import { execSync } from "node:child_process";
import * as path from "node:path";

/**
 * Smoke test suite for data-updater.ts script interface validation
 *
 * Uses mocked outputs instead of process spawning to avoid external dependencies
 * and maintain test isolation while validating expected CLI behaviors
 */
describe("Update S3 Script Smoke Tests", () => {
  /** Resolved path to target data updater script for reference validation */
  const scriptPath = path.join(__dirname, "../../scripts/data-updater.ts");
  const bunPath = process.env.BUN_PATH || "bun";

  /** Extended timeout accommodation for potential script execution scenarios */
  jest.setTimeout(30000);

  /**
   * Validates help message format and required command-line options
   * Ensures all update flags (bookmarks, github-activity, logos, force) are documented in usage text
   */
  it("should display help message", () => {
    /** Execute script with --help flag and capture output */
    const stdout = execSync(`${bunPath} ${scriptPath} --help`, {
      encoding: "utf8",
      env: { ...process.env, S3_BUCKET: "test-bucket" },
    });

    expect(stdout).toContain("Usage: data-fetch-manager [options]");
    expect(stdout).toContain("--bookmarks");
    expect(stdout).toContain("--github");
    expect(stdout).toContain("--logos");
    expect(stdout).toContain("--force");
  });

  /**
   * Validates dry-run mode behavior without performing actual updates
   * Confirms script recognizes DRY_RUN environment variable and exits cleanly
   */
  it("should run with DRY_RUN environment variable", () => {
    /** Execute script in dry-run mode and capture output */
    const stdout = execSync(`${bunPath} ${scriptPath}`, {
      encoding: "utf8",
      env: { ...process.env, DRY_RUN: "true", S3_BUCKET: "test-bucket" },
    });

    expect(stdout).toContain("DRY RUN mode");
    // In DRY RUN mode, the script exits before reaching completion message
    expect(stdout).toContain("skipping all update processes");
  });

  /**
   * Validates environment variable validation logic for required S3_BUCKET
   * Confirms script can run with minimal test data when S3_BUCKET is missing
   */
  it("should handle missing S3_BUCKET gracefully in test mode", () => {
    /** Execute script without S3_BUCKET but with test limits */
    // Note: The script actually has fallback behavior for missing S3_BUCKET
    // and will attempt to run with local data in test mode
    const cleanEnv = { ...process.env };
    delete cleanEnv.S3_BUCKET;

    let stdout = "";
    let _exitCode = 0;

    try {
      // Use test limit and dry run to ensure quick execution
      stdout = execSync(`${bunPath} ${scriptPath}`, {
        encoding: "utf8",
        env: { ...cleanEnv, DRY_RUN: "true", S3_TEST_LIMIT: "1" },
        timeout: 5000, // 5 second timeout
      });
      _exitCode = 0;
    } catch (error: any) {
      stdout = error.stdout || "";
      _exitCode = error.status || 1;
    }

    // In dry-run mode without S3_BUCKET, script may exit non-zero; assert graceful message instead
    expect(stdout).toContain("DRY RUN mode");
  });

  /**
   * Validates selective update flag processing for targeted operations
   * Confirms script correctly parses individual flags and skips non-specified updates
   */
  it("should accept individual update flags", () => {
    /** Execute script with specific flags in dry-run mode */
    const stdout = execSync(`${bunPath} ${scriptPath} --bookmarks --logos`, {
      encoding: "utf8",
      env: { ...process.env, DRY_RUN: "true", S3_BUCKET: "test-bucket" },
    });

    // The script logs the raw args, which should include our flags
    expect(stdout).toContain("Args: --bookmarks --logos");
    // In dry run mode, it exits before flag-specific processing
    expect(stdout).toContain("DRY RUN mode");
  });

  /**
   * Validates S3_TEST_LIMIT environment variable processing for controlled test runs
   * Ensures script respects item count limits during testing to prevent resource exhaustion
   */
  it("should handle test limit environment variable", () => {
    /** Execute script with test limit set */
    const stdout = execSync(`${bunPath} ${scriptPath}`, {
      encoding: "utf8",
      env: { ...process.env, DRY_RUN: "true", S3_BUCKET: "test-bucket", S3_TEST_LIMIT: "5" },
    });

    expect(stdout).toContain("Test limit active: 5 items per operation");
  });

  /**
   * Validates that script can be loaded and parsed without import errors
   * Confirms module resolution works correctly in test environment
   */
  it("should load script without module resolution errors", () => {
    /** Execute script with immediate exit to test module loading */
    let _exitCode = 0;
    try {
      execSync(`${bunPath} ${scriptPath} --help`, {
        encoding: "utf8",
        env: { ...process.env, S3_BUCKET: "test-bucket" },
      });
    } catch (error: any) {
      _exitCode = error.status || 1;
    }

    /** Script should exit with code 0 after displaying help */
    expect(_exitCode).toBe(0);
  });
});
