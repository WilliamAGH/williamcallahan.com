/**
 * GitHub contribution processing helpers
 * @module data-access/github-contributions
 */

/** Maximum contribution level on GitHub's 5-point scale (0-4) */
const MAX_CONTRIBUTION_LEVEL = 4;

import { isDateInRange } from "@/lib/utils/date-format";
import type { GraphQLContributionDay, GraphQLContributionCalendar } from "@/types/github";
import type { ContributionDay } from "@/types/schemas/github-storage";
import { fetchContributionCalendar, fetchContributionYears } from "./github-api";

// Contribution level mapping
const CONTRIBUTION_LEVELS: Record<string, 0 | 1 | 2 | 3 | 4> = {
  NONE: 0,
  FIRST_QUARTILE: 1,
  SECOND_QUARTILE: 2,
  THIRD_QUARTILE: 3,
  FOURTH_QUARTILE: 4,
};

/**
 * Map GraphQL contribution level to numeric value
 */
export function mapGraphQLContributionLevelToNumeric(
  graphQLLevel: GraphQLContributionDay["contributionLevel"],
): 0 | 1 | 2 | 3 | 4 {
  return CONTRIBUTION_LEVELS[graphQLLevel] ?? 0;
}

/**
 * Convert GraphQL contribution calendar to flat array
 */
export function flattenContributionCalendar(
  calendar: GraphQLContributionCalendar,
): ContributionDay[] {
  const contributions: ContributionDay[] = [];

  for (const week of calendar.weeks) {
    for (const day of week.contributionDays) {
      contributions.push({
        date: day.date,
        count: day.contributionCount,
        level: mapGraphQLContributionLevelToNumeric(day.contributionLevel),
      });
    }
  }

  return contributions;
}

/**
 * Validate contribution data
 */
export function validateContributionData(data: ContributionDay[]): boolean {
  if (!Array.isArray(data) || data.length === 0) {
    return false;
  }

  return data.every(
    (day) =>
      typeof day.date === "string" &&
      typeof day.count === "number" &&
      typeof day.level === "number" &&
      day.level >= 0 &&
      day.level <= MAX_CONTRIBUTION_LEVEL,
  );
}

/**
 * Calculate summary stats for contribution data
 */
export function calculateContributionSummary(
  contributions: ContributionDay[],
  startDate?: Date,
  endDate?: Date,
): {
  totalContributions: number;
  averagePerDay: number;
  maxStreak: number;
  currentStreak: number;
} {
  let totalContributions = 0;
  let maxStreak = 0;
  let currentStreak = 0;
  let daysWithContributions = 0;

  const filteredContributions =
    startDate && endDate
      ? contributions.filter((day) => {
          const date = new Date(day.date);
          return isDateInRange(date, startDate, endDate);
        })
      : contributions;

  for (const day of filteredContributions) {
    totalContributions += day.count;

    if (day.count > 0) {
      daysWithContributions++;
      currentStreak++;
      maxStreak = Math.max(maxStreak, currentStreak);
    } else {
      currentStreak = 0;
    }
  }

  const totalDays = filteredContributions.length || 1;
  const averagePerDay = totalContributions / totalDays;

  // Mark as intentionally unused - variable exists for potential future use
  void daysWithContributions;

  return {
    totalContributions,
    averagePerDay,
    maxStreak,
    currentStreak,
  };
}

/**
 * Fetch and flatten trailing-year contribution calendar via GraphQL
 */
export async function fetchTrailingYearContributionCalendar({
  githubRepoOwner,
  fromDate,
  toDate,
}: {
  githubRepoOwner: string;
  fromDate: Date;
  toDate: Date;
}): Promise<{ totalContributions: number; contributionDays: ContributionDay[] }> {
  const response = await fetchContributionCalendar(
    githubRepoOwner,
    fromDate.toISOString(),
    toDate.toISOString(),
  );
  if (!response.user)
    throw new Error(`GitHub contribution calendar unavailable for ${githubRepoOwner}`);
  const calendar = response.user.contributionsCollection.contributionCalendar;
  return {
    totalContributions: calendar.totalContributions,
    contributionDays: flattenContributionCalendar(calendar).toSorted((a, b) =>
      a.date.localeCompare(b.date),
    ),
  };
}

/** GitHub limits collections to one year; sum disjoint UTC years before the calendar cutoff. */
export async function fetchHistoricalContributionTotal(
  username: string,
  before: Date,
): Promise<number> {
  const years = await fetchContributionYears(username);
  const historicalEnd = before.getTime() - 1;
  let total = 0;
  for (const year of new Set(years)) {
    const start = Date.UTC(year, 0, 1);
    if (start > historicalEnd) continue;
    const end = Math.min(Date.UTC(year + 1, 0, 1) - 1, historicalEnd);
    const response = await fetchContributionCalendar(
      username,
      new Date(start).toISOString(),
      new Date(end).toISOString(),
    );
    if (!response.user) throw new Error(`GitHub historical calendar unavailable for ${username}`);
    total += response.user.contributionsCollection.contributionCalendar.totalContributions;
  }
  return total;
}
