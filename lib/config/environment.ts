/**
 * Environment Configuration Module
 *
 * Ensures NODE_ENV is always properly set and validates environment-specific paths.
 * This prevents files from being created without the correct environment suffix.
 */

import logger from "@/lib/utils/logger";
import type { Environment } from "@/types/config";

const shouldLogEnvironmentInfo =
  process.env.DEBUG_ENVIRONMENT === "true" || process.env.DEBUG === "true" || process.env.VERBOSE === "true";

let loggedExplicitDeploymentEnv: string | null = null;
let loggedInvalidDeploymentWarning = false;
const loggedDetectionMessages = new Set<string>();

const logEnvironmentInfo = (message: string): void => {
  if (shouldLogEnvironmentInfo) {
    logger.info(message);
  }
};

/**
 * Get the current environment based on URL configuration
 * Uses API_BASE_URL or NEXT_PUBLIC_SITE_URL to determine environment
 *
 * CRITICAL: During build time, we MUST use explicit environment variables
 * because the deployment URL is not yet known. The DEPLOYMENT_ENV variable
 * should be set in CI/CD to match the target deployment.
 *
 * GITHUB ACTIVITY FIX: Always prefer DEPLOYMENT_ENV for consistency between
 * build-time and runtime to prevent environment-specific file mismatches.
 */
export function getEnvironment(): Environment {
  const isJest = typeof process !== "undefined" && !!process.env.JEST_WORKER_ID;

  // PRIORITY 1: Use explicit DEPLOYMENT_ENV if set (for build-time consistency)
  // In Jest, ignore DEPLOYMENT_ENV so tests can control behavior via NODE_ENV
  const deploymentEnv = isJest ? undefined : process.env.DEPLOYMENT_ENV;
  if (deploymentEnv) {
    const normalized = deploymentEnv.toLowerCase().trim();
    if (normalized === "production" || normalized === "development" || normalized === "test") {
      if (loggedExplicitDeploymentEnv !== normalized) {
        logEnvironmentInfo(`[Environment] Using explicit DEPLOYMENT_ENV: ${normalized}`);
        loggedExplicitDeploymentEnv = normalized;
      }
      return normalized as Environment;
    }
    // Log warning for invalid DEPLOYMENT_ENV values
    if (!loggedInvalidDeploymentWarning) {
      logger.warn(`[Environment] Invalid DEPLOYMENT_ENV value: '${deploymentEnv}', falling back to URL detection`);
      loggedInvalidDeploymentWarning = true;
    }
  }

  // PRIORITY 2: Try to infer from URLs (runtime detection)
  // Prefer explicit env vars. In Jest, allow jsdom location only when NODE_ENV is 'test',
  // so tests that switch NODE_ENV to 'production' can validate production behavior.
  let apiUrl: string | undefined = process.env.API_BASE_URL || process.env.NEXT_PUBLIC_SITE_URL;
  if (!apiUrl && isJest && (process.env.NODE_ENV || "test").toLowerCase().trim() === "test") {
    try {
      const loc = (globalThis as unknown as { location?: { href?: string; origin?: string } }).location;
      apiUrl = loc?.origin || loc?.href || undefined;
    } catch {
      // ignore
    }
  }

  if (apiUrl) {
    // Check if it's localhost (local development)
    if (apiUrl.includes("localhost") || apiUrl.includes("127.0.0.1")) {
      if (!loggedDetectionMessages.has("localhost")) {
        logEnvironmentInfo("[Environment] Detected localhost - using development");
        loggedDetectionMessages.add("localhost");
      }
      return "development";
    }

    // Check if it's dev.williamcallahan.com
    if (apiUrl.includes("dev.williamcallahan.com")) {
      if (!loggedDetectionMessages.has("dev-domain")) {
        logEnvironmentInfo("[Environment] Detected dev.williamcallahan.com - using development");
        loggedDetectionMessages.add("dev-domain");
      }
      return "development";
    }

    // Check if it's production williamcallahan.com
    if (apiUrl.includes("williamcallahan.com") && !apiUrl.includes("dev.")) {
      if (!loggedDetectionMessages.has("prod-domain")) {
        logEnvironmentInfo("[Environment] Detected williamcallahan.com - using production");
        loggedDetectionMessages.add("prod-domain");
      }
      return "production";
    }
  }

  // PRIORITY 3: Fallback to NODE_ENV if URLs aren't set
  const env = process.env.NODE_ENV;

  if (!env) {
    logger.warn("[Environment] No URL or NODE_ENV set, defaulting to 'development'");
    return "development";
  }

  // Normalize NODE_ENV variations
  const normalized = env.toLowerCase().trim();

  switch (normalized) {
    case "production":
    case "prod":
      return "production";
    case "development":
    case "dev":
      return "development";
    case "test":
    case "testing":
      return "test";
    default:
      logger.warn(`[Environment] Unknown NODE_ENV value: '${env}', defaulting to 'development'`);
      return "development";
  }
}

/**
 * Get the environment suffix for S3 paths
 * Production uses no suffix, other environments use -env
 */
export function getEnvironmentSuffix(): string {
  const env = getEnvironment();

  switch (env) {
    case "production":
      return "";
    case "test":
      return "-test";
    default:
      return "-dev";
  }
}

/**
 * Validate that a path includes the correct environment suffix
 */
export function validateEnvironmentPath(path: string): boolean {
  const suffix = getEnvironmentSuffix();
  const env = getEnvironment();

  // For production (no suffix), ensure path doesn't have -dev or -test
  if (env === "production") {
    if (
      path.includes("-dev.json") ||
      path.includes("-test.json") ||
      path.includes("-dev/") ||
      path.includes("-test/")
    ) {
      logger.error(`[Environment] Production path should not have suffix: ${path}`);
      return false;
    }
    return true;
  }

  // For dev/test, ensure path has the correct suffix
  if (path.endsWith(".json")) {
    const expectedEnding = `${suffix}.json`;
    const expectedDir = `${suffix}/`;

    // Check if suffix is in the filename (e.g., data-dev.json)
    // OR in the directory path (e.g., pages-dev/page-1.json)
    if (!path.includes(expectedEnding) && !path.includes(expectedDir)) {
      logger.error(`[Environment] Path missing ${env} suffix: ${path}`);
      logger.error(`[Environment] Expected '${expectedEnding}' in filename OR '${expectedDir}' in directory`);
      return false;
    }
  }

  return true;
}

/**
 * Ensure a path has the correct environment suffix
 */
export function ensureEnvironmentPath(basePath: string): string {
  const suffix = getEnvironmentSuffix();

  // If it's a JSON file, insert suffix before .json
  if (basePath.endsWith(".json")) {
    // Remove any existing environment suffix
    const cleaned = basePath
      .replace("-dev.json", ".json")
      .replace("-test.json", ".json")
      .replace("-prod.json", ".json");

    // Add the correct suffix
    return cleaned.replace(".json", `${suffix}.json`);
  }

  // For directories or other paths, append suffix
  return `${basePath}${suffix}`;
}

/**
 * Log current environment configuration
 */
export function logEnvironmentConfig(): void {
  const env = getEnvironment();
  const suffix = getEnvironmentSuffix();

  logEnvironmentInfo("[Environment] Configuration:");
  logEnvironmentInfo(`  NODE_ENV: ${process.env.NODE_ENV || "(not set)"}`);
  logEnvironmentInfo(`  Normalized: ${env}`);
  logEnvironmentInfo(`  Suffix: "${suffix}"`);
  logEnvironmentInfo(`  Example path: json/bookmarks/data${suffix}.json`);
}

// Validate on module load
const currentEnv = getEnvironment();
const currentSuffix = getEnvironmentSuffix();

// Export validated values
export const CURRENT_ENVIRONMENT = currentEnv;
export const ENVIRONMENT_SUFFIX = currentSuffix;

// Log warning if NODE_ENV is not explicitly set
if (!process.env.NODE_ENV) {
  console.warn(
    "⚠️  NODE_ENV is not set! Defaulting to 'development'. " +
      "This may cause S3 path mismatches. " +
      "Set NODE_ENV=development|production|test to fix this.",
  );
}
