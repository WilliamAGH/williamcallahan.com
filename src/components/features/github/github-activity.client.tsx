"use client";

import { userActivityViewSchema, type UserActivityView } from "@/types/schemas/github-storage";
import { formatDistanceToNow } from "date-fns";
import { Code } from "lucide-react";
import { useTheme } from "next-themes";
import { useCallback, useEffect, useRef, useState } from "react";
import ActivityCalendarComponent, {
  type Activity,
  type ThemeInput as ReactActivityCalendarThemeInput,
} from "react-activity-calendar";
import CumulativeGitHubStatsCards from "./cumulative-github-stats-cards";

const SM_BREAKPOINT = 640;

function toCalendarActivity(days: UserActivityView["trailingYearData"]["data"]): Activity[] {
  return days.map((day) => {
    if (day.level === undefined) {
      throw new Error("Validated GitHub contribution data is missing an activity level.");
    }
    return { date: day.date, count: day.count, level: day.level };
  });
}

async function readResponseJson(response: Response, request: string): Promise<unknown> {
  try {
    return await response.json();
  } catch (parseError: unknown) {
    const detail = parseError instanceof Error ? parseError.message : String(parseError);
    throw new Error(`Failed to parse the ${request} response: ${detail}`, { cause: parseError });
  }
}

const calendarCustomTheme: ReactActivityCalendarThemeInput = {
  light: ["#f1f5f9", "#cfe8ff", "#9fd6ff", "#60b0ff", "#3b82f6"],
  dark: ["#1e293b", "#27364d", "#304560", "#3b5a7a", "#60a5fa"],
};

const GitHubActivity = () => {
  const { resolvedTheme } = useTheme();
  const [activity, setActivity] = useState<UserActivityView | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fetchInitiatedRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const trailingYearData = activity?.trailingYearData;
  const allTimeStats = activity?.allTimeStats;
  const activityData = trailingYearData ? toCalendarActivity(trailingYearData.data) : [];
  const priorYearCommits = activity?.priorYearCommits;
  const lifetimeContributionTotal = allTimeStats?.totalContributions;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    setIsMobile(container.clientWidth < SM_BREAKPOINT);
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setIsMobile(entry.contentRect.width < SM_BREAKPOINT);
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [isLoading]);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/github-activity");
      const result = userActivityViewSchema.safeParse(
        await readResponseJson(response, "GitHub activity"),
      );
      if (!result.success) {
        const message = "The GitHub activity endpoint returned an invalid response.";
        console.error("[Client] GET /api/github-activity failed schema validation:", result.error);
        setActivity(null);
        setError(message);
        return;
      }

      setActivity(result.data);
      if (!response.ok) {
        const message = result.data.error;
        if (message === undefined) {
          const fallbackMessage = `API request failed with status: ${response.status}`;
          console.error("GitHub Activity GET API returned an error:", fallbackMessage);
          setError(fallbackMessage);
          return;
        }
        console.error("GitHub Activity GET API returned an error:", message);
        setError(message);
      }
    } catch (fetchError: unknown) {
      console.error("Failed to fetch or parse GitHub activity:", fetchError);
      setActivity(null);
      setError(
        fetchError instanceof Error
          ? fetchError.message
          : "An unknown error occurred while fetching data.",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (fetchInitiatedRef.current) return;
    fetchInitiatedRef.current = true;
    void fetchData();
  }, [fetchData]);

  const hasActivityCalendar = activityData.length > 0;
  const lastRefreshed = activity?.lastRefreshed;

  return (
    <div className="bg-white dark:bg-neutral-900 p-3 sm:p-4 rounded-lg shadow-card hover:shadow-card-hover transition-all duration-300 transform sm:hover:-translate-y-1 group text-left w-full">
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-base sm:text-lg font-semibold text-gray-800 dark:text-gray-200 flex items-center group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
          <a
            href="https://github.com/WilliamAGH/"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 hover:underline"
          >
            <Code size={20} className="text-blue-500 group-hover:scale-110 transition-transform" />
            GitHub Activity
          </a>
        </h3>
      </div>

      {isLoading && (
        <div className="flex flex-col justify-center items-center h-48">
          <div className="flex items-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
            <p className="ml-3 text-gray-600 dark:text-gray-400">Loading activity data...</p>
          </div>
        </div>
      )}

      {error && !isLoading && (
        <div className="text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-900/20 p-3 rounded-md">
          <p className="font-medium">Error fetching GitHub activity:</p>
          <p className="text-sm">{error}</p>
        </div>
      )}

      {!isLoading && !error && (
        <>
          {!hasActivityCalendar ? (
            <div className="text-center py-10 text-gray-500 dark:text-gray-400">
              <p>
                {trailingYearData?.totalContributions
                  ? "Contribution calendar data is unavailable."
                  : "No contribution activity found for the trailing year."}
              </p>
            </div>
          ) : (
            <div
              ref={containerRef}
              className={`mt-4 mb-2 p-2 w-full ${isMobile ? "overflow-x-auto -mx-2 px-2" : ""}`}
            >
              <ActivityCalendarComponent
                data={activityData}
                theme={calendarCustomTheme}
                colorScheme={resolvedTheme === "dark" ? "dark" : "light"}
                blockSize={isMobile ? 10 : 12}
                blockMargin={2}
                blockRadius={isMobile ? 2 : 0}
                fontSize={isMobile ? 11 : 14}
                hideTotalCount
                showWeekdayLabels={!isMobile}
              />
            </div>
          )}

          {trailingYearData && (
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-2 space-y-1 sm:space-y-0">
              <span>
                Total contributions (trailing year):{" "}
                <span className="font-medium">
                  {trailingYearData.totalContributions.toLocaleString()}
                </span>
                .{" "}
              </span>
              {trailingYearData.linesAdded !== undefined &&
                trailingYearData.linesRemoved !== undefined && (
                  <span>
                    LOC Change:{" "}
                    <span className="text-green-600 dark:text-green-400 font-medium">
                      +{trailingYearData.linesAdded.toLocaleString()}
                    </span>{" "}
                    /{" "}
                    <span className="text-red-600 dark:text-red-400 font-medium">
                      -{trailingYearData.linesRemoved.toLocaleString()}
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
          )}

          {lifetimeContributionTotal !== undefined && lifetimeContributionTotal > 0 && (
            <div className="mt-2 text-xs text-gray-600 dark:text-gray-300">
              Lifetime contributions:{" "}
              <span className="font-semibold">{lifetimeContributionTotal.toLocaleString()}</span>
              {priorYearCommits && trailingYearData && (
                <span className="text-gray-500 dark:text-gray-400">
                  {" "}
                  (Prior years: {priorYearCommits.totalCommits.toLocaleString()} + Trailing year:{" "}
                  {trailingYearData.totalContributions.toLocaleString()})
                </span>
              )}
            </div>
          )}

          {allTimeStats && (
            <div className="mt-6">
              <CumulativeGitHubStatsCards
                stats={{
                  totalContributions: allTimeStats.totalContributions,
                  linesAdded: allTimeStats.linesAdded,
                  linesRemoved: allTimeStats.linesRemoved,
                  netLinesOfCode: allTimeStats.linesAdded - allTimeStats.linesRemoved,
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
