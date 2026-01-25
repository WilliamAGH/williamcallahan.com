/**
 * Data access directory index - fallback for module resolution
 *
 * Note: Bookmarks data access should be imported directly from
 * '@/lib/bookmarks/bookmarks-data-access.server' per FS1h (no aliases/re-exports)
 *
 * @module lib/data-access/index
 */

// ---- GitHub Data Access (explicit public surface) ----
export {
  getGithubActivity,
  refreshGitHubActivityDataFromApi,
  calculateAndStoreAggregatedWeeklyActivity,
  invalidateAllGitHubCaches,
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
