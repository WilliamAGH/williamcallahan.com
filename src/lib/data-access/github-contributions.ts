/**
 * GitHub contribution processing helpers
 * @module data-access/github-contributions
 */

import { isDateInRange } from "@/lib/utils/date-format";
import type {
  ContributionDay,
  GraphQLContributionDay,
  GraphQLContributionCalendar,
} from "@/types/github";

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
      day.level <= 4,
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
