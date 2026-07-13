// __tests__/smoke/update-data.smoke.test.ts
// Vitest provides describe, it, expect, beforeEach, afterEach, beforeAll, afterAll globally
import { execSync } from "node:child_process";
import type { GraphQLRepoNode } from "@/types/github";

const UPDATE_DATA_COMMAND = "node --run update-data";
// S3 Bucket name from environment for log verification
const S3_BUCKET = process.env.S3_BUCKET;
const IS_S3_CONFIGURED = Boolean(
  S3_BUCKET && process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY,
);

const buildRepoNode = (owner: string, name: string): GraphQLRepoNode => ({
  id: `${owner}/${name}`,
  name,
  owner: { login: owner },
  nameWithOwner: `${owner}/${name}`,
  isFork: false,
  isPrivate: false,
});

describe("scheduler/data-updater.ts Smoke Test", () => {
  // Support three test modes:
  // - FULL: Run all operations without limits (slow, ~130+ seconds)
  // - DRY: Mock all operations (fast, no real calls)
  // - NORMAL: Test 1 real operation of each type (GitHub hangs due to lack of test limiting)
  const testMode = process.env.S3_TEST_MODE || "DRY";

  const displayMode = !IS_S3_CONFIGURED && testMode !== "DRY" ? "DRY RUN (no S3 config)" : testMode;

  it(
    `should execute successfully in ${displayMode} mode`,
    () => {
      console.log(`[Smoke Test] Executing script in ${displayMode} mode: ${UPDATE_DATA_COMMAND}`);
      console.log(`[Smoke Test] S3_TEST_MODE: ${testMode}`);

      let stdout = "";
      let stderr = "";
      let exitCode = 0;

      // Prepare environment
      const envVars: NodeJS.ProcessEnv = {
        ...process.env,
        VERBOSE: "true",
        S3_TEST_MODE: testMode,
      };

      // Configure based on test mode
      if (testMode === "DRY" || !IS_S3_CONFIGURED) {
        envVars.DRY_RUN = "true";
        envVars.S3_BUCKET = envVars.S3_BUCKET || "test-bucket";
      } else if (testMode === "NORMAL") {
        // Tell the script to run in limited test mode
        envVars.S3_TEST_LIMIT = "1";
      }
      // FULL mode runs without restrictions

      try {
        stdout = execSync(UPDATE_DATA_COMMAND, {
          env: envVars,
          encoding: "utf8",
          stdio: ["inherit", "pipe", "pipe"],
        }).toString();
      } catch (error: any) {
        exitCode = error.status || 1;
        stdout = error.stdout || "";
        stderr = error.stderr || "";
      }

      console.log("[Smoke Test] Script stdout:\n", stdout);
      if (stderr) {
        console.error("[Smoke Test] Script stderr:\n", stderr);
      }

      expect(exitCode).toBe(0);

      // Basic expectations for all modes
      expect(stdout).toContain("[DataFetchManager] CLI execution started. Args:");

      // Mode-specific expectations
      if (testMode === "DRY" || !IS_S3_CONFIGURED) {
        const dryRunPattern = /DRY RUN mode - skipping all update processes/;
        expect(dryRunPattern.test(stdout)).toBe(true);
        // In DRY mode, script exits before completion message
      } else {
        expect(stdout).toContain("[DataFetchManager] All operations complete.");
        if (testMode === "NORMAL") {
          // Should see limited processing messages
          expect(stdout).toMatch(/Test mode: limiting .* to 1/);
        }
      }
      // FULL mode has no special expectations beyond successful completion
    },
    testMode === "FULL" ? 180000 : 30000,
  ); // Longer timeout for FULL mode
});

describe("GitHub stats updater log severity", () => {
  it("reports pending repository stats as info while marking data incomplete", async () => {
    vi.resetModules();
    class PendingStats extends Error {}
    class RateLimitedStats extends Error {}
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    vi.doMock("@/lib/data-access/github-api", () => ({
      fetchContributorStats: vi.fn().mockRejectedValue(new PendingStats()),
      GitHubContributorStatsPendingError: PendingStats,
      GitHubContributorStatsRateLimitError: RateLimitedStats,
    }));
    vi.doMock("@/lib/data-access/github-storage", () => ({
      readRepoWeeklyStatsRecord: vi.fn().mockResolvedValue(null),
      writeRepoWeeklyStatsRecord: vi.fn(),
    }));

    try {
      const { processSingleRepository } = await import("@/lib/data-access/github-repo-processor");
      const result = await processSingleRepository({
        repo: buildRepoNode("owner", "repo"),
        githubRepoOwner: "owner",
        trailingYearFromDate: new Date("2025-06-10T00:00:00.000Z"),
        now: new Date("2026-06-10T00:00:00.000Z"),
      });

      expect(result.dataComplete).toBe(false);
      expect(result.hasAllTimeData).toBe(false);
      expect(infoSpy).toHaveBeenCalledWith("[GitHub-Repo] Stats generating for owner/repo");
      expect(warnSpy).not.toHaveBeenCalledWith(
        expect.stringContaining("[GitHub-Repo] Stats generating"),
      );
    } finally {
      infoSpy.mockRestore();
      warnSpy.mockRestore();
      vi.doUnmock("@/lib/data-access/github-api");
      vi.doUnmock("@/lib/data-access/github-storage");
    }
  });

  it("uses canonical contributor stats handling during CSV repair", async () => {
    vi.resetModules();
    class PendingStats extends Error {}
    class RateLimitedStats extends Error {}
    const fetchContributorStats = vi.fn().mockRejectedValue(new PendingStats());
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    vi.doMock("@/lib/data-access/github-api", () => ({
      fetchContributedRepositories: vi.fn().mockResolvedValue({
        userId: "user-id",
        repositories: [buildRepoNode("owner", "repo")],
      }),
      fetchContributorStats,
      GitHubContributorStatsPendingError: PendingStats,
      GitHubContributorStatsRateLimitError: RateLimitedStats,
      getGitHubUsername: () => "owner",
      isGitHubApiConfigured: () => true,
    }));
    vi.doMock("@/lib/data-access/github-storage", () => ({
      readRepoWeeklyStatsRecord: vi.fn().mockResolvedValue(null),
      writeRepoWeeklyStatsRecord: vi.fn(),
    }));
    vi.doMock("@/lib/db/queries/github-activity", () => ({
      readRepoCsvChecksum: vi.fn(),
    }));
    vi.doMock("@/lib/db/mutations/github-activity", () => ({
      writeRepoCsvChecksumToDb: vi.fn(),
    }));

    try {
      const { detectAndRepairCsvFiles } = await import("@/lib/data-access/github-csv-repair");
      const result = await detectAndRepairCsvFiles();

      expect(result.scannedRepos).toBe(1);
      expect(result.failedRepairs).toBe(1);
      expect(fetchContributorStats).toHaveBeenCalledWith("owner", "repo");
      expect(infoSpy).toHaveBeenCalledWith("[GitHub-CSV] Stats generating for owner/repo");
      expect(warnSpy).not.toHaveBeenCalledWith(
        expect.stringContaining("[GitHub-CSV] Invalid stats"),
      );
    } finally {
      infoSpy.mockRestore();
      warnSpy.mockRestore();
      vi.doUnmock("@/lib/data-access/github-api");
      vi.doUnmock("@/lib/data-access/github-storage");
      vi.doUnmock("@/lib/db/queries/github-activity");
      vi.doUnmock("@/lib/db/mutations/github-activity");
    }
  });
});
