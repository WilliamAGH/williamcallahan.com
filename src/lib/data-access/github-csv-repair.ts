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
import type { ChecksumCircuitState, CsvRepairResult } from "@/types/features/github-processing";
import {
  fetchContributedRepositories,
  getGitHubApiToken,
  getGitHubUsername,
  githubHttpClient,
  isGitHubApiConfigured,
} from "./github-api";

const GITHUB_REPO_OWNER = getGitHubUsername();
const CHECKSUM_FAILURE_THRESHOLD = 3;

function createChecksumCircuit(): ChecksumCircuitState {
  return { consecutiveFailures: 0, isOpen: false, lastError: null };
}

function recordChecksumFailure(circuit: ChecksumCircuitState, error: unknown): void {
  circuit.consecutiveFailures++;
  circuit.lastError = error instanceof Error ? error.message : String(error);
  if (circuit.consecutiveFailures >= CHECKSUM_FAILURE_THRESHOLD) {
    circuit.isOpen = true;
    console.error(
      `[GitHub-CSV] Checksum circuit OPEN after ${circuit.consecutiveFailures} failures. Last error: ${circuit.lastError}`,
    );
  }
}

function recordChecksumSuccess(circuit: ChecksumCircuitState): void {
  circuit.consecutiveFailures = 0;
  // Don't close circuit once open - require manual intervention or process restart
}

async function tryReadChecksum(
  checksumKey: string,
  circuit: ChecksumCircuitState,
): Promise<string | null> {
  if (circuit.isOpen) {
    return null; // Circuit is open, skip checksum operations
  }

  try {
    const result = await readJsonS3(checksumKey, checksumRecordSchema);
    recordChecksumSuccess(circuit);
    return result?.checksum ?? null;
  } catch (error: unknown) {
    recordChecksumFailure(circuit, error);
    throw error; // Propagate to caller
  }
}

async function tryWriteChecksum(
  checksumKey: string,
  checksum: string,
  circuit: ChecksumCircuitState,
): Promise<void> {
  if (circuit.isOpen) {
    return; // Circuit is open, skip checksum operations
  }

  try {
    await writeJsonS3(checksumKey, { checksum });
    recordChecksumSuccess(circuit);
  } catch (error: unknown) {
    recordChecksumFailure(circuit, error);
    throw error; // Propagate to caller
  }
}

async function processRepoChecksum(
  repoOwner: string,
  repoName: string,
  csvString: string,
  checksumKey: string,
  circuit: ChecksumCircuitState,
): Promise<{ skipRepair: boolean; checksumError: boolean }> {
  if (circuit.isOpen) {
    return { skipRepair: false, checksumError: false };
  }

  try {
    const existingChecksum = await tryReadChecksum(checksumKey, circuit);
    if (existingChecksum) {
      const currentChecksum = createHash("sha256").update(csvString).digest("hex");
      if (currentChecksum === existingChecksum) {
        console.log(
          `[GitHub-CSV] CSV unchanged for ${repoOwner}/${repoName} (checksum match), skipping repair`,
        );
        return { skipRepair: true, checksumError: false };
      }
    }
    return { skipRepair: false, checksumError: false };
  } catch {
    // Error already recorded in circuit
    return { skipRepair: false, checksumError: true };
  }
}

async function updateRepoChecksum(
  repoOwner: string,
  repoName: string,
  csvContent: string,
  checksumKey: string,
  circuit: ChecksumCircuitState,
): Promise<boolean> {
  if (circuit.isOpen) {
    return false;
  }

  try {
    const newChecksum = createHash("sha256").update(csvContent).digest("hex");
    await tryWriteChecksum(checksumKey, newChecksum, circuit);
    return true;
  } catch {
    console.warn(`[GitHub-CSV] Checksum write failed for ${repoOwner}/${repoName}`);
    return false;
  }
}

async function repairFromApi(
  repoOwner: string,
  repoName: string,
  repoStatS3Key: string,
): Promise<boolean> {
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

  if (!statsResponse?.ok) {
    if (statsResponse?.status === 202) {
      console.info(`[GitHub-CSV] Stats generating for ${repoOwner}/${repoName}`);
    } else if (statsResponse?.status === 403) {
      console.info(`[GitHub-CSV] Rate limited for ${repoOwner}/${repoName}`);
    } else {
      console.warn(`[GitHub-CSV] API error for ${repoOwner}/${repoName}: ${statsResponse?.status}`);
    }
    return false;
  }

  const data: unknown = await statsResponse.json();
  const parsed = ContributorStatsResponseSchema.safeParse(data);
  if (!parsed.success) {
    console.warn(`[GitHub-CSV] Invalid stats for ${repoOwner}/${repoName}`);
    return false;
  }

  const ownerStats = filterContributorStats(parsed.data, GITHUB_REPO_OWNER);
  if (!ownerStats?.weeks?.length) {
    console.warn(`[GitHub-CSV] No user stats for ${repoOwner}/${repoName}`);
    return false;
  }

  const weeklyStats = ownerStats.weeks
    .map((w) => ({ w: w.w, a: w.a, d: w.d, c: w.c }))
    .toSorted((a, b) => a.w - b.w);

  if (weeklyStats.length === 0) {
    console.warn(`[GitHub-CSV] Empty weekly stats for ${repoOwner}/${repoName}`);
    return false;
  }

  await writeBinaryS3(repoStatS3Key, Buffer.from(generateGitHubStatsCSV(weeklyStats)), "text/csv");
  console.log(`[GitHub-CSV] Repaired ${repoOwner}/${repoName}: ${weeklyStats.length} weeks`);
  return true;
}

export async function detectAndRepairCsvFiles(): Promise<CsvRepairResult> {
  console.log("[GitHub-CSV] Running CSV integrity check and repair...");

  if (!isGitHubApiConfigured()) {
    console.warn("[GitHub-CSV] GitHub API token missing, cannot repair");
    return {
      scannedRepos: 0,
      repairedRepos: 0,
      failedRepairs: 0,
      checksumFailures: 0,
      checksumCircuitOpen: false,
    };
  }

  let repoList: GithubRepoNode[] = [];
  try {
    const { repositories } = await fetchContributedRepositories(GITHUB_REPO_OWNER);
    repoList = repositories;
  } catch (error: unknown) {
    const categorized = createCategorizedError(error, "github");
    console.error("[GitHub-CSV] Failed to fetch repository list:", categorized.message);
    return {
      scannedRepos: 0,
      repairedRepos: 0,
      failedRepairs: 0,
      checksumFailures: 0,
      checksumCircuitOpen: false,
    };
  }

  console.log(`[GitHub-CSV] Checking ${repoList.length} repositories`);

  let repairedCount = 0;
  let failedCount = 0;
  let checksumFailureCount = 0;
  const checksumCircuit = createChecksumCircuit();

  for (const repo of repoList) {
    const repoOwner = repo.owner.login;
    const repoName = repo.name;
    const repoStatS3Key = `${REPO_RAW_WEEKLY_STATS_S3_KEY_DIR}/${repoOwner}_${repoName}.csv`;
    const checksumKey = `${REPO_RAW_WEEKLY_STATS_S3_KEY_DIR}/${repoOwner}_${repoName}_raw_checksum.json`;

    try {
      const csvContent = await readBinaryS3(repoStatS3Key);

      if (csvContent) {
        const csvString = csvContent.toString("utf-8");

        const { skipRepair, checksumError } = await processRepoChecksum(
          repoOwner,
          repoName,
          csvString,
          checksumKey,
          checksumCircuit,
        );

        if (checksumError) {
          checksumFailureCount++;
        }

        if (skipRepair) {
          repairedCount++;
          continue;
        }

        const repairedCsv = repairCsvData(csvString);
        const wasModified = repairedCsv !== csvString;

        if (wasModified) {
          await writeBinaryS3(repoStatS3Key, Buffer.from(repairedCsv), "text/csv");
        }

        const checksumWritten = await updateRepoChecksum(
          repoOwner,
          repoName,
          wasModified ? repairedCsv : csvString,
          checksumKey,
          checksumCircuit,
        );

        if (!checksumWritten && !checksumCircuit.isOpen) {
          checksumFailureCount++;
        }

        repairedCount++;
      } else {
        console.log(`[GitHub-CSV] No existing CSV for ${repoOwner}/${repoName}, fetching from API`);
        const success = await repairFromApi(repoOwner, repoName, repoStatS3Key);
        if (success) {
          repairedCount++;
        } else {
          failedCount++;
        }
      }
    } catch (error: unknown) {
      const categorized = createCategorizedError(error, "github");
      console.error(`[GitHub-CSV] Error processing ${repoOwner}/${repoName}:`, categorized.message);
      failedCount++;
    }
  }

  console.log(
    `[GitHub-CSV] Complete: ${repoList.length} scanned, ${repairedCount} repaired, ${failedCount} failed, ${checksumFailureCount} checksum errors`,
  );

  if (checksumCircuit.isOpen) {
    console.error(
      `[GitHub-CSV] DEGRADED: Checksum circuit is OPEN due to repeated failures. Last error: ${checksumCircuit.lastError}`,
    );
  }

  return {
    scannedRepos: repoList.length,
    repairedRepos: repairedCount,
    failedRepairs: failedCount,
    checksumFailures: checksumFailureCount,
    checksumCircuitOpen: checksumCircuit.isOpen,
  };
}
