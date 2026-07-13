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
  linesOfCodeByCategory,
}: GitHubSummaryInput): Promise<boolean> {
  const summary: GitHubActivitySummary = {
    lastUpdatedAtPacific: formatPacificDateTime(),
    totalContributions: allTimeData.totalContributions,
    totalLinesAdded: allTimeData.linesAdded,
    totalLinesRemoved: allTimeData.linesRemoved,
    netLinesOfCode: allTimeData.linesAdded - allTimeData.linesRemoved,
    dataComplete: allTimeData.dataComplete,
    totalRepositoriesContributedTo,
    linesOfCodeByCategory,
  };
  const written = await writeGitHubSummaryRecord(summary);
  if (written) debug("[DataAccess/GitHub-Store] All-time GitHub summary saved to PostgreSQL");
  return written;
}
