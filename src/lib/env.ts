import { envSchema, type Env } from "@/types/schemas/env";
import { loadEnvironmentWithMultilineSupport } from "@/lib/utils/env-loader";

// CRITICAL: Load environment variables before any other code runs.
loadEnvironmentWithMultilineSupport();

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
 * Default values for environment variables, used primarily in test environments
 * or as a fallback in development when certain keys are not set.
 * This ensures that the application can run without a complete .env file,
 * facilitating testing and local UI development.
 */
const testDefaults: Env = {
  S3_BUCKET: "test-bucket",
  S3_ACCESS_KEY_ID: "test-access-key",
  S3_SECRET_ACCESS_KEY: "test-secret-key",
  S3_REGION: "us-east-1",
  AWS_ACCESS_KEY_ID: "test-access-key",
  AWS_SECRET_ACCESS_KEY: "test-secret-key",
  AWS_REGION: "us-east-1",
  NODE_ENV: "test",
  NEXT_PUBLIC_S3_CDN_URL: "https://test-cdn.example.com",
};

/**
 * Parses and validates the environment variables against the Zod schema.
 *
 * This function is the single source of truth for accessing environment variables.
 * It ensures that all required variables are present and correctly typed before
 * they are used anywhere else in the application.
 *
 * In `test` or `DRY_RUN` modes, it allows for a partial environment, merging
 * missing values with safe defaults to facilitate testing.
 *
 * @throws {ZodError} If validation fails in a non-test, non-dry-run environment.
 * @returns {Env} A fully validated environment object.
 */
function loadEnv(): Env {
  try {
    return envSchema.parse(process.env);
  } catch (error) {
    const isDev = process.env.NODE_ENV === "development";
    const isTestLike = process.env.NODE_ENV === "test" || process.env.DRY_RUN === "true";

    if (isDev || isTestLike) {
      console.warn(
        "⚠️ WARNING: Environment validation failed. This is acceptable for local development or testing, but will be a FATAL ERROR in production. Using fallback values for missing variables.",
      );
      const partialEnv = envSchema.partial().parse(process.env);
      return { ...testDefaults, ...partialEnv } as Env;
    }
    console.error("⛔️ FATAL: Missing or invalid environment variables in production.", error);
    throw error;
  }
}

/**
 * A Zod-validated, type-safe object representing the application's environment variables.
 * This is the single source of truth for all environment configuration.
 * It is populated by the `loadEnv` function upon application startup.
 */
export const env: Env = loadEnv();
