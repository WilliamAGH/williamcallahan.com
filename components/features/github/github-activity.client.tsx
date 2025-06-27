/**
 * Component that displays a graph of the user's GitHub activity
 * Fetches and visualizes contribution data with refresh capabilities
 */

"use client";

import type { ContributionDay, UserActivityView } from "@/types/github";
import { formatDistanceToNow } from "date-fns";
import { Code, RefreshCw } from "lucide-react";
import { useTheme } from "next-themes";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import ActivityCalendarComponent, { type ThemeInput as ReactActivityCalendarThemeInput } from "react-activity-calendar";
import CumulativeGitHubStatsCards from "./cumulative-github-stats-cards";
import type { ApiError } from "@/types/features/github";

const GITHUB_PROFILE_URL = "https://github.com/WilliamAGH/";

// Define the custom theme for the calendar
const calendarCustomTheme: ReactActivityCalendarThemeInput = {
  // TODO: Consider moving to a constants file if used elsewhere
  light: [
    "#E5E7EB", // level 0 (Tailwind gray-200)
    "#BBF7D0", // level 1 (Tailwind green-200)
    "#4ADE80", // level 2 (Tailwind green-400)
    "#16A34A", // level 3 (Tailwind green-600)
    "#166534", // level 4 (Tailwind green-800)
  ],
  dark: [
    "#1F2937", // level 0 (Tailwind gray-800)
    "#14532D", // level 1 (Tailwind green-900)
    "#15803D", // level 2 (Tailwind green-700)
    "#22C55E", // level 3 (Tailwind green-500)
    "#86EFAC", // level 4 (Tailwind green-300)
  ],
};

const GitHubActivity = () => {
  const { theme: currentNextTheme } = useTheme(); // Current theme from next-themes
  const [activityData, setActivityData] = useState<ContributionDay[]>([]); // Activity data for the calendar
  const [isLoading, setIsLoading] = useState(true); // Loading state for initial data fetch
  const [isRefreshing, setIsRefreshing] = useState(false); // Loading state for refresh operation
  const [error, setError] = useState<string | null>(null); // Error message, if any

  // State for trailing year summary text
  const [totalContributions, setTotalContributions] = useState<number | null>(null); // Total contributions in the trailing year
  const [trailingYearLinesAdded, setTrailingYearLinesAdded] = useState<number | null>(null); // Lines added in the trailing year
  const [trailingYearLinesRemoved, setTrailingYearLinesRemoved] = useState<number | null>(null); // Lines removed in the trailing year

  // State for all-time stats (used by CumulativeGitHubStatsCards)
  const [allTimeLinesAdded, setAllTimeLinesAdded] = useState<number | null>(null); // All-time lines added
  const [allTimeLinesRemoved, setAllTimeLinesRemoved] = useState<number | null>(null); // All-time lines removed
  const [allTimeTotalContributions, setAllTimeTotalContributions] = useState<number | null>(null); // All-time total contributions

  const [dataComplete, setDataComplete] = useState<boolean>(true); // Flag indicating if the fetched data is complete
  const [lastRefreshed, setLastRefreshed] = useState<string | null>(null); // Timestamp of the last data refresh

  // Determine if refresh buttons should be shown based on environment
  const coolifyUrl = process.env.NEXT_PUBLIC_COOLIFY_URL;
  const targetUrl = "https://williamcallahan.com";
  let showRefreshButtons = true;
  if (coolifyUrl) {
    const normalizedCoolifyUrl = coolifyUrl.endsWith("/") ? coolifyUrl.slice(0, -1) : coolifyUrl;
    const normalizedTargetUrl = targetUrl.endsWith("/") ? targetUrl.slice(0, -1) : targetUrl;
    if (normalizedCoolifyUrl === normalizedTargetUrl) {
      showRefreshButtons = false;
    }
  }

  const fetchInitiatedRef = useRef(false); // Ref to track if the initial fetch has been initiated

  /**
   * Navigates to the user's GitHub profile in a new tab.
   */
  const navigateToGitHub = () => {
    window.open(GITHUB_PROFILE_URL, "_blank", "noopener");
  };

  /**
   * Resets all component state related to fetched data.
   * Useful for clearing stale data on error or before a new fetch.
   * Wrapped in useCallback as it's a dependency of fetchData.
   */
  const resetState = useCallback(() => {
    setActivityData([]);
    setTotalContributions(null);
    setTrailingYearLinesAdded(null); // Reset for summary
    setTrailingYearLinesRemoved(null); // Reset for summary
    setAllTimeLinesAdded(null); // Reset for cards
    setAllTimeLinesRemoved(null); // Reset for cards
    setAllTimeTotalContributions(null); // Reset for cards
    setDataComplete(false); // Assume data is incomplete after reset
    setLastRefreshed(null);
    setError(null); // Also reset error state
  }, []);

  /**
   * Fetches GitHub activity data from the API.
   * Can optionally trigger a data refresh on the server before fetching.
   * Wrapped in useCallback to stabilize its reference for useEffect dependencies.
   * @param {boolean} [refresh=false] - If true, requests a data refresh on the server.
   */
  const fetchData = useCallback(
    async (refresh = false) => {
      setIsLoading(true);
      if (!refresh) setError(null); // Clear previous non-refresh errors on new fetch, keep refresh-related errors

      try {
        if (refresh) {
          setIsRefreshing(true);
          console.log("[Client] Requesting GitHub data refresh via POST /api/github-activity/refresh");
          const refreshResponse = await fetch("/api/github-activity/refresh", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
          });
          if (!refreshResponse.ok) {
            let refreshErrorResult: ApiError | null = null;
            try {
              refreshErrorResult = (await refreshResponse.json()) as ApiError;
            } catch {
              /* Failed to parse response JSON, error message will be generic */
            }
            const errorMessage =
              refreshErrorResult?.message ??
              refreshErrorResult?.error ??
              `Refresh request failed with status: ${refreshResponse.status}`;
            console.error("[Client] GitHub data refresh POST request failed:", errorMessage);
            setError(errorMessage); // Set error, but still proceed to fetch current data
          } else {
            console.log("[Client] GitHub data refresh POST request successful.");
            // setError(null); // Clear error if refresh was successful before fetching - No, keep error if subsequent GET fails
          }
        }

        console.log(
          `[Client] Fetching GitHub data from GET /api/github-activity (${refresh ? "after potential refresh" : "initial load"})`,
        );
        const response = await fetch("/api/github-activity");
        let result: UserActivityView;

        try {
          result = (await response.json()) as UserActivityView;
        } catch (parseError) {
          const errorMessage = `Failed to parse API response from GET /api/github-activity: ${parseError instanceof Error ? parseError.message : "Unknown parse error"}`;
          console.error(errorMessage);
          setError(errorMessage);
          resetState(); // Full reset if parsing fails
          return;
        }

        if (!response.ok) {
          const errorMsg = result?.error ?? `API request failed with status: ${response.status}`;
          console.error("GitHub Activity GET API returned an error:", errorMsg);
          setError(errorMsg); // Set error from API response

          // Try to use partial data if available, even with an error response
          setActivityData(result?.trailingYearData?.data ?? []);
          setTotalContributions(result?.trailingYearData?.totalContributions ?? 0);
          setTrailingYearLinesAdded(result?.trailingYearData?.linesAdded ?? null);
          setTrailingYearLinesRemoved(result?.trailingYearData?.linesRemoved ?? null);
          setDataComplete(result?.trailingYearData?.dataComplete ?? false);

          setAllTimeLinesAdded(result?.allTimeStats?.linesAdded ?? null);
          setAllTimeLinesRemoved(result?.allTimeStats?.linesRemoved ?? null);
          setAllTimeTotalContributions(result?.allTimeStats?.totalContributions ?? null);

          setLastRefreshed(result?.lastRefreshed ?? null);
          return; // Return after setting partial data/error
        }

        // If response is OK and data is present
        setActivityData(result?.trailingYearData?.data ?? []);
        setTotalContributions(result?.trailingYearData?.totalContributions ?? 0);
        setTrailingYearLinesAdded(result?.trailingYearData?.linesAdded ?? null);
        setTrailingYearLinesRemoved(result?.trailingYearData?.linesRemoved ?? null);
        setDataComplete(result?.trailingYearData?.dataComplete ?? false);
        setLastRefreshed(result?.lastRefreshed ?? null);

        if (result?.trailingYearData) {
          console.log("[Client] Trailing year activity data received:", result.trailingYearData);
        } else {
          console.warn("[Client] Trailing year data missing in successful API response.");
          setDataComplete(false); // Assume incomplete if no trailing year data
        }

        setAllTimeLinesAdded(result?.allTimeStats?.linesAdded ?? null);
        setAllTimeLinesRemoved(result?.allTimeStats?.linesRemoved ?? null);
        setAllTimeTotalContributions(result?.allTimeStats?.totalContributions ?? null);

        if (result?.allTimeStats) {
          console.log("[Client] All-time stats received:", result.allTimeStats);
        } else {
          console.warn("[Client] All-time stats (result.allTimeStats) is missing in API response.");
        }

        if (result?.lastRefreshed) {
          console.log("[Client] Data last refreshed:", result.lastRefreshed);
          // lastRefreshed is already set above, this is redundant unless logic changes
        }
      } catch (err: unknown) {
        console.error("Failed to fetch or parse GitHub activity:", err); // Log the full error object
        setError(err instanceof Error ? err.message : "An unknown error occurred while fetching data.");
        resetState(); // Full reset on critical fetch/parse error
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [resetState],
  );

  /**
   * Handles the click event for the refresh button.
   * Stops event propagation and triggers a data fetch with refresh.
   * @param {React.MouseEvent} e - The mouse event.
   */
  const handleRefresh = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent card click
    void fetchData(true);
  };

  /**
   * Handles the click event for the force cache/incomplete data refresh button.
   * Stops event propagation and triggers a data fetch with refresh.
   * @param {React.MouseEvent} e - The mouse event.
   */
  const handleForceCache = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent card click
    console.log("[Client] Force cache button clicked, triggering a refresh");
    void fetchData(true); // Same as refresh
  };

  /**
   * Effect to fetch initial data on component mount.
   * Uses a ref to ensure fetchData is called only once.
   */
  useEffect(() => {
    if (fetchInitiatedRef.current) return;
    fetchInitiatedRef.current = true;
    void fetchData();
  }, [fetchData]); // Add fetchData to dependency array

  /**
   * Handles click events on the main card div for navigation.
   * Only navigates if the click target is not a button (to avoid conflicts with refresh buttons).
   * @param {React.MouseEvent<HTMLButtonElement>} e - The mouse event.
   */
  const handleCardClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    // Check if the clicked element or its parent is a button
    const target = e.target as HTMLElement;
    const isButton = target.tagName === "BUTTON" || target.closest("button");

    if (!isButton) {
      navigateToGitHub();
    }
  };

  /**
   * Handles keyboard events for accessibility compliance.
   */
  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      // Check if the focused element or its parent is a button
      const target = e.target as HTMLElement;
      const isButton = target.tagName === "BUTTON" || target.closest("button");

      if (!isButton) {
        e.preventDefault();
        navigateToGitHub();
      }
    }
  };

  return (
    <button
      type="button"
      className="bg-white dark:bg-neutral-900 p-4 rounded-lg shadow-card cursor-pointer hover:shadow-card-hover transition-all duration-300 transform hover:-translate-y-1 group text-left w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
      onClick={handleCardClick}
      onKeyDown={handleKeyDown}
      aria-label="View GitHub Profile and Activity"
    >
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 flex items-center group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
          <Code size={20} className="mr-2 text-blue-500 group-hover:scale-110 transition-transform" />
          GitHub Activity
        </h3>
        {showRefreshButtons && (
          <div className="flex space-x-2">
            {!dataComplete && !isRefreshing && !isLoading && (
              <button
                type="button"
                onClick={handleForceCache}
                className="p-1.5 rounded-full bg-yellow-100 hover:bg-yellow-200 dark:bg-yellow-900/30 dark:hover:bg-yellow-900/50 transition-colors text-yellow-600 dark:text-yellow-500 hover:scale-110 focus:outline-none focus:ring-2 focus:ring-yellow-400"
                title="Data incomplete. Click to attempt refresh."
                aria-label="Refresh incomplete data"
              >
                <RefreshCw size={16} />
              </button>
            )}
            <button
              type="button"
              onClick={handleRefresh}
              disabled={isRefreshing || isLoading}
              className="p-1.5 rounded-full bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 transition-all hover:scale-110 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
              title="Refresh GitHub data"
              aria-label="Refresh GitHub data"
            >
              <RefreshCw size={16} className={`${isRefreshing ? "animate-spin text-blue-500" : "text-gray-500"}`} />
            </button>
          </div>
        )}
      </div>

      {isLoading && ( // This covers both initial load and refresh triggered loading
        <div className="flex justify-center items-center h-48">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
          <p className="ml-3 text-gray-600 dark:text-gray-400">Loading activity data...</p>
        </div>
      )}

      {error &&
        !isLoading && ( // Show error only if not currently loading
          <div className="text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-900/20 p-3 rounded-md">
            <p className="font-medium">Error fetching GitHub activity:</p>
            <p className="text-sm">{error}</p>
            <p className="text-sm mt-1">Try refreshing, or check data source availability.</p>
          </div>
        )}

      {!isLoading && !error && (
        <>
          {activityData.length === 0 && (totalContributions === null || totalContributions === 0) ? (
            <div className="text-center py-10 text-gray-500 dark:text-gray-400">
              <p>No contribution activity found for the trailing year.</p>
              {dataComplete === false && lastRefreshed && (
                <p className="text-sm mt-1">
                  Data might be incomplete. Last attempt:{" "}
                  {formatDistanceToNow(new Date(lastRefreshed), { addSuffix: true })}.
                </p>
              )}
            </div>
          ) : (
            <div className="mt-4 mb-2 p-2 rounded-md bg-neutral-100 dark:bg-neutral-800/50 overflow-x-auto w-full">
              <ActivityCalendarComponent
                data={activityData}
                theme={calendarCustomTheme}
                colorScheme={currentNextTheme === "dark" ? "dark" : "light"}
                blockSize={14}
                blockMargin={3}
                fontSize={14}
                hideTotalCount
                showWeekdayLabels
              />
            </div>
          )}
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-2">
            {totalContributions !== null && (
              <span>
                Total contributions (trailing year):{" "}
                <span className="font-medium">{totalContributions.toLocaleString()}</span>.{" "}
              </span>
            )}
            {trailingYearLinesAdded !== null && trailingYearLinesRemoved !== null && (
              <span>
                LOC Change (trailing year):{" "}
                <span className="text-green-600 dark:text-green-400 font-medium">
                  +{trailingYearLinesAdded.toLocaleString()}
                </span>{" "}
                /{" "}
                <span className="text-red-600 dark:text-red-400 font-medium">
                  -{trailingYearLinesRemoved.toLocaleString()}
                </span>
                .{" "}
              </span>
            )}
            {lastRefreshed && (
              <span title={`Data last updated: ${new Date(lastRefreshed).toLocaleString()}`}>
                Last updated: {formatDistanceToNow(new Date(lastRefreshed), { addSuffix: true })}.
              </span>
            )}
          </div>
          {allTimeLinesAdded !== null && allTimeLinesRemoved !== null && allTimeTotalContributions !== null && (
            <div className="mt-6">
              <CumulativeGitHubStatsCards
                stats={{
                  totalContributions: allTimeTotalContributions,
                  linesAdded: allTimeLinesAdded,
                  linesRemoved: allTimeLinesRemoved,
                  netLinesOfCode: allTimeLinesAdded - allTimeLinesRemoved,
                }}
              />
            </div>
          )}
        </>
      )}
    </button>
  );
};

export default GitHubActivity;
