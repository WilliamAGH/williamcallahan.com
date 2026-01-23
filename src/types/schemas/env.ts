import { z } from "zod/v4";

/**
 * Define the schema for server-side environment variables.
 * Using Zod ensures that the environment variables are correctly typed and that
 * the application fails fast if any required variables are missing.
 */
export const envSchema = z.object({
  // Variables needed for lib/data-access/images.server.ts
  S3_BUCKET: z.string().min(1),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1),
  S3_REGION: z.string().min(1),

  // Optional AWS-style aliases (used by AWS CLI tooling and legacy integrations)
  AWS_ACCESS_KEY_ID: z.string().min(1).optional(),
  AWS_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  AWS_REGION: z.string().min(1).optional(),

  // Add other server-side environment variables here
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  // Public environment variables (available on client-side)
  NEXT_PUBLIC_S3_CDN_URL: z.url(),
});

// Export a reusable inferred type for validated env
export type Env = z.infer<typeof envSchema>;

/**
 * Zod schema for AudioBookShelf environment configuration.
 * Validates that required env vars are present and properly formatted.
 */
export const absConfigSchema = z.object({
  baseUrl: z.url(),
  apiKey: z.string().min(1, "API key is required"),
  libraryId: z.string().min(1, "Library ID is required"),
});

export type AbsConfig = z.infer<typeof absConfigSchema>;
