/**
 * GitHub CSV repair workflow
 * @module data-access/github-csv-repair
 */

import { readBinaryS3, writeBinaryS3 } from "@/lib/s3/binary";
import { readJsonS3, writeJsonS3 } from "@/lib/s3/json";
import { waitForPermit } from "@/lib/rate-limiter";
import { createHash } from "node:crypto";
import { createCategorizedError } from "@/lib/utils/error-utils";
import { retryWithDomainConfig } from "@/lib/utils/retry";
import { generateGitHubStatsCSV } from "@/lib/utils/csv";
import { repairCsvData, filterContributorStats } from "@/lib/data-access/github-processing";
import { checksumRecordSchema } from "@/types/schemas/checksum";
import { ContributorStatsResponseSchema, type GithubRepoNode } from "@/types/github";
import { GITHUB_API_RATE_LIMIT_CONFIG, REPO_RAW_WEEKLY_STATS_S3_KEY_DIR } from "@/lib/constants";
import {
  fetchContributedRepositories,
  getGitHubApiToken,
  getGitHubUsername,
  githubHttpClient,
  isGitHubApiConfigured,
} from "./github-api";

const GITHUB_REPO_OWNER = getGitHubUsername();

/**
 * Scans repository CSV statistic files in S3 for missing, empty, or malformed data
 * and attempts to repair them by refetching contributor stats from the GitHub API.
 */
export async function detectAndRepairCsvFiles(): Promise<{
  scannedRepos: number;
  repairedRepos: number;
  failedRepairs: number;
}> {
  console.log("[DataAccess/GitHub] Running CSV integrity check and repair...");

  if (!isGitHubApiConfigured()) {
    console.warn("[DataAccess/GitHub] GitHub API token is missing. Cannot perform CSV repair.");
    return { scannedRepos: 0, repairedRepos: 0, failedRepairs: 0 };
  }

  let repoList: GithubRepoNode[] = [];
  try {
    console.log("[DataAccess/GitHub] Fetching repository list for CSV integrity check...");

    const { repositories } = await fetchContributedRepositories(GITHUB_REPO_OWNER);
    repoList = repositories;
  } catch (error: unknown) {
    const categorizedError = createCategorizedError(error, "github");
    console.error(
      "[DataAccess/GitHub] Failed to fetch repository list for CSV repair:",
      categorizedError.message,
    );
    return { scannedRepos: 0, repairedRepos: 0, failedRepairs: 0 };
  }

  console.log(
    `[DataAccess/GitHub] Found ${repoList.length} repositories to check for CSV integrity`,
  );
  let repairedCount = 0;
  let failedCount = 0;

  for (const repo of repoList) {
    const repoOwner = repo.owner.login;
    const repoName = repo.name;
    const repoStatS3Key = `${REPO_RAW_WEEKLY_STATS_S3_KEY_DIR}/${repoOwner}_${repoName}.csv`;

    try {
      // Try to repair the CSV file - check if it exists and needs repair
      const csvContent = await readBinaryS3(repoStatS3Key);
      let repairSuccessful = false;

      if (csvContent) {
        const csvString = csvContent.toString("utf-8");

        // ------- incremental skip logic (best-effort optimization) --------
        // INTENTIONAL DEGRADATION: Checksum lookup is a performance optimization only.
        // If it fails (missing file, S3 transient error), we fall back to full repair check.
        // This is safe because: (1) repair logic is idempotent, (2) checksum is not authoritative.
        const checksumKey = `${REPO_RAW_WEEKLY_STATS_S3_KEY_DIR}/${repoOwner}_${repoName}_raw_checksum.json`;
        const checksumResult = await readJsonS3(checksumKey, checksumRecordSchema).catch(
          (checksumReadError: unknown) => {
            console.info(
              `[DataAccess/GitHub] [EXPECTED] Checksum not available for ${repoOwner}/${repoName}, will perform full repair check:`,
              checksumReadError instanceof Error
                ? checksumReadError.message
                : String(checksumReadError),
            );
            return null;
          },
        );
        if (checksumResult?.checksum) {
          const currentChecksum = createHash("sha256").update(csvString).digest("hex");
          if (currentChecksum === checksumResult.checksum) {
            console.log(
              `[DataAccess/GitHub] CSV unchanged for ${repoOwner}/${repoName} (checksum ${currentChecksum}), skipping repair`,
            );
            repairedCount++; // treat as success
            continue; // next repo
          }
        }

        const repairedCsv = repairCsvData(csvString);

        if (repairedCsv === csvString) {
          repairSuccessful = true;
        } else {
          await writeBinaryS3(repoStatS3Key, Buffer.from(repairedCsv), "text/csv");
          repairSuccessful = true;
        }

        // After potential repair, store new checksum pointer (best-effort)
        try {
          const csvForChecksum = typeof repairedCsv === "string" ? repairedCsv : csvString;
          const newChecksum = createHash("sha256").update(csvForChecksum).digest("hex");
          const checksumKey = `${REPO_RAW_WEEKLY_STATS_S3_KEY_DIR}/${repoOwner}_${repoName}_raw_checksum.json`;
          await writeJsonS3(checksumKey, { checksum: newChecksum });
        } catch (checksumWriteError: unknown) {
          console.warn(
            `[DataAccess/GitHub] Failed to write checksum for ${repoOwner}/${repoName}:`,
            checksumWriteError instanceof Error ? checksumWriteError.message : checksumWriteError,
          );
        }
      }

      if (repairSuccessful) {
        repairedCount++;
      } else {
        console.log(
          `[DataAccess/GitHub] CSV repair: Attempting to repair data for ${repoOwner}/${repoName}`,
        );

        // Use retry logic for CSV repair API calls
        const statsResponse = await retryWithDomainConfig(async () => {
          await waitForPermit("github-rest", "github-api-call", GITHUB_API_RATE_LIMIT_CONFIG);

          return await githubHttpClient(
            `https://api.github.com/repos/${repoOwner}/${repoName}/stats/contributors`,
            {
              headers: {
                Authorization: `Bearer ${getGitHubApiToken()}`,
                Accept: "application/vnd.github.v3+json",
              },
              timeout: 30000,
              handle202Retry: true,
            },
          );
        }, "GITHUB_API");

        if (statsResponse?.ok) {
          const contributorsData: unknown = await statsResponse.json();
          const contributorsResult = ContributorStatsResponseSchema.safeParse(contributorsData);
          if (!contributorsResult.success) {
            console.warn(
              `[DataAccess/GitHub] Invalid contributor stats for ${repoOwner}/${repoName}:`,
              contributorsResult.error.flatten(),
            );
            failedCount++;
          } else {
            const contributors = contributorsResult.data;
            const ownerStats = filterContributorStats(contributors, GITHUB_REPO_OWNER);

            if (ownerStats?.weeks && Array.isArray(ownerStats.weeks)) {
              const weeklyStats = ownerStats.weeks
                .map((w) => ({
                  w: w.w,
                  a: w.a,
                  d: w.d,
                  c: w.c,
                }))
                .toSorted((a, b) => a.w - b.w);
              if (weeklyStats.length > 0) {
                await writeBinaryS3(
                  repoStatS3Key,
                  Buffer.from(generateGitHubStatsCSV(weeklyStats)),
                  "text/csv",
                );
                console.log(
                  `[DataAccess/GitHub] CSV repair: Successfully repaired ${repoOwner}/${repoName} with ${weeklyStats.length} weeks of data`,
                );
                repairedCount++;
              } else {
                console.warn(
                  `[DataAccess/GitHub] CSV repair: No weekly stats found for ${repoOwner}/${repoName} from API to repair.`,
                );
                failedCount++;
              }
            } else {
              console.warn(
                `[DataAccess/GitHub] CSV repair: No user-specific stats found for ${repoOwner}/${repoName} from API.`,
              );
              failedCount++;
            }
          }
        } else if (statsResponse?.status === 202) {
          // Pending generation – skip, will repair later
          console.info(
            `[DataAccess/GitHub] CSV repair: Stats still generating for ${repoOwner}/${repoName} – will retry on next run`,
          );
          failedCount++;
        } else if (statsResponse?.status === 403) {
          console.info(
            `[DataAccess/GitHub] CSV repair: Rate limited for ${repoOwner}/${repoName} – will retry on next run`,
          );
          failedCount++;
        } else {
          console.warn(
            `[DataAccess/GitHub] CSV repair: Failed to fetch stats for ${repoOwner}/${repoName}. HTTP ${statsResponse?.status}`,
          );
          failedCount++;
        }
      }
    } catch (error: unknown) {
      const categorizedError = createCategorizedError(error, "github");
      console.error(
        `[DataAccess/GitHub] CSV repair: Error processing ${repoOwner}/${repoName}:`,
        categorizedError.message,
      );
      failedCount++;
    }
  }
  console.log(
    `[DataAccess/GitHub] CSV repair completed: Scanned ${repoList.length} repos, repaired ${repairedCount}, failed ${failedCount}`,
  );
  return {
    scannedRepos: repoList.length,
    repairedRepos: repairedCount,
    failedRepairs: failedCount,
  };
}
