import { drizzle } from "drizzle-orm/postgres-js";
import postgres, { type Sql } from "postgres";

const databaseUrl = process.env.DATABASE_URL?.trim();

if (!databaseUrl) {
  throw new Error("DATABASE_URL environment variable is required for PostgreSQL access.");
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
  postgres(databaseUrl, {
    max: resolveOptionalPositiveInt("DATABASE_POOL_MAX", 10),
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
