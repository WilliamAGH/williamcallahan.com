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
 */

export {
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
} from '../../lib/s3-utils';
