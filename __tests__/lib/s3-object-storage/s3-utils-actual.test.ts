/**
 * @file __tests__/lib/s3-utils-actual.ts
 * @module s3-utils-actual
 *
 * @description
 * This module re-exports the actual S3 utility functions from `../../lib/s3-utils`
 * without them being mocked. This is a workaround to allow integration tests
 * to use the real S3 functions while unit tests in the same file can use
 * mocked versions.
 *
 * This is necessary because `bun:test`'s `mock.module` feature mocks the
 * module for the entire test file in which it is called.
 *
 * *********************************************************************************************
 *  ⚠️  LIVE S3 WRITES IN TESTS – READ ME BEFORE EDITING ⚠️
 *
 *  • This file is the **ONLY** place in the test-suite permitted to perform _real_ write
 *    operations against S3, and only when **S3_TEST_MODE !== "DRY"** **and** valid S3
 *    credentials are present.
 *  • NEVER add tests here (or anywhere else) that write to production buckets or depend on
 *    main-line data.  Keys **MUST** be disposable, prefixed under the `test/` namespace, and
 *    deleted in `afterAll`.
 *  • Regular unit/integration tests **MUST** rely on mocks.  If you need additional live-wire
 *    coverage, extend this file rather than sprinkling writes elsewhere.
 *  • Violations constitute a ZERO TEMPERATURE breach and will immediately halt CI.
 * *********************************************************************************************
 */

import {
  listS3Objects,
  readFromS3,
  readBinaryS3,
  readJsonS3,
  writeToS3,
  writeBinaryS3,
  writeJsonS3,
  deleteFromS3,
  checkIfS3ObjectExists,
  getS3ObjectMetadata,
  s3Client,
} from "@/lib/s3-utils";

// Removed extraneous exports to satisfy ESLint rules

// Add a simple test to avoid empty test suite error
describe("S3 Utils Actual Export", () => {
  it("should export all required functions", () => {
    expect(typeof listS3Objects).toBe("function");
    expect(typeof readFromS3).toBe("function");
    expect(typeof readBinaryS3).toBe("function");
    expect(typeof readJsonS3).toBe("function");
    expect(typeof writeToS3).toBe("function");
    expect(typeof writeBinaryS3).toBe("function");
    expect(typeof writeJsonS3).toBe("function");
    expect(typeof deleteFromS3).toBe("function");
    expect(typeof checkIfS3ObjectExists).toBe("function");
    expect(typeof getS3ObjectMetadata).toBe("function");
    expect(s3Client).toBeDefined();
  });
});

// Integration test should follow the same gating convention used by
// __tests__/scripts/update-s3-data.smoke.test.ts so that we have ONE
// place to configure live-AWS behavior during CI runs.

const S3_TEST_MODE = process.env.S3_TEST_MODE || "NORMAL"; // DRY | NORMAL | FULL

const IS_S3_CONFIGURED = Boolean(
  process.env.S3_BUCKET && process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY,
);

const SHOULD_RUN_LIVE_TESTS = S3_TEST_MODE !== "DRY" && IS_S3_CONFIGURED;

// Ensure live tests can perform write operations by disabling read-only mode
if (SHOULD_RUN_LIVE_TESTS) {
  // Explicit override respected by isS3ReadOnly (see utils/s3-read-only.ts)
  const previousReadOnly = process.env.S3_READ_ONLY;
  process.env.S3_READ_ONLY = "false";

  // Ensure we restore the original value after all tests in this file
  afterAll(() => {
    if (previousReadOnly === undefined) {
      delete process.env.S3_READ_ONLY;
    } else {
      process.env.S3_READ_ONLY = previousReadOnly;
    }
  });
}

if (SHOULD_RUN_LIVE_TESTS) {
  describe("S3 Utils Integration – read/write JSON", () => {
    const TEST_KEY = "test/integration-test.json";
    const payload = { hello: "world", ts: Date.now() };

    it("writes JSON to S3 and reads it back", async () => {
      await writeJsonS3(TEST_KEY, payload);
      const readBack = await readJsonS3<typeof payload>(TEST_KEY);
      expect(readBack).toEqual(payload);
    });

    afterAll(async () => {
      await deleteFromS3(TEST_KEY);
    });
  });
} else {
  console.warn(
    `[S3 Utils Integration] Skipping live S3 tests – mode: ${S3_TEST_MODE}, credentials present: ${IS_S3_CONFIGURED}`,
  );
}
