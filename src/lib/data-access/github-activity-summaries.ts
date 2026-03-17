/**
 * GitHub activity summary persistence
 * @module data-access/github-activity-summaries
 */

import { debug } from "@/lib/utils/debug";
import { formatPacificDateTime } from "@/lib/utils/date-format";
import { createCategorizedError } from "@/lib/utils/error-utils";
import { createEmptyCategoryStats } from "./github-processing";
import { writeGitHubSummaryRecord } from "./github-storage";
import type { GitHubSummaryInput, GitHubSummaryWriteResult } from "@/types/github";
import type { GitHubActivitySummary } from "@/types/schemas/github-storage";

export async function writeGitHubActivitySummaries({
  trailingYearData,
  allTimeData,
  totalRepositoriesContributedTo,
  yearCategoryStats,
  allTimeCategoryStats,
}: GitHubSummaryInput): Promise<GitHubSummaryWriteResult> {
  const result: GitHubSummaryWriteResult = { trailingYearWritten: false, allTimeWritten: false };

  try {
    const netYearLoc = (trailingYearData.linesAdded || 0) - (trailingYearData.linesRemoved || 0);
    const yearSummaryData: GitHubActivitySummary = {
      lastUpdatedAtPacific: formatPacificDateTime(),
      totalContributions: trailingYearData.totalContributions,
      totalLinesAdded: trailingYearData.linesAdded || 0,
      totalLinesRemoved: trailingYearData.linesRemoved || 0,
      netLinesOfCode: netYearLoc,
      dataComplete:
        trailingYearData.dataComplete !== undefined ? trailingYearData.dataComplete : true,
      totalRepositoriesContributedTo,
      linesOfCodeByCategory: yearCategoryStats,
    };
    await writeGitHubSummaryRecord(yearSummaryData);
    debug("[DataAccess/GitHub-Store] Trailing year GitHub summary saved");
    result.trailingYearWritten = true;
  } catch (summaryError: unknown) {
    const categorizedError = createCategorizedError(summaryError, "github");
    console.error(
      "[DataAccess/GitHub-Store] Failed to write trailing year GitHub summary:",
      categorizedError.message,
    );
    // result.trailingYearWritten remains false - caller can check and handle
  }

  try {
    const finalAllTimeCategoryStats = createEmptyCategoryStats();

    for (const catKey of Object.keys(allTimeCategoryStats)) {
      const key = catKey as keyof GitHubActivitySummary["linesOfCodeByCategory"];
      finalAllTimeCategoryStats[key].linesAdded = allTimeCategoryStats[key].linesAdded;
      finalAllTimeCategoryStats[key].linesRemoved = allTimeCategoryStats[key].linesRemoved;
      finalAllTimeCategoryStats[key].netChange = allTimeCategoryStats[key].netChange;
      if (allTimeCategoryStats[key].linesAdded > 0 || allTimeCategoryStats[key].linesRemoved > 0) {
        finalAllTimeCategoryStats[key].repoCount = totalRepositoriesContributedTo;
      } else {
        finalAllTimeCategoryStats[key].repoCount = 0;
      }
    }

    const netAllTimeLoc = (allTimeData.linesAdded || 0) - (allTimeData.linesRemoved || 0);
    const allTimeSummaryData: GitHubActivitySummary = {
      lastUpdatedAtPacific: formatPacificDateTime(),
      totalContributions: allTimeData.totalContributions,
      totalLinesAdded: allTimeData.linesAdded || 0,
      totalLinesRemoved: allTimeData.linesRemoved || 0,
      netLinesOfCode: netAllTimeLoc,
      dataComplete: allTimeData.dataComplete !== undefined ? allTimeData.dataComplete : true,
      totalRepositoriesContributedTo,
      linesOfCodeByCategory: finalAllTimeCategoryStats,
    };
    await writeGitHubSummaryRecord(allTimeSummaryData);
    debug("[DataAccess/GitHub-Store] All-time GitHub summary saved to PostgreSQL");
    result.allTimeWritten = true;
  } catch (summaryError: unknown) {
    const categorizedError = createCategorizedError(summaryError, "github");
    console.error(
      "[DataAccess/GitHub-Store] Failed to write all-time GitHub summary:",
      categorizedError.message,
    );
    // result.allTimeWritten remains false - caller can check and handle
  }

  return result;
}
