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
  const mode = IS_S3_CONFIGURED ? "LIVE" : "DRY RUN";

  it(`should execute successfully in ${mode} mode`, () => {
    console.log(`[Smoke Test] Executing script in ${mode} mode: ${SCRIPT_PATH}`);

    let stdout = "";
    let stderr = "";
    let exitCode = 0;

    // Prepare environment
    const envVars: NodeJS.ProcessEnv = {
      ...process.env,
      VERBOSE: "true",
    };

    if (!IS_S3_CONFIGURED) {
      envVars.DRY_RUN = "true";
      envVars.S3_BUCKET = "test-bucket";
    }

    try {
      stdout = execSync(`bun ${SCRIPT_PATH}`, {
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

    expect(stdout).toContain("[UpdateS3] Script execution started. Raw args:");
    expect(stdout).toContain("[UpdateS3] All scheduled update checks complete.");

    if (!IS_S3_CONFIGURED) {
      // Only check DRY RUN logs when running in dry mode
      const dryRunPattern = /\[S3Utils\]\[DRY RUN\]/;
      expect(dryRunPattern.test(stdout)).toBe(true);
    }
  }, 120000);
});
