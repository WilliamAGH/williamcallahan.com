/**
 * components/features/github/github-activity.tsx
 *
 * This component displays a graph of the user's GitHub activity.
 * It fetches data from the GitHub API and caches it for 24 hours.
 *
 */

'use client';

import React, { useState, useEffect } from 'react';
import type { ContributionDay, GitHubActivityApiResponse } from '@/types/github'; // Import types
import { RefreshCw, Plus, Minus, Code } from 'lucide-react'; // Import icons

// GitHub profile URL
const GITHUB_PROFILE_URL = "https://github.com/williamagh/";

// Function to map contribution level to Tailwind CSS background color
const getLevelColor = (level: number): string => {
  switch (level) {
    case 0: return 'bg-gray-100 dark:bg-gray-800'; // No contributions
    case 1: return 'bg-green-200 dark:bg-green-900'; // Low contributions
    case 2: return 'bg-green-400 dark:bg-green-700'; // Medium contributions
    case 3: return 'bg-green-600 dark:bg-green-500'; // High contributions
    case 4: return 'bg-green-800 dark:bg-green-300'; // Very high contributions
    default: return 'bg-gray-100 dark:bg-gray-800';
  }
};

// Component to display lines of code metrics
const CodeMetrics: React.FC<{
  linesAdded: number | null;
  linesRemoved: number | null;
  isLoading: boolean;
  dataComplete: boolean;
}> = ({ linesAdded, linesRemoved, isLoading, dataComplete }) => {
  if (isLoading || linesAdded === null || linesRemoved === null) {
    return null;
  }

  // Calculate percentages for visualization
  const total = Math.max(linesAdded + linesRemoved, 1); // Avoid division by zero
  const addedPercent = (linesAdded / total) * 100;
  const removedPercent = (linesRemoved / total) * 100;

  return (
    <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
      <div className="flex items-center mb-2">
        <Code size={18} className="text-blue-500 mr-2" />
        <h3 className="text-base font-semibold">Code Impact</h3>
        {!dataComplete && (
          <div className="ml-auto flex items-center text-yellow-600 dark:text-yellow-500 text-xs font-medium">
            <RefreshCw size={12} className="mr-1" />
            Partial data
          </div>
        )}
      </div>

      <div className="flex flex-col space-y-3">
        {/* Visual bar representation */}
        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden flex">
          <div
            className="bg-gradient-to-r from-green-400 to-green-600 dark:from-green-600 dark:to-green-400 h-full transition-all duration-1000 ease-out"
            style={{ width: `${addedPercent}%` }}
          />
          <div
            className="bg-gradient-to-r from-red-400 to-red-600 dark:from-red-600 dark:to-red-400 h-full transition-all duration-1000 ease-out"
            style={{ width: `${removedPercent}%` }}
          />
        </div>

        {/* Metrics with animations */}
        <div className="grid grid-cols-2 gap-4">
          <div className="p-3 bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 group hover:border-green-300 dark:hover:border-green-700 transition-colors">
            <div className="flex items-center text-green-600 dark:text-green-400 mb-1">
              <Plus size={16} className="mr-1 group-hover:animate-bounce" />
              <span className="text-xs uppercase font-medium">Added</span>
            </div>
            <div className="flex items-baseline">
              <span className="text-xl font-bold group-hover:text-green-600 dark:group-hover:text-green-400 transition-colors">
                {linesAdded.toLocaleString()}
              </span>
              <span className="ml-1 text-xs text-gray-500 dark:text-gray-400">lines</span>
            </div>
          </div>

          <div className="p-3 bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 group hover:border-red-300 dark:hover:border-red-700 transition-colors">
            <div className="flex items-center text-red-600 dark:text-red-400 mb-1">
              <Minus size={16} className="mr-1 group-hover:animate-bounce" />
              <span className="text-xs uppercase font-medium">Removed</span>
            </div>
            <div className="flex items-baseline">
              <span className="text-xl font-bold group-hover:text-red-600 dark:group-hover:text-red-400 transition-colors">
                {linesRemoved.toLocaleString()}
              </span>
              <span className="ml-1 text-xs text-gray-500 dark:text-gray-400">lines</span>
            </div>
          </div>
        </div>

        {/* Net change */}
        <div className="flex justify-center items-center py-2">
          <span className="text-xs text-gray-500 dark:text-gray-400">Net change: </span>
          <span className={`ml-1 text-sm font-medium ${linesAdded > linesRemoved ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
            {linesAdded > linesRemoved ? '+' : ''}{(linesAdded - linesRemoved).toLocaleString()} lines
          </span>
        </div>

        {!dataComplete && (
          <div className="text-xs text-center text-yellow-600 dark:text-yellow-500 mt-2 italic">
            Some repositories are still being processed. Refresh later for complete data.
          </div>
        )}
      </div>
    </div>
  );
};

const GitHubActivity = () => {
  const [activityData, setActivityData] = useState<ContributionDay[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [totalContributions, setTotalContributions] = useState<string | null>(null);
  const [linesAdded, setLinesAdded] = useState<number | null>(null);
  const [linesRemoved, setLinesRemoved] = useState<number | null>(null);
  const [dataComplete, setDataComplete] = useState<boolean>(true);

  // Function to navigate to GitHub profile
  const navigateToGitHub = () => {
    window.open(GITHUB_PROFILE_URL, '_blank', 'noopener,noreferrer');
  };

  // Function to fetch data with optional refresh parameter
  const fetchData = async (refresh = false, forceCache = false) => {
    setIsLoading(true);
    setError(null);
    if (refresh) {
      setIsRefreshing(true);
    }

    try {
      let url = '/api/github-activity';
      if (refresh) url += '?refresh=true';
      if (forceCache) url += (refresh ? '&' : '?') + 'force-cache=true';

      const response = await fetch(url);
      const result: GitHubActivityApiResponse = await response.json();

      if (!response.ok || result.error) {
        throw new Error(result.error || `API request failed with status ${response.status}`);
      }

      if (result.data && Array.isArray(result.data)) {
        setActivityData(result.data);
        if (result.totalContributions) {
          setTotalContributions(result.totalContributions);
        }
        if (typeof result.linesAdded === 'number') {
          setLinesAdded(result.linesAdded);
        }
        if (typeof result.linesRemoved === 'number') {
          setLinesRemoved(result.linesRemoved);
        }
        setDataComplete(result.dataComplete !== false); // Treat undefined as true for backward compatibility
      } else {
        // Handle cases where scraping might return empty data but no error
        console.warn('Received empty or invalid data structure from API:', result);
        setActivityData([]);
        if (result.totalContributions) {
          setTotalContributions(result.totalContributions);
        }
        if (typeof result.linesAdded === 'number') {
          setLinesAdded(result.linesAdded);
        }
        if (typeof result.linesRemoved === 'number') {
          setLinesRemoved(result.linesRemoved);
        }
        setDataComplete(result.dataComplete !== false);
      }

    } catch (err) {
      console.error('Failed to fetch GitHub activity:', err);
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
      setActivityData([]); // Clear data on error
      setDataComplete(true); // Reset data completeness on error
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  // Handle refresh button click
  const handleRefresh = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent navigation to GitHub
    fetchData(true);
  };

  // Handle force cache button click
  const handleForceCache = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent navigation to GitHub
    fetchData(true, true);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const renderGraph = () => {
    if (isLoading && !isRefreshing) {
      return (
        <div
          onClick={navigateToGitHub}
          className="block text-center text-muted-foreground hover:text-blue-500 transition-colors cursor-pointer"
          aria-label="View William Callahan's GitHub profile"
          title="View William Callahan's GitHub profile"
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && navigateToGitHub()}
        >
          Loading activity...
        </div>
      );
    }
    if (error) {
      return (
        <div
          onClick={navigateToGitHub}
          className="block text-center text-red-500 hover:text-red-400 transition-colors cursor-pointer"
          aria-label="View William Callahan's GitHub profile"
          title="View William Callahan's GitHub profile"
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && navigateToGitHub()}
        >
          Error loading activity: {error}
        </div>
      );
    }
    if (activityData.length === 0) {
      // Display total contributions if available, even if graph data is missing
      const totalText = totalContributions ? ` (${parseInt(totalContributions).toLocaleString()} total contributions found)` : '';
      return (
        <div
          onClick={navigateToGitHub}
          className="block text-center text-muted-foreground hover:text-blue-500 transition-colors cursor-pointer"
          aria-label="View William Callahan's GitHub profile"
          title="View William Callahan's GitHub profile"
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && navigateToGitHub()}
        >
          Could not load contribution graph data.{totalText}
        </div>
      );
    }

    // Basic grid rendering - assumes data is roughly chronological
    // A more sophisticated approach would parse dates and arrange into a proper calendar grid
    const gridCols = Math.ceil(Math.sqrt(activityData.length)); // Simple square grid layout

    return (
      <div className="grid grid-flow-col grid-rows-7 gap-1 p-2 overflow-x-auto custom-scrollbar">
        {activityData.map((day) => (
          <div
            key={day.date}
            className={`w-3 h-3 rounded-sm ${getLevelColor(day.level)}`}
            title={`${day.count} contributions on ${day.date}`}
          />
        ))}
      </div>
    );
  };

  return (
    <div className="mt-8">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-bold">
          <a
            href="https://github.com/williamagh/"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-blue-500 transition-colors"
            aria-label="View William Callahan's GitHub profile"
          >
            GitHub Activity
          </a>
        </h2>
        <div className="flex space-x-2">
          {!dataComplete && !isRefreshing && (
            <button
              onClick={handleForceCache}
              className="p-1.5 rounded-full bg-yellow-100 hover:bg-yellow-200 dark:bg-yellow-900/30 dark:hover:bg-yellow-900/50 transition-colors text-yellow-600 dark:text-yellow-500"
              title="Force cache incomplete data"
              aria-label="Force cache incomplete data"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 9V7.8c0-1.68 0-2.52-.327-3.162a3 3 0 0 0-1.311-1.311C16.72 3 15.88 3 14.2 3H9.8c-1.68 0-2.52 0-3.162.327a3 3 0 0 0-1.311 1.311C5 5.28 5 6.12 5 7.8V16.2c0 1.68 0 2.52.327 3.162a3 3 0 0 0 1.311 1.311C7.28 21 8.12 21 9.8 21H16"></path>
                <path d="M9 13h6"></path>
                <path d="M12 10v6"></path>
                <path d="M16 19h6"></path>
              </svg>
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
      <p className="text-muted-foreground mb-4">
        Visualizing my recent coding activity, projects, and experiments from{' '}
        <a
          href="https://github.com/williamagh/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300"
          aria-label="View William Callahan's GitHub profile"
          title="View William Callahan's GitHub profile"
        >
          GitHub
        </a>.
      </p>
      <div
        onClick={navigateToGitHub}
        className={`border rounded-lg bg-background overflow-hidden hover:border-blue-300 dark:hover:border-blue-700 transition-colors cursor-pointer ${isRefreshing ? 'opacity-70' : ''}`}
        aria-label="View William Callahan's GitHub contribution activity"
        title="View William Callahan's GitHub profile"
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && navigateToGitHub()}
      >
        <div className="p-2 sm:p-4">
          {!dataComplete && !isRefreshing && (
            <div className="mb-3 px-3 py-2 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-900/50 rounded-md text-sm text-yellow-700 dark:text-yellow-400">
              <div className="flex items-center">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2">
                  <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"></path>
                  <path d="M12 9v4"></path>
                  <path d="M12 17h.01"></path>
                </svg>
                <span>
                  Some repository statistics are still computing. Data shown may be incomplete.
                </span>
              </div>
              <div className="mt-1.5 flex gap-3 text-xs">
                <button
                  onClick={(e) => { e.stopPropagation(); handleRefresh(e); }}
                  className="flex items-center hover:text-yellow-800 dark:hover:text-yellow-300 transition-colors"
                >
                  <RefreshCw size={12} className="mr-1" />
                  Try again
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); handleForceCache(e); }}
                  className="flex items-center hover:text-yellow-800 dark:hover:text-yellow-300 transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1">
                    <path d="M19 9V7.8c0-1.68 0-2.52-.327-3.162a3 3 0 0 0-1.311-1.311C16.72 3 15.88 3 14.2 3H9.8c-1.68 0-2.52 0-3.162.327a3 3 0 0 0-1.311 1.311C5 5.28 5 6.12 5 7.8V16.2c0 1.68 0 2.52.327 3.162a3 3 0 0 0 1.311 1.311C7.28 21 8.12 21 9.8 21H16"></path>
                    <path d="M9 13h6"></path>
                    <path d="M12 10v6"></path>
                    <path d="M16 19h6"></path>
                  </svg>
                  Force cache this data
                </button>
              </div>
            </div>
          )}

          <div className="overflow-x-auto custom-scrollbar pb-2">
            {isRefreshing ? (
              <div className="flex justify-center items-center py-10">
                <RefreshCw size={24} className="animate-spin text-blue-500" />
                <span className="ml-2 text-muted-foreground">Refreshing data...</span>
              </div>
            ) : (
              renderGraph()
            )}
          </div>

          {/* Add the code metrics component */}
          <CodeMetrics
            linesAdded={linesAdded}
            linesRemoved={linesRemoved}
            isLoading={isLoading || isRefreshing}
            dataComplete={dataComplete}
          />
        </div>
      </div>
      <p className="text-xs text-muted-foreground mt-2 text-right">
        <a
          href="https://github.com/williamagh/"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-blue-500 transition-colors"
          aria-label="View William Callahan's GitHub contribution history"
          title="View William Callahan's GitHub profile"
        >
          Last 365 days through {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
          {totalContributions && !isLoading && !error && activityData.length > 0 && (
            <span className="ml-1">• {parseInt(totalContributions).toLocaleString()} total contributions</span>
          )}
        </a>
      </p>
    </div>
  );
};

export default GitHubActivity;
