import { envSchema, type Env } from "@/types/schemas/env";

/**
 * Parse and validate the environment variables against the schema.
 *
 * In normal operation the application should fail fast if required variables
 * are missing.  However, in test environments or when the code is explicitly
 * running in `DRY_RUN` mode we want to allow execution to continue even when
 * certain required variables (e.g. `S3_BUCKET`) are not set.  This is
 * necessary for smoke-tests that intentionally clear these variables to
 * validate fallback behavior.
 */
// Note: zod schemas and type aliases live in @/types per repo lint rules.


/**
 * Resolved and validated environment variables. In production it must satisfy
 * the schema entirely; in `test` or `DRY_RUN` modes we relax the requirement so
 * that smoke-tests can deliberately unset variables.
 */



// Test defaults for environments where some env vars may be missing
const testDefaults: Env = {
  AWS_ACCESS_KEY_ID: "test-access-key",
  AWS_SECRET_ACCESS_KEY: "test-secret-key",
  S3_BUCKET: "test-bucket",
  AWS_REGION: "us-east-1",
  NODE_ENV: "test",
  NEXT_PUBLIC_S3_CDN_URL: "https://test-cdn.example.com"
};

function loadEnv(): Env {
  try {
    return envSchema.parse(process.env);
  } catch (error) {
    const isTestLike = process.env.NODE_ENV === "test" || process.env.DRY_RUN === "true";
    if (isTestLike) {
      // Allow partial schema during tests or dry runs by merging with safe defaults.
      // This ensures type safety while allowing tests to override specific values.
      const partialEnv = envSchema.partial().parse(process.env);
      return { ...testDefaults, ...partialEnv } as Env;
    }
    throw error;
  }
}

export const env: Env = loadEnv();
