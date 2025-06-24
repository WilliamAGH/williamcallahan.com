import { envSchema } from "@/types/schemas/env";

/**
 * Parse and validate the environment variables against the schema.
 * This will throw a detailed error at startup if any validation fails.
 */
export const env = envSchema.parse(process.env);
