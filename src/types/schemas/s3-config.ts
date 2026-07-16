import { z } from "zod/v4";

const nonEmptyString = z.string().min(1);
const URL_SCHEME_PREFIX = /^[a-z][a-z\d+.-]*:\/\//i;

export const s3EndpointSchema = z.preprocess(
  (value) => {
    if (typeof value !== "string") return value;
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    return URL_SCHEME_PREFIX.test(trimmed) ? trimmed : `https://${trimmed}`;
  },
  z
    .url({ protocol: /^https?$/ })
    .refine((value) => {
      const endpoint = new URL(value);
      return (
        !endpoint.username &&
        !endpoint.password &&
        endpoint.pathname === "/" &&
        !endpoint.search &&
        !endpoint.hash
      );
    }, "S3 endpoint must be an origin without credentials, path, query, or fragment.")
    .transform((value) => new URL(value).origin)
    .optional(),
);

export function parseS3Endpoint(value: string | undefined): string | undefined {
  const result = s3EndpointSchema.safeParse(value);
  if (!result.success) {
    throw new Error("S3_SERVER_URL must be a valid HTTP(S) endpoint.", {
      cause: result.error,
    });
  }
  return result.data;
}

export const s3ConfigSchema = z.object({
  bucket: nonEmptyString,
  accessKeyId: nonEmptyString,
  secretAccessKey: nonEmptyString,
  region: nonEmptyString,
  endpoint: s3EndpointSchema,
});

export type S3Config = z.infer<typeof s3ConfigSchema>;
