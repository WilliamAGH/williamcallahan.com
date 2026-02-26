import { drizzle } from "drizzle-orm/postgres-js";
import postgres, { type Sql } from "postgres";

const DEFAULT_DATABASE_POOL_MAX = 5;
const TEST_DATABASE_URL_PLACEHOLDER = "postgres://invalid:invalid@127.0.0.1:5432/invalid";
const PRODUCTION_ENVIRONMENT = "production";

const databaseUrl = process.env.DATABASE_URL?.trim();
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
