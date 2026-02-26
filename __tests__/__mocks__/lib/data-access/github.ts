/**
 * Mock for GitHub data access module
 */

import type { StoredGithubActivityRecord, UserActivityView } from "@/types/github";

// Export S3 key constants that other modules may import
export const GITHUB_ACTIVITY_S3_KEY_DIR = "github-activity";
export const GITHUB_ACTIVITY_S3_KEY_FILE = `${GITHUB_ACTIVITY_S3_KEY_DIR}/activity_data-test.json`;
export const GITHUB_ACTIVITY_S3_KEY_FILE_FALLBACK = `${GITHUB_ACTIVITY_S3_KEY_DIR}/activity_data.json`;
export const GITHUB_STATS_SUMMARY_S3_KEY_FILE = `${GITHUB_ACTIVITY_S3_KEY_DIR}/github_stats_summary-test.json`;
export const ALL_TIME_SUMMARY_S3_KEY_FILE = `${GITHUB_ACTIVITY_S3_KEY_DIR}/github_stats_summary_all_time-test.json`;
export const REPO_RAW_WEEKLY_STATS_S3_KEY_DIR = `${GITHUB_ACTIVITY_S3_KEY_DIR}/repo_raw_weekly_stats-test`;
export const AGGREGATED_WEEKLY_ACTIVITY_S3_KEY_FILE = `${GITHUB_ACTIVITY_S3_KEY_DIR}/aggregated_weekly_activity-test.json`;

const mockActivity: UserActivityView = {
  source: "db-store",
  trailingYearData: {
    data: [{ date: "2026-01-01", count: 12, level: 2 }],
    totalContributions: 1234,
    linesAdded: 321,
    linesRemoved: 123,
    dataComplete: true,
  },
  allTimeStats: {
    totalContributions: 5678,
    linesAdded: 4321,
    linesRemoved: 2100,
  },
};

function toStoredRecord(segment: UserActivityView["trailingYearData"]): StoredGithubActivityRecord {
  return {
    source: "api",
    data: segment.data,
    totalContributions: segment.totalContributions,
    linesAdded: segment.linesAdded,
    linesRemoved: segment.linesRemoved,
    dataComplete: segment.dataComplete,
  };
}

let cacheInvalidated = false;

export async function getGithubActivity(): Promise<UserActivityView> {
  return Promise.resolve(mockActivity);
}

export function invalidateAllGitHubCaches(): void {
  cacheInvalidated = true;
  console.log("[Mock] GitHub cache invalidated");
}

export function refreshGitHubActivityDataFromApi() {
  return Promise.resolve({
    trailingYearData: toStoredRecord(mockActivity.trailingYearData),
    allTimeData: {
      source: "api",
      data: mockActivity.trailingYearData.data,
      totalContributions: mockActivity.allTimeStats.totalContributions,
      linesAdded: mockActivity.allTimeStats.linesAdded,
      linesRemoved: mockActivity.allTimeStats.linesRemoved,
      dataComplete: true,
    } satisfies StoredGithubActivityRecord,
  });
}

// For testing
export function wasCacheInvalidated(): boolean {
  return cacheInvalidated;
}

export function resetMock(): void {
  cacheInvalidated = false;
}
