import { envSchema } from "@/types/schemas/env";
import { loadEnvironmentWithMultilineSupport } from "@/lib/utils/env-loader";

// CRITICAL: Load environment variables before any other code runs.
loadEnvironmentWithMultilineSupport();

/**
 * A Zod-validated, type-safe object representing the application's environment
 * variables. It is populated at startup and fails explicitly when required
 * configuration is missing or invalid.
 */
export const env = envSchema.parse(process.env);
