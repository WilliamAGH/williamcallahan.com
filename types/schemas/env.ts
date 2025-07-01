import { z } from "zod";

/**
 * Define the schema for server-side environment variables.
 * Using Zod ensures that the environment variables are correctly typed and that
 * the application fails fast if any required variables are missing.
 */
export const envSchema = z.object({
  // Variables needed for lib/data-access/images.server.ts
  AWS_ACCESS_KEY_ID: z.string().min(1),
  AWS_SECRET_ACCESS_KEY: z.string().min(1),
  S3_BUCKET: z.string().min(1),
  AWS_REGION: z.string().min(1),

  // Add other server-side environment variables here
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});
