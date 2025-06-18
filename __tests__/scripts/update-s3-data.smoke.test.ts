// __tests__/scripts/update-s3-data.smoke.test.ts
// Jest provides describe, it, expect, beforeEach, afterEach, beforeAll, afterAll globally
import { execSync } from "node:child_process";
import path from "node:path";

// Path to the script relative to the project root
const SCRIPT_PATH = path.join(process.cwd(), "scripts/update-s3-data.ts");
// S3 Bucket name from environment for log verification
const S3_BUCKET = process.env.S3_BUCKET;
const IS_S3_CONFIGURED = Boolean(
  S3_BUCKET && process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY,
);

describe("scripts/update-s3-data.ts Smoke Test", () => {
  // Support three test modes:
  // - FULL: Run all operations without limits (slow, ~130+ seconds)
  // - DRY: Mock all operations (fast, no real calls)
  // - NORMAL: Test 1 real operation of each type (default, balanced)
  const testMode = process.env.S3_TEST_MODE || "NORMAL";
  const isS3Configured = IS_S3_CONFIGURED || testMode === "DRY";
  
  const displayMode = !IS_S3_CONFIGURED && testMode !== "DRY" 
    ? "DRY RUN (no S3 config)" 
    : testMode;

  it(`should execute successfully in ${displayMode} mode`, () => {
    console.log(`[Smoke Test] Executing script in ${displayMode} mode: ${SCRIPT_PATH}`);
    console.log(`[Smoke Test] S3_TEST_MODE: ${testMode}`);

    let stdout = "";
    let stderr = "";
    let exitCode = 0;

    // Prepare environment
    const envVars: NodeJS.ProcessEnv = {
      ...process.env,
      VERBOSE: "true",
      S3_TEST_MODE: testMode,
    };

    // Configure based on test mode
    if (testMode === "DRY" || !IS_S3_CONFIGURED) {
      envVars.DRY_RUN = "true";
      envVars.S3_BUCKET = envVars.S3_BUCKET || "test-bucket";
    } else if (testMode === "NORMAL") {
      // Tell the script to run in limited test mode
      envVars.S3_TEST_LIMIT = "1";
    }
    // FULL mode runs without restrictions

    try {
      // Use bun if available in PATH, otherwise fall back to tsx
      let command: string;
      try {
        execSync('which bun', { stdio: 'ignore' });
        command = `bun ${SCRIPT_PATH}`;
      } catch {
        // If bun is not available, use tsx which is more portable than ts-node
        command = `npx tsx ${SCRIPT_PATH}`;
      }
      
      stdout = execSync(command, {
        env: envVars,
        encoding: "utf8",
        stdio: ["inherit", "pipe", "pipe"],
      }).toString();
    } catch (error: any) {
      exitCode = error.status || 1;
      stdout = error.stdout || "";
      stderr = error.stderr || "";
    }

    console.log("[Smoke Test] Script stdout:\n", stdout);
    if (stderr) {
      console.error("[Smoke Test] Script stderr:\n", stderr);
    }

    expect(exitCode).toBe(0);

    // Basic expectations for all modes
    expect(stdout).toContain("[UpdateS3] Script execution started. Raw args:");
    expect(stdout).toContain("[UpdateS3] All scheduled update checks complete.");

    // Mode-specific expectations
    if (testMode === "DRY" || !IS_S3_CONFIGURED) {
      const dryRunPattern = /DRY RUN mode: skipping all update processes/;
      expect(dryRunPattern.test(stdout)).toBe(true);
    } else if (testMode === "NORMAL") {
      // Should see limited processing messages
      expect(stdout).toMatch(/Test mode: limiting .* to 1/);
    }
    // FULL mode has no special expectations beyond successful completion
  }, testMode === "FULL" ? 180000 : 30000); // Longer timeout for FULL mode
});
