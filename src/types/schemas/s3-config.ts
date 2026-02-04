import { z } from "zod/v4";

const nonEmptyString = z.string().min(1);

const optionalNonEmptyString = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().min(1).optional(),
);

export const s3ConfigSchema = z.object({
  bucket: nonEmptyString,
  accessKeyId: nonEmptyString,
  secretAccessKey: nonEmptyString,
  region: nonEmptyString,
  endpoint: optionalNonEmptyString,
});

export type S3Config = z.infer<typeof s3ConfigSchema>;
