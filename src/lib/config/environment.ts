/**
 * Environment Configuration Module
 *
 * Ensures NODE_ENV is always properly set and validates environment-specific paths.
 * This prevents files from being created without the correct environment suffix.
 */

import logger from "@/lib/utils/logger";
import { normalizeString } from "@/lib/utils";
import type { Environment } from "@/types/config";

const shouldLogEnvironmentInfo =
  process.env.DEBUG_ENVIRONMENT === "true" ||
  process.env.DEBUG === "true" ||
  process.env.VERBOSE === "true";

let loggedInvalidDeploymentWarning = false;
const loggedDetectionMessages = new Set<string>();

const logEnvironmentInfo = (message: string): void => {
  if (shouldLogEnvironmentInfo) {
    logger.info(message);
  }
};

/**
 * Checks if the current runtime is a test environment
 */
function isTestRuntime(): boolean {
  return (
    typeof process !== "undefined" &&
    (process.env.NODE_ENV === "test" ||
      process.env.VITEST === "true" ||
      process.env.TEST === "true")
  );
}

/**
 * Validates if a normalized environment name is a valid Environment value
 */
function isValidEnvironment(normalized: string): boolean {
  return normalized === "production" || normalized === "development" || normalized === "test";
}

/**
 * Gets the API URL from environment variables or global location (in tests)
 */
function getApiUrl(): string | undefined {
  const url = process.env.API_BASE_URL || process.env.NEXT_PUBLIC_SITE_URL;
  if (url) return url;

  // In tests, allow jsdom location only when NODE_ENV is 'test'
  if (isTestRuntime() && normalizeString(process.env.NODE_ENV || "test") === "test") {
    try {
      const loc = (globalThis as unknown as { location?: { href?: string; origin?: string } })
        .location;
      return loc?.origin || loc?.href || undefined;
    } catch {
      // ignore
    }
  }
  return undefined;
}

/**
 * Logs a detection message once per unique key
 */
function logDetectionOnce(key: string, env: Environment): void {
  if (!loggedDetectionMessages.has(key)) {
    logEnvironmentInfo(`[Environment] Detected ${key} - using ${env}`);
    loggedDetectionMessages.add(key);
  }
}

/**
 * Logs invalid deployment env warning once
 */
function logInvalidDeploymentWarning(deploymentEnv: string): void {
  if (!loggedInvalidDeploymentWarning) {
    logger.warn(
      `[Environment] Invalid DEPLOYMENT_ENV value: '${deploymentEnv}', falling back to URL detection`,
    );
    loggedInvalidDeploymentWarning = true;
  }
}

/**
 * Executes a logging function once per unique key
 */
function logOnce(key: string, logFn: () => void): void {
  if (!loggedDetectionMessages.has(key)) {
    logFn();
    loggedDetectionMessages.add(key);
  }
}

/**
 * Normalizes environment name variations to standard environment values.
 * Maps shorthand names (prod, dev, testing) to full names (production, development, test).
 */
function normalizeEnvironmentName(input: string): string {
  const normalized = normalizeString(input);

  if (normalized === "prod") return "production";
  if (normalized === "dev") return "development";
  if (normalized === "testing") return "test";

  return normalized;
}

/**
 * Environment detection strategy that checks for explicit DEPLOYMENT_ENV variable.
 * Returns null in test environments to allow test-controlled behavior.
 */
function detectFromDeploymentEnv(): Environment | null {
  if (isTestRuntime()) return null;

  const deploymentEnv = process.env.DEPLOYMENT_ENV;
  if (!deploymentEnv) return null;

  const normalized = normalizeEnvironmentName(deploymentEnv);
  if (!isValidEnvironment(normalized)) {
    logInvalidDeploymentWarning(deploymentEnv);
    return null;
  }

  logDetectionOnce("explicit_deployment_env", normalized as Environment);
  return normalized as Environment;
}

/**
 * Environment detection strategy that checks API_BASE_URL or NEXT_PUBLIC_SITE_URL
 * for localhost/127.0.0.1 patterns.
 */
function detectFromLocalhostUrl(): Environment | null {
  const apiUrl = getApiUrl();
  if (!apiUrl) return null;

  if (apiUrl.includes("localhost") || apiUrl.includes("127.0.0.1")) {
    logDetectionOnce("localhost", "development");
    return "development";
  }
  return null;
}

/**
 * Environment detection strategy that checks for development subdomains
 * (alpha, dev, sandbox) in the URL.
 */
function detectFromDevSubdomain(): Environment | null {
  const apiUrl = getApiUrl();
  if (!apiUrl) return null;

  const devSubdomains = ["alpha.", "dev.", "sandbox."];
  const matched = devSubdomains.find((sub) => apiUrl.includes(`${sub}williamcallahan.com`));

  if (matched) {
    logDetectionOnce(`${matched}domain`, "development");
    return "development";
  }
  return null;
}

/**
 * Environment detection strategy that checks for production domain
 * (williamcallahan.com without dev subdomains) in the URL.
 */
function detectFromProductionUrl(): Environment | null {
  const apiUrl = getApiUrl();
  if (!apiUrl) return null;

  if (apiUrl.includes("williamcallahan.com")) {
    logDetectionOnce("prod-domain", "production");
    return "production";
  }
  return null;
}

/**
 * Environment detection strategy that falls back to NODE_ENV variable.
 */
function detectFromNodeEnv(): Environment | null {
  const env = process.env.NODE_ENV;
  if (!env) {
    logOnce("no_node_env", () =>
      logger.warn("[Environment] No URL or NODE_ENV set, defaulting to 'development'"),
    );
    return "development";
  }

  const normalized = normalizeEnvironmentName(env);
  if (isValidEnvironment(normalized)) {
    return normalized as Environment;
  }

  logOnce("unknown_node_env", () =>
    logger.warn(`[Environment] Unknown NODE_ENV value: '${env}', defaulting to 'development'`),
  );
  return "development";
}

/** Ordered list of environment detection strategies */
const DETECTION_STRATEGIES: Array<() => Environment | null> = [
  detectFromDeploymentEnv,
  detectFromLocalhostUrl,
  detectFromDevSubdomain,
  detectFromProductionUrl,
  detectFromNodeEnv,
];

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
  for (const strategy of DETECTION_STRATEGIES) {
    const result = strategy();
    if (result) return result;
  }
  return "development";
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
      logger.error(
        `[Environment] Expected '${expectedEnding}' in filename OR '${expectedDir}' in directory`,
      );
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
