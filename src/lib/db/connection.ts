/**
 * PostgreSQL Connection (Drizzle + postgres.js)
 *
 * WARNING [RT1]: This module uses `ssl: "require"`. Bun's TLS implementation
 * fails to negotiate signature algorithms with the PostgreSQL server. All
 * standalone database scripts MUST run under Node.js (not bun).
 * See CLAUDE.md [RT1] for the full runtime isolation policy.
 *
 * @module db/connection
 */
import { drizzle } from "drizzle-orm/postgres-js";
import postgres, { type Sql } from "postgres";

const DEFAULT_DATABASE_POOL_MAX = 5;
const TEST_DATABASE_URL_PLACEHOLDER = "postgres://invalid:invalid@127.0.0.1:5432/invalid";
const PRODUCTION_ENVIRONMENT = "production";
const PRODUCTION_SITE_URL = "https://williamcallahan.com";
const EXTERNAL_PRODUCTION_DB_HOST = "167.234.219.57";
const EXTERNAL_PRODUCTION_DB_PORT = "5438";
const DEFAULT_INTERNAL_PRODUCTION_DB_HOST = "q0kks8ww044c0o4w4o4ok408";
const DEFAULT_INTERNAL_PRODUCTION_DB_PORT = "5432";
const DEFAULT_POSTGRES_PORT = "5432";
const UNPARSEABLE_DATABASE_URL_TARGET = "<unparseable-database-url>";

const getRedactedDatabaseUrlTarget = (rawUrl: string): string => {
  try {
    const parsed = new URL(rawUrl);
    return `${parsed.protocol}//${parsed.hostname}:${parsed.port || DEFAULT_POSTGRES_PORT}`;
  } catch {
    return UNPARSEABLE_DATABASE_URL_TARGET;
  }
};

const rewriteDatabaseUrlForProductionSite = (rawUrl: string | undefined): string | undefined => {
  if (!rawUrl) return rawUrl;
  if (process.env.NEXT_PUBLIC_SITE_URL?.trim() !== PRODUCTION_SITE_URL) {
    return rawUrl;
  }

  try {
    const parsed = new URL(rawUrl);
    if (
      parsed.hostname !== EXTERNAL_PRODUCTION_DB_HOST ||
      parsed.port !== EXTERNAL_PRODUCTION_DB_PORT
    ) {
      return rawUrl;
    }

    const internalHost =
      process.env.INTERNAL_DATABASE_HOST?.trim() || DEFAULT_INTERNAL_PRODUCTION_DB_HOST;
    const internalPort =
      process.env.INTERNAL_DATABASE_PORT?.trim() || DEFAULT_INTERNAL_PRODUCTION_DB_PORT;
    parsed.hostname = internalHost;
    parsed.port = internalPort;
    return parsed.toString();
  } catch (error) {
    console.warn(
      "[db/connection] Failed to parse DATABASE_URL for internal rewrite:",
      getRedactedDatabaseUrlTarget(rawUrl),
      error,
    );
    return rawUrl;
  }
};

const databaseUrl = rewriteDatabaseUrlForProductionSite(process.env.DATABASE_URL?.trim());
const isTestEnvironment = process.env.NODE_ENV === "test";

if (!databaseUrl && !isTestEnvironment) {
  throw new Error("DATABASE_URL environment variable is required for PostgreSQL access.");
}

const resolvedDatabaseUrl = databaseUrl ?? TEST_DATABASE_URL_PLACEHOLDER;

const normalizeEnvironmentName = (value: string | undefined): string => {
  const normalized = (value ?? "").trim().toLowerCase();
  if (normalized === "prod") {
    return PRODUCTION_ENVIRONMENT;
  }
  if (normalized === "testing") {
    return "test";
  }
  return normalized;
};

const resolveWriteEnvironment = (): { environment: string; source: string } => {
  const deploymentEnvironment = process.env.DEPLOYMENT_ENV?.trim();
  if (deploymentEnvironment && deploymentEnvironment.length > 0) {
    return {
      environment: normalizeEnvironmentName(deploymentEnvironment),
      source: "DEPLOYMENT_ENV",
    };
  }

  const nodeEnvironment = process.env.NODE_ENV?.trim();
  if (nodeEnvironment && nodeEnvironment.length > 0) {
    return {
      environment: normalizeEnvironmentName(nodeEnvironment),
      source: "NODE_ENV",
    };
  }

  return {
    environment: "unknown",
    source: "environment-default",
  };
};

export function assertDatabaseWriteAllowed(operation: string): void {
  const { environment, source } = resolveWriteEnvironment();
  if (environment === PRODUCTION_ENVIRONMENT) {
    return;
  }

  throw new Error(
    `[db/write-guard] Blocked PostgreSQL write "${operation}" because ${source} resolved to "${environment}". ` +
      "This project uses one shared database; only production runtime may write to PostgreSQL.",
  );
}

const resolveOptionalPositiveInt = (envName: string, defaultValue: number): number => {
  const rawValue = process.env[envName];
  if (!rawValue || rawValue.trim().length === 0) {
    return defaultValue;
  }

  const parsedValue = Number.parseInt(rawValue, 10);
  if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
    throw new Error(`${envName} must be a positive integer. Received: "${rawValue}"`);
  }

  return parsedValue;
};

const createClient = (): Sql<Record<string, unknown>> =>
  postgres(resolvedDatabaseUrl, {
    max: resolveOptionalPositiveInt("DATABASE_POOL_MAX", DEFAULT_DATABASE_POOL_MAX),
    idle_timeout: resolveOptionalPositiveInt("DATABASE_IDLE_TIMEOUT_SECONDS", 20),
    connect_timeout: resolveOptionalPositiveInt("DATABASE_CONNECT_TIMEOUT_SECONDS", 10),
    ssl: "require",
  });

const globalForDb = globalThis as typeof globalThis & {
  drizzleClientSingleton?: Sql<Record<string, unknown>>;
};

const client = globalForDb.drizzleClientSingleton ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForDb.drizzleClientSingleton = client;
}

export const db = drizzle(client);

export async function closeDatabaseConnection(): Promise<void> {
  await client.end({ timeout: 5 });
}
