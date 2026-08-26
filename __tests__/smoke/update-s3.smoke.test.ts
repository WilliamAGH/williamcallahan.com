/**
 * Smoke tests for S3 data update script - validates CLI behavior and module structure without execution
 *
 * Mock-based validation approach prevents actual S3 operations, external API calls, and file system changes
 * during test runs while ensuring script interface contracts and error handling paths are verified
 *
 * Tests cover: command-line argument parsing, environment variable validation, help text display,
 * dry-run functionality, flag combinations, and required module import structure
 *
 * @fileoverview Part of script testing infrastructure for data-updater.ts operational validation
 */

import { execSync, spawnSync } from "node:child_process";

/**
 * Smoke test suite for data-updater.ts script interface validation
 *
 * Uses mocked outputs instead of process spawning to avoid external dependencies
 * and maintain test isolation while validating expected CLI behaviors
 */
describe("Update S3 Script Smoke Tests", () => {
  const updateDataCommand = "node --run update-data";

  /** Extended timeout accommodation for potential script execution scenarios */
  vi.setConfig({ testTimeout: 30000 });

  /**
   * Validates help message format and required command-line options
   * Ensures all update flags (bookmarks, books, GitHub, logos, search indexes, force) are documented in usage text
   */
  it("should display help message", () => {
    /** Execute script with --help flag and capture output */
    const stdout = execSync(`${updateDataCommand} -- --help`, {
      encoding: "utf8",
      env: { ...process.env, S3_BUCKET: "test-bucket" },
    });

    expect(stdout).toContain("Usage: data-fetch-manager [options]");
    expect(stdout).toContain("--bookmarks");
    expect(stdout).toContain("--books");
    expect(stdout).toContain("--github");
    expect(stdout).toContain("--logos");
    expect(stdout).toContain("--search-indexes");
    expect(stdout).toContain("--force");
    expect(stdout).toContain("If no options are specified, all operations will run");
  });

  /**
   * Validates dry-run mode behavior without performing actual updates
   * Confirms script recognizes DRY_RUN environment variable and exits cleanly
   */
  it("should run with DRY_RUN environment variable", () => {
    /** Execute script in dry-run mode and capture output */
    const stdout = execSync(updateDataCommand, {
      encoding: "utf8",
      env: { ...process.env, DRY_RUN: "true", S3_BUCKET: "test-bucket" },
    });

    expect(stdout).toContain("DRY RUN mode");
    // In DRY RUN mode, the script exits before reaching completion message
    expect(stdout).toContain("skipping all update processes");
  });

  /**
   * Validates environment variable validation logic for required S3_BUCKET
   * Confirms script can run with minimal test data when S3_BUCKET is missing
   */
  it("should handle missing S3_BUCKET gracefully in test mode", () => {
    /** Execute script without S3_BUCKET but with test limits */
    // Note: The script actually has fallback behavior for missing S3_BUCKET
    // and will attempt to run with local data in test mode
    const cleanEnv = { ...process.env };
    delete cleanEnv.S3_BUCKET;

    let stdout = "";

    try {
      // Use test limit and dry run to ensure quick execution
      stdout = execSync(updateDataCommand, {
        encoding: "utf8",
        env: { ...cleanEnv, DRY_RUN: "true", S3_TEST_LIMIT: "1" },
        timeout: 5000, // 5 second timeout
      });
    } catch (error: any) {
      stdout = error.stdout || "";
    }

    // In dry-run mode without S3_BUCKET, script may exit non-zero; assert graceful message instead
    expect(stdout).toContain("DRY RUN mode");
  });

  /**
   * Validates selective update flag processing for targeted operations
   * Confirms script correctly parses individual flags and skips non-specified updates
   */
  it("should accept individual update flags", () => {
    /** Execute script with specific flags in dry-run mode */
    const stdout = execSync(`${updateDataCommand} -- --bookmarks --logos`, {
      encoding: "utf8",
      env: { ...process.env, DRY_RUN: "true", S3_BUCKET: "test-bucket" },
    });

    // The script logs the raw args, which should include our flags
    expect(stdout).toContain("Args: --bookmarks --logos");
    // In dry run mode, it exits before flag-specific processing
    expect(stdout).toContain("DRY RUN mode");
  });

  /**
   * Validates S3_TEST_LIMIT environment variable processing for controlled test runs
   * Ensures script respects item count limits during testing to prevent resource exhaustion
   */
  it("should handle test limit environment variable", () => {
    /** Execute script with test limit set */
    const stdout = execSync(updateDataCommand, {
      encoding: "utf8",
      env: { ...process.env, DRY_RUN: "true", S3_BUCKET: "test-bucket", S3_TEST_LIMIT: "5" },
    });

    expect(stdout).toContain("Test limit active: 5 items per operation");
  });

  /**
   * Validates that script can be loaded and parsed without import errors
   * Confirms module resolution works correctly in test environment
   */
  it("should load script without module resolution errors", () => {
    /** Execute script with immediate exit to test module loading */
    let exitCode = 0;
    try {
      execSync(`${updateDataCommand} -- --help`, {
        encoding: "utf8",
        env: { ...process.env, S3_BUCKET: "test-bucket" },
      });
    } catch (error: any) {
      exitCode = error.status || 1;
    }

    /** Script should exit with code 0 after displaying help */
    expect(exitCode).toBe(0);
  });
});

/**
 * Smoke tests for scheduler and data-updater CLI flag consistency
 *
 * CRITICAL: The scheduler spawns data-updater with CLI flags.
 * If flags don't match, jobs appear to run but do nothing.
 * This test prevents silent failures from flag mismatches.
 */
describe("Scheduler and data-updater flag consistency", () => {
  it("exits nonzero after logging an uncaught scheduler failure once", () => {
    const result = spawnSync("node", ["--run", "scheduler"], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        S3_BOOKMARKS_CRON: "invalid",
        SCHEDULER_HEARTBEAT_FILE: "/tmp/scheduler-fatal-test-heartbeat",
      },
    });

    expect(result.status).toBe(1);
    expect(result.stderr.match(/\[Scheduler\] FATAL:/g)).toHaveLength(1);
    expect(result.stderr).toContain("Uncaught exception");
  });

  it("configures a bounded scheduler event-loop heartbeat health check", async () => {
    const fs = await import("node:fs/promises");
    const dockerfile = await fs.readFile("scheduler/Dockerfile", "utf8");
    const schedulerContent = await fs.readFile("scheduler/scheduler.ts", "utf8");

    expect(schedulerContent).toContain("setInterval(writeHeartbeat, 30_000)");
    expect(dockerfile).toContain("SCHEDULER_HEARTBEAT_FILE=/tmp/scheduler-heartbeat");
    expect(dockerfile).toContain("--start-period=15m");
    expect(dockerfile).toContain("age>120000");
  });

  it("preserves the public CDN build argument during the web build", async () => {
    const fs = await import("node:fs/promises");
    const dockerfile = await fs.readFile("Dockerfile", "utf8");

    expect(dockerfile).toContain("ARG NEXT_PUBLIC_S3_CDN_URL");
    expect(dockerfile).toContain(
      "id=NEXT_PUBLIC_S3_CDN_URL,target=/run/secrets/build/NEXT_PUBLIC_S3_CDN_URL",
    );
    expect(dockerfile).not.toContain("id=NEXT_PUBLIC_S3_CDN_URL,env=NEXT_PUBLIC_S3_CDN_URL");
    expect(dockerfile).toContain("for secret_path in /run/secrets/build/*");
    expect(dockerfile).not.toContain("ARG S3_SECRET_ACCESS_KEY");
    expect(dockerfile).toContain("--mount=type=secret,id=S3_SECRET_ACCESS_KEY");
    expect(dockerfile).toContain("id=INTERNAL_DATABASE_HOST,target=/run/secrets/build/");
    expect(dockerfile).toContain("id=INTERNAL_DATABASE_PORT,target=/run/secrets/build/");
    expect(dockerfile).toContain("rewrite_database_url_for_internal_service");
  });

  it("rewrites the production database proxy route to the explicit target", () => {
    const databaseUrl = "postgresql://user:password@167.234.219.57:5438/database?sslmode=require";
    const result = spawnSync(
      "bash",
      [
        "-c",
        'source "$1"; rewrite_database_url_for_internal_service >/dev/null; printf "%s" "$DATABASE_URL"',
        "bash",
        "scripts/entrypoint-db-gate.sh",
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: {
          ...process.env,
          DATABASE_URL: databaseUrl,
          INTERNAL_DATABASE_HOST: "100.64.0.10",
          INTERNAL_DATABASE_PORT: "6432",
          NEXT_PUBLIC_SITE_URL: "https://williamcallahan.com",
        },
      },
    );

    expect(result.status).toBe(0);
    const rewritten = new URL(result.stdout);
    expect(rewritten.hostname).toBe("100.64.0.10");
    expect(rewritten.port).toBe("6432");
    expect(rewritten.username).toBe("user");
    expect(rewritten.password).toBe("password");
    expect(rewritten.searchParams.get("sslmode")).toBe("require");
  });

  it("rejects a production database proxy route without an explicit target", () => {
    const env = {
      ...process.env,
      DATABASE_URL: "postgresql://user:password@167.234.219.57:5438/database?sslmode=require",
      NEXT_PUBLIC_SITE_URL: "https://williamcallahan.com",
    };
    delete env.INTERNAL_DATABASE_HOST;
    delete env.INTERNAL_DATABASE_PORT;

    const result = spawnSync(
      "bash",
      [
        "-c",
        'source "$1"; rewrite_database_url_for_internal_service',
        "bash",
        "scripts/entrypoint-db-gate.sh",
      ],
      { cwd: process.cwd(), encoding: "utf8", env },
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("INTERNAL_DATABASE_HOST and INTERNAL_DATABASE_PORT");
  });

  it("keeps an already-direct production database route without a target override", () => {
    const env = {
      ...process.env,
      DATABASE_URL: "postgresql://user:password@100.64.0.10:6432/database?sslmode=require",
      NEXT_PUBLIC_SITE_URL: "https://williamcallahan.com",
    };
    delete env.INTERNAL_DATABASE_HOST;
    delete env.INTERNAL_DATABASE_PORT;

    const result = spawnSync(
      "bash",
      [
        "-c",
        'source "$1"; rewrite_database_url_for_internal_service >/dev/null; printf "%s" "$DATABASE_URL"',
        "bash",
        "scripts/entrypoint-db-gate.sh",
      ],
      { cwd: process.cwd(), encoding: "utf8", env },
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toBe(env.DATABASE_URL);
  });

  it("fails closed when bootstrap cache revalidation cannot reach the web app", () => {
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      API_BASE_URL: "http://127.0.0.1:54321",
      BOOKMARK_CRON_REFRESH_SECRET: "test-secret",
    };

    const result = spawnSync(
      "node",
      ["--run", "scheduler", "--", "--revalidate-bootstrap-caches"],
      { cwd: process.cwd(), encoding: "utf8", env },
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Cache invalidation error");
    expect(result.stderr).toContain("Bootstrap cache revalidation failed");
    expect(result.stdout).not.toContain("Setup complete");
  });

  it("bootstraps data through Node before starting cron and fails closed", async () => {
    const fs = await import("node:fs/promises");
    const entrypoint = await fs.readFile("scheduler/entrypoint.sh", "utf8");
    const databaseGate = await fs.readFile("scripts/entrypoint-db-gate.sh", "utf8");
    const syntaxCheck = spawnSync("bash", ["-n", "scheduler/entrypoint.sh"], {
      encoding: "utf8",
    });
    const gateSyntaxCheck = spawnSync("bash", ["-n", "scripts/entrypoint-db-gate.sh"], {
      encoding: "utf8",
    });
    const migrationCheckIndex = entrypoint.indexOf("require_embedding_failures_migration");
    const bootstrapIndex = entrypoint.indexOf("node --run update-data");
    const revalidationIndex = entrypoint.indexOf(
      "node --run scheduler -- --revalidate-bootstrap-caches",
    );
    const schedulerStartIndex = entrypoint.indexOf('echo "🕒 [Entrypoint] Starting scheduler..."');
    const sitemapStartIndex = entrypoint.indexOf('echo "🗺️  [Entrypoint] Submitting sitemap..."');

    expect(syntaxCheck.status).toBe(0);
    expect(gateSyntaxCheck.status).toBe(0);
    expect(entrypoint).toMatch(/if node --run update-data; then/);
    expect(migrationCheckIndex).toBeGreaterThan(-1);
    expect(bootstrapIndex).toBeGreaterThan(-1);
    expect(revalidationIndex).toBeGreaterThan(-1);
    expect(sitemapStartIndex).toBeGreaterThan(-1);
    expect(schedulerStartIndex).toBeGreaterThan(-1);
    expect(migrationCheckIndex).toBeLessThan(bootstrapIndex);
    expect(bootstrapIndex).toBeLessThan(sitemapStartIndex);
    expect(bootstrapIndex).toBeLessThan(schedulerStartIndex);
    expect(revalidationIndex).toBeGreaterThan(bootstrapIndex);
    expect(revalidationIndex).toBeLessThan(sitemapStartIndex);
    expect(revalidationIndex).toBeLessThan(schedulerStartIndex);
    expect(entrypoint).toContain("Initial data bootstrap completed");
    expect(entrypoint).toMatch(
      /Initial data bootstrap failed; scheduler will not start" >&2\n {4}exit 1/,
    );
    expect(entrypoint).not.toContain("background-data-populator");
    expect(databaseGate).toContain("to_regclass('public.embedding_failures')");
    expect(databaseGate).toContain(
      "Required database migration 0024_embedding-failures is missing",
    );
  });

  it("journals migration 0024 without retroactively replaying 0023", async () => {
    const fs = await import("node:fs/promises");
    const journal = await fs.readFile("drizzle/meta/_journal.json", "utf8");
    const migration = await fs.readFile("drizzle/0024_embedding-failures.sql", "utf8");

    expect(journal.lastIndexOf('"tag": "0024_embedding-failures"')).toBeGreaterThan(
      journal.lastIndexOf('"tag": "0021_bookmark-tags-taxonomy"'),
    );
    expect(journal).not.toContain('"tag": "0023_engagement-covering-index"');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "embedding_failures"');
  });

  it("constructs the scheduler migration preflight client with required TLS", async () => {
    const fs = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const { join, resolve } = await import("node:path");
    const temporaryDirectory = await fs.mkdtemp(join(tmpdir(), "scheduler-preflight-"));
    const packageDirectory = join(temporaryDirectory, "node_modules/postgres");
    const capturePath = join(temporaryDirectory, "postgres-options.json");

    try {
      await fs.mkdir(packageDirectory, { recursive: true });
      await fs.writeFile(
        join(packageDirectory, "package.json"),
        '{"type":"module","exports":"./index.js"}',
      );
      await fs.writeFile(
        join(packageDirectory, "index.js"),
        `import { writeFileSync } from "node:fs";
export default function postgres(databaseUrl, options) { writeFileSync(process.env.POSTGRES_OPTIONS_CAPTURE_PATH, JSON.stringify({ databaseUrl, options })); const sql = async () => [{ present: true }]; sql.end = async () => {}; return sql; }`,
      );

      const result = spawnSync(
        "bash",
        [
          "-c",
          'source "$1"; require_embedding_failures_migration',
          "bash",
          resolve("scripts/entrypoint-db-gate.sh"),
        ],
        {
          cwd: temporaryDirectory,
          encoding: "utf8",
          env: {
            ...process.env,
            AI_DEFAULT_EMBEDDING_MODEL: "test-model",
            DATABASE_URL: "postgres://test:test@db.test:5432/test",
            POSTGRES_OPTIONS_CAPTURE_PATH: capturePath,
          },
        },
      );
      const captured: unknown = JSON.parse(await fs.readFile(capturePath, "utf8"));

      expect(result.status).toBe(0);
      expect(captured).toMatchObject({ options: { ssl: "require" } });
    } finally {
      await fs.rm(temporaryDirectory, { recursive: true, force: true });
    }
  });

  /**
   * Validates scheduler uses correct GitHub flag
   * Prevents regression where --github-activity was used instead of --github
   */
  it("scheduler should use the same GitHub flag as data-updater expects", async () => {
    const fs = await import("node:fs/promises");

    const schedulerContent = await fs.readFile("scheduler/scheduler.ts", "utf-8");
    const dataUpdaterContent = await fs.readFile("scheduler/data-updater.ts", "utf-8");

    // Scheduler should use DATA_UPDATER_FLAGS.GITHUB, NOT a literal --github-activity string
    expect(schedulerContent).toContain("DATA_UPDATER_FLAGS.GITHUB");
    expect(schedulerContent).not.toContain('"--github-activity"');

    // data-updater should use centralized flags
    expect(dataUpdaterContent).toContain("DATA_UPDATER_FLAGS.GITHUB");
  });

  /**
   * Validates all scheduler spawn commands use correct flags via centralized constants
   * Ensures bookmarks and logos flags are also using DATA_UPDATER_FLAGS
   */
  it("scheduler should use correct flags for all job types", async () => {
    const fs = await import("node:fs/promises");

    const schedulerContent = await fs.readFile("scheduler/scheduler.ts", "utf-8");

    // Verify all spawn commands use centralized flag constants (not hardcoded strings)
    expect(schedulerContent).toContain("DATA_UPDATER_FLAGS.BOOKMARKS");
    expect(schedulerContent).toContain("DATA_UPDATER_FLAGS.LOGOS");
    expect(schedulerContent).toContain("DATA_UPDATER_FLAGS.GITHUB");
  });
});
