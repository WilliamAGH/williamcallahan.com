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

const GitHubActivity = () => {
  const [activityData, setActivityData] = useState<ContributionDay[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalContributions, setTotalContributions] = useState<string | null>(null);

  // Function to navigate to GitHub profile
  const navigateToGitHub = () => {
    window.open(GITHUB_PROFILE_URL, '_blank', 'noopener,noreferrer');
  };

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await fetch('/api/github-activity');
        const result: GitHubActivityApiResponse = await response.json(); // Use imported type

        if (!response.ok || result.error) {
          throw new Error(result.error || `API request failed with status ${response.status}`);
        }

        if (result.data && Array.isArray(result.data)) {
          setActivityData(result.data);
          if (result.totalContributions) {
            setTotalContributions(result.totalContributions);
          }
        } else {
          // Handle cases where scraping might return empty data but no error
          console.warn('Received empty or invalid data structure from API:', result);
          setActivityData([]);
           if (result.totalContributions) {
            setTotalContributions(result.totalContributions);
          }
        }

      } catch (err) {
        console.error('Failed to fetch GitHub activity:', err);
        setError(err instanceof Error ? err.message : 'An unknown error occurred');
        setActivityData([]); // Clear data on error
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, []);

  const renderGraph = () => {
    if (isLoading) {
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
      <h2 className="text-2xl font-bold mb-4">
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
        className="border rounded-lg p-2 sm:p-4 bg-background overflow-hidden hover:border-blue-300 dark:hover:border-blue-700 transition-colors cursor-pointer"
        aria-label="View William Callahan's GitHub contribution activity"
        title="View William Callahan's GitHub profile"
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && navigateToGitHub()}
      >
        <div className="overflow-x-auto custom-scrollbar pb-2">
          {renderGraph()}
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
