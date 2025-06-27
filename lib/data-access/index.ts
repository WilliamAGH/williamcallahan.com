/**
 * Data access directory index - fallback for module resolution
 *
 * @module lib/data-access/index
 */

// Bookmarks exports are now in @/lib/bookmarks (server-specific)
export {
  getBookmarks,
  initializeBookmarksDataAccess,
  cleanupBookmarksDataAccess,
} from "@/lib/bookmarks/bookmarks-data-access.server";

// ---- GitHub Data Access (explicit public surface) ----
export {
  getGithubActivity,
  refreshGitHubActivityDataFromApi,
  calculateAndStoreAggregatedWeeklyActivity,
  invalidateGitHubCache,
  invalidateGitHubActivityCache,
} from "./github";

// ---- Logo Data Access (explicit public surface) ----
export {
  resetLogoSessionTracking,
  invalidateLogoS3Cache,
  getLogo,
  invalidateLogoCache,
  getLogoValidation,
  setLogoValidation,
  getLogoAnalysis,
  setLogoAnalysis,
} from "./logos";

// ---- Investments Data Access ----
export { getInvestmentDomainsAndIds } from "./investments";
