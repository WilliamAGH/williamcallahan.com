/**
 * GitHub activity summary persistence
 * @module data-access/github-activity-summaries
 */

import { formatPacificDateTime } from "@/lib/utils/date-format";
import type { GitHubSummaryInput } from "@/types/github";
import type { GitHubActivitySummary } from "@/types/schemas/github-storage";

export function createGitHubActivitySummary({
  allTimeData,
  totalRepositoriesContributedTo,
  linesOfCodeByCategory,
}: GitHubSummaryInput): GitHubActivitySummary {
  return {
    lastUpdatedAtPacific: formatPacificDateTime(),
    totalContributions: allTimeData.totalContributions,
    totalLinesAdded: allTimeData.linesAdded,
    totalLinesRemoved: allTimeData.linesRemoved,
    netLinesOfCode: allTimeData.linesAdded - allTimeData.linesRemoved,
    dataComplete: allTimeData.dataComplete,
    totalRepositoriesContributedTo,
    linesOfCodeByCategory,
  };
}
