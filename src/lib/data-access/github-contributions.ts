/**
 * GitHub contribution processing helpers
 * @module data-access/github-contributions
 */

import { isDateInRange } from "@/lib/utils/date-format";
import { createCategorizedError } from "@/lib/utils/error-utils";
import type {
  ContributionDay,
  GraphQLContributionDay,
  GraphQLContributionCalendar,
} from "@/types/github";
import { fetchContributionCalendar } from "./github-api";

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
  let totalContributions = 0;
  const contributionDays: ContributionDay[] = [];

  try {
    console.log(
      `[DataAccess/GitHub] Fetching contribution calendar for ${githubRepoOwner} via GraphQL API...`,
    );

    const gqlResponse = await fetchContributionCalendar(
      githubRepoOwner,
      fromDate.toISOString(),
      toDate.toISOString(),
    );

    if (gqlResponse?.user?.contributionsCollection?.contributionCalendar) {
      const calendar = gqlResponse.user.contributionsCollection.contributionCalendar;
      totalContributions = calendar.totalContributions;

      contributionDays.push(...flattenContributionCalendar(calendar));
      contributionDays.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      console.log(
        `[DataAccess/GitHub] Successfully fetched contribution calendar. Total contributions (trailing year): ${totalContributions}`,
      );
    } else {
      console.warn(
        "[DataAccess/GitHub] Failed to fetch or parse GraphQL contribution calendar. Calendar data will be empty.",
      );
    }
  } catch (gqlError: unknown) {
    const categorizedError = createCategorizedError(gqlError, "github");
    console.error(
      "[DataAccess/GitHub] CRITICAL: Error fetching GraphQL contribution calendar:",
      categorizedError.message,
    );
  }

  return { totalContributions, contributionDays };
}
