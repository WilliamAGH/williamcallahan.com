/**
 * GitHub activity summary persistence
 * @module data-access/github-activity-summaries
 */

import { debug } from "@/lib/utils/debug";
import { formatPacificDateTime } from "@/lib/utils/date-format";
import { writeGitHubSummaryRecord } from "./github-storage";
import type { GitHubSummaryInput } from "@/types/github";
import type { GitHubActivitySummary } from "@/types/schemas/github-storage";

export async function writeGitHubActivitySummary({
  allTimeData,
  totalRepositoriesContributedTo,
  allTimeCategoryStats,
}: GitHubSummaryInput): Promise<boolean> {
  const allTimeCategories = structuredClone(allTimeCategoryStats);
  for (const category of Object.values(allTimeCategories)) {
    category.repoCount =
      category.linesAdded > 0 || category.linesRemoved > 0 ? totalRepositoriesContributedTo : 0;
  }

  const summary: GitHubActivitySummary = {
    lastUpdatedAtPacific: formatPacificDateTime(),
    totalContributions: allTimeData.totalContributions,
    totalLinesAdded: allTimeData.linesAdded,
    totalLinesRemoved: allTimeData.linesRemoved,
    netLinesOfCode: allTimeData.linesAdded - allTimeData.linesRemoved,
    dataComplete: allTimeData.dataComplete,
    totalRepositoriesContributedTo,
    linesOfCodeByCategory: allTimeCategories,
  };
  const written = await writeGitHubSummaryRecord(summary);
  if (written) debug("[DataAccess/GitHub-Store] All-time GitHub summary saved to PostgreSQL");
  return written;
}
