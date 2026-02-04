/**
 * @file __tests__/lib/s3-utils-actual.ts
 * @module s3-utils-actual
 *
 * @description
 * This module exercises the actual S3 helpers from `lib/s3/*` without them being mocked.
 * This is a workaround to allow integration tests to use real S3 functions while unit
 * tests in the same file can use mocked versions.
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
  getObject,
  putObject,
  deleteFromS3,
  checkIfS3ObjectExists,
  getS3ObjectMetadata,
} from "@/lib/s3/objects";
import { readBinaryS3, writeBinaryS3 } from "@/lib/s3/binary";
import { readJsonS3, writeJsonS3 } from "@/lib/s3/json";
import { isS3ReadOnly } from "@/lib/utils/s3-read-only";
import { Readable } from "node:stream";
import { z } from "zod/v4";
let mockClient: ((c: any) => any) | null = null;
try {
  mockClient = require("aws-sdk-client-mock").mockClient;
} catch {
  mockClient = null;
}
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";

// Removed extraneous exports to satisfy ESLint rules

// Add a simple test to avoid empty test suite error
describe("S3 Utils Actual Export", () => {
  it("should export all required functions", () => {
    expect(typeof listS3Objects).toBe("function");
    expect(typeof getObject).toBe("function");
    expect(typeof readBinaryS3).toBe("function");
    expect(typeof readJsonS3).toBe("function");
    expect(typeof putObject).toBe("function");
    expect(typeof writeBinaryS3).toBe("function");
    expect(typeof writeJsonS3).toBe("function");
    expect(typeof deleteFromS3).toBe("function");
    expect(typeof checkIfS3ObjectExists).toBe("function");
    expect(typeof getS3ObjectMetadata).toBe("function");
  });
});

describe("S3 Read-Only Detection", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("treats production build phase as read-only when set at call time", () => {
    process.env.NEXT_PHASE = "phase-production-build";
    expect(isS3ReadOnly()).toBe(true);
  });

  it("respects explicit read-only override", () => {
    process.env.S3_READ_ONLY = "false";
    expect(isS3ReadOnly()).toBe(false);
  });
});

// Integration test should follow the same gating convention used by
// __tests__/scripts/update-s3-data.smoke.test.ts so that we have ONE
// place to configure live-AWS behavior during CI runs.

const S3_TEST_MODE = process.env.S3_TEST_MODE || "DRY"; // DRY | NORMAL | FULL

const IS_S3_CONFIGURED = Boolean(
  process.env.S3_BUCKET && process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY,
);

const SHOULD_RUN_LIVE_TESTS = S3_TEST_MODE !== "DRY" && IS_S3_CONFIGURED;

// Ensure live tests can perform write operations by disabling read-only mode
// Always prepare a client mock; when running live, we'll reset and let requests through
const s3Mock = mockClient ? mockClient(S3Client) : null;

beforeEach(() => {
  if (s3Mock) s3Mock.reset();
});

// Setup for live tests: ensure S3_READ_ONLY is false during test execution
beforeAll(() => {
  if (SHOULD_RUN_LIVE_TESTS) {
    process.env.S3_READ_ONLY = "false";
  }
});

afterAll(() => {
  // Cleanup is handled by individual test suites
});

// Use describe.runIf to conditionally run test suites based on environment
// This avoids the no-conditional-tests lint error while maintaining the same behavior

describe.runIf(SHOULD_RUN_LIVE_TESTS)("S3 Utils Integration – read/write JSON", () => {
  const TEST_KEY = "test/integration-test.json";
  const payload = { hello: "world", ts: Date.now() };
  const payloadSchema = z.object({ hello: z.string(), ts: z.number() });

  it("writes JSON to S3 and reads it back", async () => {
    await writeJsonS3(TEST_KEY, payload);
    const readBack = await readJsonS3(TEST_KEY, payloadSchema);
    expect(readBack).toEqual(payload);
  });

  afterAll(async () => {
    await deleteFromS3(TEST_KEY);
  });
});

// Mocked integration path using aws-sdk-client-mock (no network)
describe.runIf(!SHOULD_RUN_LIVE_TESTS && s3Mock !== null)(
  "S3 Utils Integration – read/write JSON (mocked)",
  () => {
    const TEST_KEY = "test/integration-test.json";
    const payload = { hello: "world", ts: 12345 };
    const payloadSchema = z.object({ hello: z.string(), ts: z.number() });

    it("writes JSON to S3 and reads it back via mocked client", async () => {
      if (!s3Mock) return; // Type guard for TypeScript

      let storedBody: string | null = null;

      // Mock PutObject to capture Body
      s3Mock.on(PutObjectCommand).callsFake((input) => {
        storedBody = typeof input.Body === "string" ? input.Body : String(input.Body);
        return { ETag: '"test-etag"' } as any;
      });

      // Mock GetObject to return captured Body as Readable stream
      s3Mock.on(GetObjectCommand).callsFake(() => {
        const body = storedBody ?? JSON.stringify({});
        return { Body: Readable.from([Buffer.from(body)]) } as any;
      });

      // Mock DeleteObject and ListObjects (satisfy potential calls)
      s3Mock.on(DeleteObjectCommand).resolves({} as any);
      s3Mock.on(ListObjectsV2Command).resolves({ Contents: [{ Key: TEST_KEY }] } as any);

      await writeJsonS3(TEST_KEY, payload);
      const readBack = await readJsonS3(TEST_KEY, payloadSchema);
      expect(readBack).toEqual(payload);

      // Exercise delete path without network
      await deleteFromS3(TEST_KEY);
    });
  },
);
