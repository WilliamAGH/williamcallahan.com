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
const PRODUCTION_ENVIRONMENT = "production";
const PRODUCTION_HOSTNAME = "williamcallahan.com";
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
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!siteUrl) return rawUrl;
  try {
    if (new URL(siteUrl).hostname !== PRODUCTION_HOSTNAME) return rawUrl;
  } catch (error) {
    console.warn(
      `[db/connection] Invalid NEXT_PUBLIC_SITE_URL "${siteUrl}" during DATABASE_URL rewrite; skipping rewrite.`,
      error instanceof Error ? error.message : String(error),
    );
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
      error instanceof Error ? error.message : String(error),
    );
    return rawUrl;
  }
};

const databaseUrl = rewriteDatabaseUrlForProductionSite(process.env.DATABASE_URL?.trim());

if (!databaseUrl) {
  throw new Error("DATABASE_URL environment variable is required for PostgreSQL access.");
}

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

/**
 * Derives the deployment environment from NEXT_PUBLIC_SITE_URL.
 * This is the most reliable signal because it reflects the actual deployment target,
 * not a separately-managed env var that can drift out of sync.
 *
 * For the production URL, NODE_ENV must also be "production" to prevent local
 * development (NODE_ENV=development) from accidentally writing to the shared database
 * when NEXT_PUBLIC_SITE_URL happens to point at the production domain.
 */
const resolveEnvironmentFromSiteUrl = (): { environment: string; source: string } | null => {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!siteUrl) return null;

  let parsed: URL;
  try {
    parsed = new URL(siteUrl);
  } catch {
    console.warn(
      `[db/connection] NEXT_PUBLIC_SITE_URL is not a valid URL: "${siteUrl}"; skipping site-URL resolution.`,
    );
    return null;
  }

  if (parsed.hostname === "williamcallahan.com") {
    // Guard: only resolve to production when NODE_ENV also confirms production runtime.
    // This prevents local dev with NEXT_PUBLIC_SITE_URL=production from writing.
    if (process.env.NODE_ENV?.trim() === PRODUCTION_ENVIRONMENT) {
      return { environment: PRODUCTION_ENVIRONMENT, source: "NEXT_PUBLIC_SITE_URL" };
    }
    return null;
  }

  if (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") {
    return { environment: "development", source: "NEXT_PUBLIC_SITE_URL" };
  }

  const DEV_SUBDOMAIN_PREFIXES = ["alpha", "dev", "sandbox"];
  const subdomainMatch = parsed.hostname.match(/^([^.]+)\.williamcallahan\.com$/);
  if (subdomainMatch?.[1]) {
    if (DEV_SUBDOMAIN_PREFIXES.includes(subdomainMatch[1])) {
      return { environment: "development", source: "NEXT_PUBLIC_SITE_URL" };
    }
    // Unknown subdomain of production host — treat as non-production to prevent
    // accidental writes from new/unrecognized deployments (e.g. beta.williamcallahan.com).
    console.warn(
      `[db/connection] Unrecognized subdomain "${subdomainMatch[1]}.williamcallahan.com"; resolving as development.`,
    );
    return { environment: "development", source: "NEXT_PUBLIC_SITE_URL" };
  }

  return null;
};

const resolveWriteEnvironment = (): { environment: string; source: string } => {
  // NEXT_PUBLIC_SITE_URL is the most reliable signal — it reflects the actual
  // deployment target and cannot drift like DEPLOYMENT_ENV.
  const fromSiteUrl = resolveEnvironmentFromSiteUrl();
  if (fromSiteUrl) return fromSiteUrl;

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

export const resolveDatabaseAccessMode = (): {
  allowWrites: boolean;
  environment: string;
  source: string;
} => {
  const resolvedEnvironment = resolveWriteEnvironment();
  return {
    allowWrites: resolvedEnvironment.environment === PRODUCTION_ENVIRONMENT,
    ...resolvedEnvironment,
  };
};

export function assertDatabaseWriteAllowed(operation: string): void {
  const { allowWrites, environment, source } = resolveDatabaseAccessMode();
  if (allowWrites) {
    return;
  }

  throw new Error(
    `[db/write-guard] Blocked PostgreSQL write "${operation}" because ${source} resolved to "${environment}". ` +
      `NEXT_PUBLIC_SITE_URL="${process.env.NEXT_PUBLIC_SITE_URL ?? "(unset)"}"; ` +
      `DEPLOYMENT_ENV="${process.env.DEPLOYMENT_ENV ?? "(unset)"}"; ` +
      `NODE_ENV="${process.env.NODE_ENV ?? "(unset)"}". ` +
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

const createClient = (): Sql<Record<string, unknown>> => {
  const { allowWrites, environment } = resolveDatabaseAccessMode();

  return postgres(databaseUrl, {
    max: resolveOptionalPositiveInt("DATABASE_POOL_MAX", DEFAULT_DATABASE_POOL_MAX),
    idle_timeout: resolveOptionalPositiveInt("DATABASE_IDLE_TIMEOUT_SECONDS", 20),
    connect_timeout: resolveOptionalPositiveInt("DATABASE_CONNECT_TIMEOUT_SECONDS", 10),
    ssl: "require",
    connection: {
      application_name: `williamcallahan.com:${environment || "unknown"}`,
      default_transaction_read_only: !allowWrites,
    },
  });
};

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
