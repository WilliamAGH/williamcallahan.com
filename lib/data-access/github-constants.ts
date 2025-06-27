/**
 * GitHub Data Access Constants
 *
 * Shared constants for GitHub data access modules
 * Breaks circular dependency between github-storage and github-processing
 *
 * @module data-access/github-constants
 */

import { GITHUB_ACTIVITY_S3_PATHS } from "@/lib/constants";

// Re-export S3 paths for GitHub modules
export const GITHUB_ACTIVITY_S3_KEY_DIR = GITHUB_ACTIVITY_S3_PATHS.DIR;
export const GITHUB_ACTIVITY_S3_KEY_FILE = GITHUB_ACTIVITY_S3_PATHS.ACTIVITY_DATA;
export const GITHUB_ACTIVITY_S3_KEY_FILE_FALLBACK = GITHUB_ACTIVITY_S3_PATHS.ACTIVITY_DATA_PROD_FALLBACK;
export const GITHUB_STATS_SUMMARY_S3_KEY_FILE = GITHUB_ACTIVITY_S3_PATHS.STATS_SUMMARY;
export const ALL_TIME_SUMMARY_S3_KEY_FILE = GITHUB_ACTIVITY_S3_PATHS.ALL_TIME_SUMMARY;
export const REPO_RAW_WEEKLY_STATS_S3_KEY_DIR = GITHUB_ACTIVITY_S3_PATHS.REPO_RAW_WEEKLY_STATS_DIR;
export const AGGREGATED_WEEKLY_ACTIVITY_S3_KEY_FILE = GITHUB_ACTIVITY_S3_PATHS.AGGREGATED_WEEKLY;
