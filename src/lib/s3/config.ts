import { s3ConfigSchema, type S3Config } from "@/types/schemas/s3-config";
import { S3ConfigError, S3DryRunError } from "./errors";

const normalizeEnvValue = (value: string | undefined): string | undefined => {
  if (value == null) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const buildS3ConfigInput = (): S3Config => {
  const bucket = normalizeEnvValue(process.env.S3_BUCKET);
  const accessKeyId = normalizeEnvValue(process.env.S3_ACCESS_KEY_ID);
  const secretAccessKey = normalizeEnvValue(process.env.S3_SECRET_ACCESS_KEY);
  const region =
    normalizeEnvValue(process.env.S3_REGION) ??
    normalizeEnvValue(process.env.AWS_REGION) ??
    "us-east-1";
  const endpoint = normalizeEnvValue(process.env.S3_SERVER_URL);

  const result = s3ConfigSchema.safeParse({
    bucket,
    accessKeyId,
    secretAccessKey,
    region,
    endpoint,
  });

  if (!result.success) {
    const missingKeys = result.error.issues
      .map((issue) => issue.path.join("."))
      .filter((key) => key.length > 0);
    throw new S3ConfigError(missingKeys.length > 0 ? missingKeys : ["S3 configuration"]);
  }

  return result.data;
};

export const getS3Config = (): S3Config => buildS3ConfigInput();

export const isDryRunEnabled = (): boolean => process.env.DRY_RUN === "true";

export const assertNotDryRun = (operation: string, key?: string): void => {
  if (isDryRunEnabled()) {
    throw new S3DryRunError(operation, key);
  }
};
