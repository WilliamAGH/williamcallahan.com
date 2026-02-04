/**
 * S3 Client Factory
 *
 * Owns S3Client initialization and re-use. Reads env via config module only.
 *
 * @module lib/s3/client
 */

import { S3Client } from "@aws-sdk/client-s3";
import { debug, isDebug } from "@/lib/utils/debug";
import { envLogger } from "@/lib/utils/env-logger";
import { getS3Config } from "./config";

let s3ClientInstance: S3Client | null = null;
let cachedConfigKey: string | null = null;
let hasLoggedS3ClientInitialization = false;

export function resetS3Client(): void {
  s3ClientInstance = null;
  cachedConfigKey = null;
}

export function getS3Client(): S3Client {
  const config = getS3Config();
  const configKey = `${config.bucket}|${config.region}|${config.endpoint ?? "default"}|${config.accessKeyId}`;

  if (s3ClientInstance && cachedConfigKey === configKey) {
    return s3ClientInstance;
  }

  const baseConfig = {
    region: config.region,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    forcePathStyle: true,
    maxAttempts: 5,
    retryMode: "adaptive" as const,
  };

  s3ClientInstance = config.endpoint
    ? new S3Client({ ...baseConfig, endpoint: config.endpoint })
    : new S3Client(baseConfig);
  cachedConfigKey = configKey;

  const initDetails = {
    bucket: config.bucket,
    endpoint: config.endpoint ?? "SDK default",
    region: config.region,
  } as const;

  if (!hasLoggedS3ClientInitialization) {
    envLogger.log("S3 client initialized", initDetails, { category: "S3Utils" });
    hasLoggedS3ClientInitialization = true;
  } else {
    envLogger.debug("S3 client already initialized", initDetails, { category: "S3Utils" });
  }

  if (isDebug) {
    debug(
      `[S3Utils] S3 client initialized (${config.endpoint ? "custom endpoint" : "sdk default endpoint"}).`,
    );
  }

  return s3ClientInstance;
}
