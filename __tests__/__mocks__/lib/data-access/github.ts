/**
 * Mock for GitHub data access module
 */

import type { UserActivityView } from '@/types/github';

// Export S3 key constants that other modules may import
export const GITHUB_ACTIVITY_S3_KEY_DIR = "github-activity";
export const GITHUB_ACTIVITY_S3_KEY_FILE = `${GITHUB_ACTIVITY_S3_KEY_DIR}/activity_data-test.json`;
export const GITHUB_ACTIVITY_S3_KEY_FILE_FALLBACK = `${GITHUB_ACTIVITY_S3_KEY_DIR}/activity_data.json`;
export const GITHUB_STATS_SUMMARY_S3_KEY_FILE = `${GITHUB_ACTIVITY_S3_KEY_DIR}/github_stats_summary-test.json`;
export const ALL_TIME_SUMMARY_S3_KEY_FILE = `${GITHUB_ACTIVITY_S3_KEY_DIR}/github_stats_summary_all_time-test.json`;
export const REPO_RAW_WEEKLY_STATS_S3_KEY_DIR = `${GITHUB_ACTIVITY_S3_KEY_DIR}/repo_raw_weekly_stats-test`;
export const AGGREGATED_WEEKLY_ACTIVITY_S3_KEY_FILE = `${GITHUB_ACTIVITY_S3_KEY_DIR}/aggregated_weekly_activity-test.json`;

const mockActivity: UserActivityView = {
  trailingYearData: {
    contributionCalendar: {
      totalContributions: 1234,
      weeks: [],
    },
    commitsByMonth: [],
    committedRepoNames: [],
    contributionsCollection: {
      totalCommitContributions: 1000,
      totalIssueContributions: 100,
      totalPullRequestContributions: 50,
      totalPullRequestReviewContributions: 84,
    },
  },
  allTimeData: {
    contributionCalendar: {
      totalContributions: 5678,
      weeks: [],
    },
    commitsByMonth: [],
    committedRepoNames: [],
    contributionsCollection: {
      totalCommitContributions: 5000,
      totalIssueContributions: 500,
      totalPullRequestContributions: 100,
      totalPullRequestReviewContributions: 78,
    },
  },
  longTermActivitySegments: [],
  linesOfCodeByQuarter: [],
  aggregatedWeeklyActivity: [],
  languages: {},
  totalLinesOfCode: 0,
};

let cacheInvalidated = false;

export async function getGithubActivity(): Promise<UserActivityView> {
  return Promise.resolve(mockActivity);
}

export function invalidateGitHubCache(): void {
  cacheInvalidated = true;
  console.log('[Mock] GitHub cache invalidated');
}

export function refreshGitHubActivityDataFromApi() {
  return Promise.resolve({
    trailingYearData: mockActivity.trailingYearData,
    allTimeData: mockActivity.allTimeData,
  });
}

// For testing
export function wasCacheInvalidated(): boolean {
  return cacheInvalidated;
}

export function resetMock(): void {
  cacheInvalidated = false;
}