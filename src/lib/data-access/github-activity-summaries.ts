/**
 * GitHub activity summary persistence
 * @module data-access/github-activity-summaries
 */

import { debug } from "@/lib/utils/debug";
import { formatPacificDateTime } from "@/lib/utils/date-format";
import { createCategorizedError } from "@/lib/utils/error-utils";
import { createEmptyCategoryStats } from "./github-processing";
import { writeGitHubSummaryRecord } from "./github-storage";
import type { GitHubSummaryInput } from "@/types/github";
import type { GitHubActivitySummary } from "@/types/schemas/github-storage";

export async function writeGitHubActivitySummary({
  allTimeData,
  totalRepositoriesContributedTo,
  allTimeCategoryStats,
}: GitHubSummaryInput): Promise<boolean> {
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

    const netAllTimeLoc = allTimeData.linesAdded - allTimeData.linesRemoved;
    const allTimeSummaryData: GitHubActivitySummary = {
      lastUpdatedAtPacific: formatPacificDateTime(),
      totalContributions: allTimeData.totalContributions,
      totalLinesAdded: allTimeData.linesAdded,
      totalLinesRemoved: allTimeData.linesRemoved,
      netLinesOfCode: netAllTimeLoc,
      dataComplete: allTimeData.dataComplete,
      totalRepositoriesContributedTo,
      linesOfCodeByCategory: finalAllTimeCategoryStats,
    };
    await writeGitHubSummaryRecord(allTimeSummaryData);
    debug("[DataAccess/GitHub-Store] All-time GitHub summary saved to PostgreSQL");
    return true;
  } catch (summaryError: unknown) {
    const categorizedError = createCategorizedError(summaryError, "github");
    console.error(
      "[DataAccess/GitHub-Store] Failed to write all-time GitHub summary:",
      categorizedError.message,
    );
    return false;
  }
}
