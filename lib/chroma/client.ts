/**
 * Chroma Vector Store Client
 *
 * Provides a configured CloudClient instance for Chroma Cloud operations.
 * Validates configuration at initialization to fail fast on misconfiguration.
 */

import { CloudClient } from "chromadb";
import { ChromaCloudConfigSchema, type ChromaCloudConfig } from "@/types/schemas/chroma";

let clientInstance: CloudClient | null = null;
let configuredConfig: ChromaCloudConfig | null = null;

/**
 * Gets Chroma configuration from environment variables.
 * Returns undefined if any required variable is missing.
 */
export function getChromaConfigFromEnv(): ChromaCloudConfig | undefined {
  const apiKey = process.env.CHROMA_API_KEY;
  const tenant = process.env.CHROMA_TENANT;
  const database = process.env.CHROMA_DATABASE;

  if (!apiKey || !tenant || !database) {
    return undefined;
  }

  return { apiKey, tenant, database };
}

/**
 * Creates or returns a singleton CloudClient instance.
 * Validates configuration using Zod schema before connecting.
 *
 * @param config - Chroma Cloud configuration (apiKey, tenant, database). If omitted, reads from env vars.
 * @returns Configured CloudClient instance
 * @throws ZodError if configuration is invalid
 * @throws Error if no config provided and env vars are missing
 */
export function getChromaClient(config?: ChromaCloudConfig): CloudClient {
  // Use provided config or fall back to environment variables
  const effectiveConfig = config ?? getChromaConfigFromEnv();

  if (!effectiveConfig) {
    throw new Error(
      "Chroma configuration required. Set CHROMA_API_KEY, CHROMA_TENANT, and CHROMA_DATABASE environment variables, or provide config directly.",
    );
  }

  // Validate configuration
  const validatedConfig = ChromaCloudConfigSchema.parse(effectiveConfig);

  // Return existing instance if config matches
  if (
    clientInstance &&
    configuredConfig?.apiKey === validatedConfig.apiKey &&
    configuredConfig?.tenant === validatedConfig.tenant &&
    configuredConfig?.database === validatedConfig.database
  ) {
    return clientInstance;
  }

  // Create new client with validated config
  clientInstance = new CloudClient({
    apiKey: validatedConfig.apiKey,
    tenant: validatedConfig.tenant,
    database: validatedConfig.database,
    ...(validatedConfig.host && { host: validatedConfig.host }),
    ...(validatedConfig.port && { port: validatedConfig.port }),
  });

  configuredConfig = validatedConfig;
  return clientInstance;
}

/**
 * Clears the singleton client instance.
 * Useful for testing or reconfiguration scenarios.
 */
export function resetChromaClient(): void {
  clientInstance = null;
  configuredConfig = null;
}

// Re-export commonly used types from chromadb for convenience
export type { Collection, Metadata, Where, WhereDocument, GetResult, QueryResult } from "chromadb";

// Re-export schema types
export type { ChromaCloudConfig, ChromaDocument, ChromaMetadata } from "@/types/schemas/chroma";
