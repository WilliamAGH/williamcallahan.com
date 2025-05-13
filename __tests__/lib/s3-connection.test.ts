// __tests__/lib/s3-connection.test.ts
import { describe, it, expect } from 'bun:test';
// Remove AWS SDK import
// import { HeadBucketCommand } from '@aws-sdk/client-s3';
// Import the S3Client and s3 global from bun directly
// import { s3 } from "bun"; // Use the global s3 object
// Import the configured client and bucket name from s3-utils - keep for comparison or if needed elsewhere, but test uses BunS3Client
// import { s3Client as awsS3Client } from '@/lib/s3-utils';
// Import the S3Client from bun directly
import { S3Client } from "bun"; // Import S3Client directly

// Get S3 configuration from environment variables, matching the .env file
const s3Bucket = process.env.S3_BUCKET;
const s3ServerUrl = process.env.S3_SERVER_URL; // Matches .env
const awsRegion = process.env.AWS_REGION;       // Matches .env
const s3AccessKeyId = process.env.S3_ACCESS_KEY_ID; // Matches .env
const s3SecretAccessKey = process.env.S3_SECRET_ACCESS_KEY; // Matches .env

const TEST_FILE_KEY = '__bun_s3_connection_test_file__.txt';

describe('S3 Connection Test (using Bun S3 native with explicit config)', () => {
  const canRunSuite = !!(s3Bucket && s3ServerUrl && awsRegion && s3AccessKeyId && s3SecretAccessKey);
  /* eslint-disable @typescript-eslint/unbound-method */
  const maybeDescribe = canRunSuite ? describe : describe.skip;
  const maybeIt = canRunSuite ? it : it.skip;
  const maybePlaceholderIt = canRunSuite ? it.skip : it;
  /* eslint-enable @typescript-eslint/unbound-method */

  maybeDescribe('S3 Operations', () => {
    const client = new S3Client({
      bucket: s3Bucket,
      endpoint: s3ServerUrl, // Use the S3_SERVER_URL from .env
      region: awsRegion,
      accessKeyId: s3AccessKeyId,
      secretAccessKey: s3SecretAccessKey,
    });

    maybeIt('should connect to S3 and check file existence using S3Client.exists()', async () => {
      console.log(`[S3 Connection Test] Bun version: ${Bun.version}`);
      console.log(`[S3 Connection Test] Attempting to check existence of file '${TEST_FILE_KEY}' in bucket '${s3Bucket}' at endpoint '${s3ServerUrl}'`);
      const exists = await client.exists(TEST_FILE_KEY);
      expect(exists).toBeTypeOf('boolean');
    }, 15000);
  });

  // Placeholder test for when config is missing
  maybePlaceholderIt('placeholder test if S3 config from .env is not fully set', () => {
    console.warn('[S3 Connection Test] One or more S3 environment variables (S3_BUCKET, S3_SERVER_URL, AWS_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY) not set. Skipping S3 operations tests.');
    expect(true).toBe(true);
  });
});
