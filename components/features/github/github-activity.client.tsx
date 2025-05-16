/**
 * components/features/github/github-activity.tsx
 *
 * This component displays a graph of the user's GitHub activity.
 * It fetches data from the GitHub API and caches it for 24 hours.
 *
 */

'use client';

import React, { useState, useEffect, useRef } from 'react';
import type { ContributionDay, UserActivityView } from '@/types/github';
import { RefreshCw, Code } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

// GitHub profile URL
const GITHUB_PROFILE_URL = "https://github.com/williamagh/";

// Function to map contribution level to Tailwind CSS background color
const getLevelColor = (level: number): string => {
  switch (level) {
    case 0: return 'bg-gray-200 dark:bg-gray-800';
    case 1: return 'bg-green-200 dark:bg-green-900';
    case 2: return 'bg-green-400 dark:bg-green-700';
    case 3: return 'bg-green-600 dark:bg-green-500';
    case 4: return 'bg-green-800 dark:bg-green-300';
    default: return 'bg-gray-200 dark:bg-gray-800';
  }
};

const GitHubActivity = () => {
  const [activityData, setActivityData] = useState<ContributionDay[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [totalContributions, setTotalContributions] = useState<number | null>(null);
  const [linesAdded, setLinesAdded] = useState<number | null>(null);
  const [linesRemoved, setLinesRemoved] = useState<number | null>(null);
  const [dataComplete, setDataComplete] = useState<boolean>(true);
  const [lastRefreshed, setLastRefreshed] = useState<string | null>(null);

  const fetchInitiatedRef = useRef(false);

  const navigateToGitHub = () => {
    window.open(GITHUB_PROFILE_URL, '_blank', 'noopener,noreferrer');
  };

  const fetchData = async (refresh = false) => {
    setIsLoading(true);
    setError(null);

    try {
      if (refresh) {
        setIsRefreshing(true);
        console.log('[Client] Requesting GitHub data refresh via POST /api/github-activity/refresh.');
        const refreshResponse = await fetch('/api/github-activity/refresh', {
          method: 'POST',
        });
        if (!refreshResponse.ok) {
          let refreshErrorResult;
          try {
            refreshErrorResult = await refreshResponse.json();
          } catch (e) { /* ignore */ }
          const errorMessage = refreshErrorResult?.message || refreshErrorResult?.error || `Refresh request failed with status: ${refreshResponse.status}`;
          console.error('[Client] GitHub data refresh POST request failed:', errorMessage);
          setError(errorMessage);
          // Continue to fetch existing data even if refresh POST fails
        } else {
          console.log('[Client] GitHub data refresh POST request successful.');
        }
      }

      console.log(`[Client] Fetching GitHub data from GET /api/github-activity (${refresh ? 'after potential refresh' : 'initial load'}).`);
      const response = await fetch('/api/github-activity');
      let result: UserActivityView;

      try {
        result = await response.json() as UserActivityView;
      } catch (parseError) {
        const errorMessage = `Failed to parse API response from GET /api/github-activity: ${parseError instanceof Error ? parseError.message : 'Unknown parse error'}`;
        console.error(errorMessage);
        setError(errorMessage);
        setActivityData([]);
        setTotalContributions(null);
        setLinesAdded(null);
        setLinesRemoved(null);
        setDataComplete(false);
        setLastRefreshed(null);
        return;
      }

      if (!response.ok) {
        const errorMsg = result?.error || `API request failed with status: ${response.status}`;
        console.error('GitHub Activity GET API returned an error:', errorMsg);
        setError(errorMsg);
        setActivityData([]);
        setTotalContributions(null);
        setLinesAdded(null);
        setLinesRemoved(null);
        setDataComplete(result?.trailingYearData?.dataComplete ?? false);
        setLastRefreshed(result?.lastRefreshed || null);
        return;
      }

      if (result && result.trailingYearData) {
        setActivityData(result.trailingYearData.data || []);
        setTotalContributions(result.trailingYearData.totalContributions || 0);
        setDataComplete(result.trailingYearData.dataComplete !== undefined ? result.trailingYearData.dataComplete : true);
        setLastRefreshed(result.lastRefreshed || null);

        if (result.allTimeStats) {
          setLinesAdded(result.allTimeStats.linesAdded || 0);
          setLinesRemoved(result.allTimeStats.linesRemoved || 0);
          console.log('[Client] All-time stats received:', result.allTimeStats);
        } else {
          console.warn('[Client] All-time stats (result.allTimeStats) is missing in API response.');
          setLinesAdded(null);
          setLinesRemoved(null);
        }

        console.log('[Client] Trailing year activity data received:', result.trailingYearData);
        if (result.lastRefreshed) {
          console.log('[Client] Data last refreshed:', result.lastRefreshed);
        }
      } else {
        console.warn('[Client] GitHub activity data is missing or invalid in API response.');
        setError('Received invalid or incomplete data from the server.');
        setActivityData([]);
        setTotalContributions(null);
        setLinesAdded(null);
        setLinesRemoved(null);
        setDataComplete(false);
        setLastRefreshed(null);
      }
    } catch (err) {
      console.error('Failed to fetch or parse GitHub activity:', err);
      setError(err instanceof Error ? err.message : 'An unknown error occurred while fetching data.');
      setActivityData([]);
      setTotalContributions(null);
      setLinesAdded(null);
      setLinesRemoved(null);
      setDataComplete(false);
      setLastRefreshed(null);
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
    console.log('[Client] Force cache button clicked, triggering a refresh.');
    void fetchData(true);
  };

  useEffect(() => {
    if (fetchInitiatedRef.current) return;
    fetchInitiatedRef.current = true;
    void fetchData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="bg-white dark:bg-neutral-900 p-4 rounded-lg shadow-card cursor-pointer hover:shadow-card-hover transition-shadow" onClick={navigateToGitHub}>
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 flex items-center">
          <Code size={20} className="mr-2 text-blue-500" /> GitHub Activity
        </h3>
        <div className="flex space-x-2">
          {!dataComplete && !isRefreshing && (
            <button
              onClick={handleForceCache}
              className="p-1.5 rounded-full bg-yellow-100 hover:bg-yellow-200 dark:bg-yellow-900/30 dark:hover:bg-yellow-900/50 transition-colors text-yellow-600 dark:text-yellow-500"
              title="Data incomplete. Click to attempt refresh."
              aria-label="Refresh incomplete data"
            >
              <RefreshCw size={16} />
            </button>
          )}
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="p-1.5 rounded-full bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 transition-colors"
            title="Refresh GitHub data"
            aria-label="Refresh GitHub data"
          >
            <RefreshCw
              size={16}
              className={`${isRefreshing ? 'animate-spin text-blue-500' : 'text-gray-500'}`}
            />
          </button>
        </div>
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
          <p>Please try refreshing. If the problem persists, the data source might be temporarily unavailable.</p>
        </div>
      )}

      {!isLoading && !error && (
        <>
          <ActivityCalendar data={activityData} dataComplete={dataComplete} />
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-2">
            {totalContributions !== null && (
              <span>Total contributions (trailing year): {totalContributions}. </span>
            )}
            {linesAdded !== null && linesRemoved !== null && (
              <span>LOC Change (all-time): <span className="text-green-600 dark:text-green-400">+{linesAdded}</span> / <span className="text-red-600 dark:text-red-400">-{linesRemoved}</span>. </span>
            )}
            {lastRefreshed && (
                <span title={`Data last updated: ${new Date(lastRefreshed).toLocaleString()}`}>
                    Last updated: {formatDistanceToNow(new Date(lastRefreshed), { addSuffix: true })}.
                </span>
            )}
          </div>
        </>
      )}
    </div>
  );
};

interface ActivityCalendarProps {
  data: ContributionDay[];
  dataComplete: boolean;
}

const ActivityCalendar: React.FC<ActivityCalendarProps> = ({ data, dataComplete }) => {
  if (!data || data.length === 0) {
    return <div className="text-center text-gray-500 dark:text-gray-400 py-8">No activity data available.</div>;
  }

  return (
    <div className="grid grid-cols-contribution-calendar gap-1 overflow-x-auto pb-2 relative">
      {data.map((day, index) => (
        <div
          key={index}
          className={`w-3 h-3 rounded-sm ${getLevelColor(day.level)}`}
          title={`Date: ${day.date}\nCount: ${day.count}`}
        />
      ))}
      {!dataComplete && (
        <div className="absolute inset-0 bg-white/70 dark:bg-black/70 flex items-center justify-center backdrop-blur-sm">
          <p className="text-xs text-yellow-700 dark:text-yellow-400 font-semibold p-2 bg-yellow-100 dark:bg-yellow-900/50 rounded">
            Data may be incomplete. Refresh for latest.
          </p>
        </div>
      )}
    </div>
  );
};

export default GitHubActivity;
