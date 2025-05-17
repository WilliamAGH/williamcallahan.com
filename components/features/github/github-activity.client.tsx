/**
 * Component that displays a graph of the user's GitHub activity
 * Fetches and visualizes contribution data with refresh capabilities
 */

'use client';

import React, { useState, useEffect, useRef } from 'react';
import type { ContributionDay, UserActivityView } from '@/types/github';
import { RefreshCw, Code } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import CumulativeGitHubStatsCards from './cumulative-github-stats-cards';
import ActivityCalendarComponent, { type ThemeInput as ReactActivityCalendarThemeInput } from 'react-activity-calendar';
import { useTheme } from 'next-themes';

const GITHUB_PROFILE_URL = "https://github.com/williamagh/";

interface ApiError {
  message?: string;
  error?: string;
}

// Define the custom theme for the calendar
const calendarCustomTheme: ReactActivityCalendarThemeInput = {
  light: [
    '#E5E7EB', // level 0 (Tailwind gray-200)
    '#BBF7D0', // level 1 (Tailwind green-200)
    '#4ADE80', // level 2 (Tailwind green-400)
    '#16A34A', // level 3 (Tailwind green-600)
    '#166534', // level 4 (Tailwind green-800)
  ],
  dark: [
    '#1F2937', // level 0 (Tailwind gray-800)
    '#14532D', // level 1 (Tailwind green-900)
    '#15803D', // level 2 (Tailwind green-700)
    '#22C55E', // level 3 (Tailwind green-500)
    '#86EFAC', // level 4 (Tailwind green-300)
  ],
};

const GitHubActivity = () => {
  const { theme: currentNextTheme } = useTheme();
  const [activityData, setActivityData] = useState<ContributionDay[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // State for trailing year summary text
  const [totalContributions, setTotalContributions] = useState<number | null>(null);
  const [trailingYearLinesAdded, setTrailingYearLinesAdded] = useState<number | null>(null); // For summary text
  const [trailingYearLinesRemoved, setTrailingYearLinesRemoved] = useState<number | null>(null); // For summary text

  // State for all-time stats (used by CumulativeGitHubStatsCards)
  const [allTimeLinesAdded, setAllTimeLinesAdded] = useState<number | null>(null);
  const [allTimeLinesRemoved, setAllTimeLinesRemoved] = useState<number | null>(null);
  const [allTimeTotalContributions, setAllTimeTotalContributions] = useState<number | null>(null);

  const [dataComplete, setDataComplete] = useState<boolean>(true);
  const [lastRefreshed, setLastRefreshed] = useState<string | null>(null);

  // Determine if refresh buttons should be shown
  const coolifyUrl = process.env.NEXT_PUBLIC_COOLIFY_URL;
  const targetUrl = 'https://williamcallahan.com';
  let showRefreshButtons = true;
  if (coolifyUrl) {
    const normalizedCoolifyUrl = coolifyUrl.endsWith('/') ? coolifyUrl.slice(0, -1) : coolifyUrl;
    const normalizedTargetUrl = targetUrl.endsWith('/') ? targetUrl.slice(0, -1) : targetUrl;
    if (normalizedCoolifyUrl === normalizedTargetUrl) {
      showRefreshButtons = false;
    }
  }

  const fetchInitiatedRef = useRef(false);

  const navigateToGitHub = () => {
    window.open(GITHUB_PROFILE_URL, '_blank', 'noopener,noreferrer');
  };

  const resetState = () => {
    setActivityData([]);
    setTotalContributions(null);
    setTrailingYearLinesAdded(null); // Reset for summary
    setTrailingYearLinesRemoved(null); // Reset for summary
    setAllTimeLinesAdded(null); // Reset for cards
    setAllTimeLinesRemoved(null); // Reset for cards
    setAllTimeTotalContributions(null); // Reset for cards
    setDataComplete(false);
    setLastRefreshed(null);
    setError(null); // Also reset error
  };

  const fetchData = async (refresh = false) => {
    setIsLoading(true);
    if (!refresh) setError(null); // Clear previous non-refresh errors on new fetch

    try {
      if (refresh) {
        setIsRefreshing(true);
        console.log('[Client] Requesting GitHub data refresh via POST /api/github-activity/refresh');
        const refreshResponse = await fetch('/api/github-activity/refresh', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-refresh-secret': process.env.NEXT_PUBLIC_GITHUB_REFRESH_SECRET || ''
          },
        });
        if (!refreshResponse.ok) {
          let refreshErrorResult: ApiError | null = null;
          try {
            refreshErrorResult = await refreshResponse.json() as ApiError;
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          } catch (_e) { /* Failed to parse response JSON */ }
          const errorMessage = refreshErrorResult?.message || refreshErrorResult?.error || `Refresh request failed with status: ${refreshResponse.status}`;
          console.error('[Client] GitHub data refresh POST request failed:', errorMessage);
          setError(errorMessage); // Set error, but still proceed to fetch current data
        } else {
          console.log('[Client] GitHub data refresh POST request successful.');
          setError(null); // Clear error if refresh was successful before fetching
        }
      }

      console.log(`[Client] Fetching GitHub data from GET /api/github-activity (${refresh ? 'after potential refresh' : 'initial load'})`);
      const response = await fetch('/api/github-activity');
      let result: UserActivityView;

      try {
        result = await response.json() as UserActivityView;
      } catch (parseError) {
        const errorMessage = `Failed to parse API response from GET /api/github-activity: ${parseError instanceof Error ? parseError.message : 'Unknown parse error'}`;
        console.error(errorMessage);
        setError(errorMessage);
        resetState(); // Full reset if parsing fails
        return;
      }

      if (!response.ok) {
        const errorMsg = result?.error || `API request failed with status: ${response.status}`;
        console.error('GitHub Activity GET API returned an error:', errorMsg);
        setError(errorMsg); // Set error from API response

        // Try to use partial data if available, even with an error response
        if (result?.trailingYearData) {
          setActivityData(result.trailingYearData.data || []);
          setTotalContributions(result.trailingYearData.totalContributions || 0);
          setTrailingYearLinesAdded(result.trailingYearData.linesAdded || null);
          setTrailingYearLinesRemoved(result.trailingYearData.linesRemoved || null);
          setDataComplete(result.trailingYearData.dataComplete ?? false);
        } else {
            // No trailing year data, ensure these are nulled
            setActivityData([]);
            setTotalContributions(null);
            setTrailingYearLinesAdded(null);
            setTrailingYearLinesRemoved(null);
            setDataComplete(false);
        }

        if (result?.allTimeStats) {
          setAllTimeLinesAdded(result.allTimeStats.linesAdded || 0);
          setAllTimeLinesRemoved(result.allTimeStats.linesRemoved || 0);
          setAllTimeTotalContributions(result.allTimeStats.totalContributions || 0);
        } else {
            setAllTimeLinesAdded(null);
            setAllTimeLinesRemoved(null);
            setAllTimeTotalContributions(null);
        }
        setLastRefreshed(result?.lastRefreshed || null);
        return; // Return after setting partial data/error
      }

      // If response is OK and data is present
      if (result && result.trailingYearData) {
        setActivityData(result.trailingYearData.data || []);
        setTotalContributions(result.trailingYearData.totalContributions || 0);
        setTrailingYearLinesAdded(result.trailingYearData.linesAdded || null);
        setTrailingYearLinesRemoved(result.trailingYearData.linesRemoved || null);
        setDataComplete(result.trailingYearData.dataComplete ?? false);
        setLastRefreshed(result.lastRefreshed || null);
        console.log('[Client] Trailing year activity data received:', result.trailingYearData);
      } else {
        // Handle case where trailingYearData might be missing even in a 200 OK
        console.warn('[Client] Trailing year data missing in successful API response.');
        setActivityData([]);
        setTotalContributions(null);
        setTrailingYearLinesAdded(null);
        setTrailingYearLinesRemoved(null);
        setDataComplete(false); // Assume incomplete
      }

      if (result && result.allTimeStats) {
        setAllTimeLinesAdded(result.allTimeStats.linesAdded || 0);
        setAllTimeLinesRemoved(result.allTimeStats.linesRemoved || 0);
        setAllTimeTotalContributions(result.allTimeStats.totalContributions || 0);
        console.log('[Client] All-time stats received:', result.allTimeStats);
      } else {
        console.warn('[Client] All-time stats (result.allTimeStats) is missing in API response.');
        setAllTimeLinesAdded(null);
        setAllTimeLinesRemoved(null);
        setAllTimeTotalContributions(null);
      }
       if (result.lastRefreshed) { // Already set above if trailingYearData exists, but good fallback
          console.log('[Client] Data last refreshed:', result.lastRefreshed);
          if (!lastRefreshed) setLastRefreshed(result.lastRefreshed);
       }

    } catch (err: unknown) {
      console.error('Failed to fetch or parse GitHub activity:', err);
      setError(err instanceof Error ? err.message : 'An unknown error occurred while fetching data');
      resetState(); // Full reset on critical fetch/parse error
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  const handleRefresh = (e: React.MouseEvent) => {
    e.stopPropagation();
    void fetchData(true);
  };

  const handleForceCache = (e: React.MouseEvent) => {
    e.stopPropagation();
    console.log('[Client] Force cache button clicked, triggering a refresh');
    void fetchData(true); // Same as refresh, effectively
  };

  useEffect(() => {
    if (fetchInitiatedRef.current) return;
    fetchInitiatedRef.current = true;
    void fetchData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty dependency array ensures this runs once on mount

  return (
    <div
      className="bg-white dark:bg-neutral-900 p-4 rounded-lg shadow-card cursor-pointer hover:shadow-card-hover transition-all duration-300 transform hover:-translate-y-1 group"
      onClick={navigateToGitHub}
    >
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 flex items-center group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
          <Code size={20} className="mr-2 text-blue-500 group-hover:scale-110 transition-transform" />
          GitHub Activity
        </h3>
        {showRefreshButtons && (
          <div className="flex space-x-2">
            {!dataComplete && !isRefreshing && (
              <button
                onClick={handleForceCache}
                className="p-1.5 rounded-full bg-yellow-100 hover:bg-yellow-200 dark:bg-yellow-900/30 dark:hover:bg-yellow-900/50 transition-colors text-yellow-600 dark:text-yellow-500 hover:scale-110"
                title="Data incomplete. Click to attempt refresh."
                aria-label="Refresh incomplete data"
              >
                <RefreshCw size={16} />
              </button>
            )}
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="p-1.5 rounded-full bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 transition-all hover:scale-110"
              title="Refresh GitHub data"
              aria-label="Refresh GitHub data"
            >
              <RefreshCw
                size={16}
                className={`${isRefreshing ? 'animate-spin text-blue-500' : 'text-gray-500'}`}
              />
            </button>
          </div>
        )}
      </div>

      {isLoading && (
        <div className="flex justify-center items-center h-48">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
          <p className="ml-3 text-gray-600 dark:text-gray-400">Loading activity data...</p>
        </div>
      )}

      {error && !isLoading && (
        <div className="text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-900/20 p-3 rounded-md">
          <p>Error: {error}</p>
          <p>Try refreshing or check data source availability</p>
        </div>
      )}

      {!isLoading && !error && (
        <>
          {activityData.length === 0 && (totalContributions === null || totalContributions === 0) ? (
            <div className="text-center py-10 text-gray-500 dark:text-gray-400">
              <p>No contribution activity found for the trailing year.</p>
              {dataComplete === false && lastRefreshed && (
                <p className="text-sm mt-1">Data might be incomplete. Last attempt: {formatDistanceToNow(new Date(lastRefreshed), { addSuffix: true })}.</p>
              )}
            </div>
          ) : (
            <div className="mt-4 mb-2 p-2 rounded-md bg-neutral-100 dark:bg-neutral-800/50 overflow-x-auto w-full">
              <ActivityCalendarComponent
                data={activityData}
                theme={calendarCustomTheme}
                colorScheme={currentNextTheme === 'dark' ? 'dark' : 'light'}
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
              <span>Total contributions (trailing year): <span className="font-medium">{totalContributions.toLocaleString()}</span>. </span>
            )}
            {trailingYearLinesAdded !== null && trailingYearLinesRemoved !== null && (
              <span>LOC Change (trailing year): <span className="text-green-600 dark:text-green-400 font-medium">+{trailingYearLinesAdded.toLocaleString()}</span> / <span className="text-red-600 dark:text-red-400 font-medium">-{trailingYearLinesRemoved.toLocaleString()}</span>. </span>
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
    </div>
  );
};

export default GitHubActivity;
