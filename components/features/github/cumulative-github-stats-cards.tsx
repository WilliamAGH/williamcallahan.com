/**
 * @fileoverview Cumulative GitHub statistics cards component for displaying aggregated GitHub activity.
 * Shows total contributions, lines added/removed, and net lines of code in a responsive card grid layout.
 * @version 1.0.0
 */

"use client";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Code, GitBranch, GitCommit, GitPullRequest } from "lucide-react";
import type React from "react";

import type { CumulativeGitHubStatsCardsProps } from "@/types";

/**
 * Displays cumulative GitHub statistics in a responsive card grid layout.
 * Each statistic is presented in its own card with an icon, value, and description.
 *
 * @component
 * @param {CumulativeGitHubStatsCardsProps} props - The component props
 * @param {GitHubStats} props.stats - GitHub statistics data containing contributions and code metrics
 * @param {string} [props.className] - Optional additional CSS classes for styling
 * @returns {React.JSX.Element} Responsive grid of GitHub statistics cards
 *
 * @example
 * ```tsx
 * <CumulativeGitHubStatsCards
 *   stats={{
 *     totalContributions: 1250,
 *     linesAdded: 50000,
 *     linesRemoved: 15000,
 *     netLinesOfCode: 35000
 *   }}
 *   className="my-6"
 * />
 * ```
 */
const CumulativeGitHubStatsCards: React.FC<CumulativeGitHubStatsCardsProps> = ({ stats, className }) => {
  const statCards = [
    {
      title: "Total Contributions",
      value: stats.totalContributions.toLocaleString(),
      icon: <GitCommit className="h-5 w-5 text-primary" />,
      description: "All-time contributions to repositories",
    },
    {
      title: "Lines Added",
      value: stats.linesAdded.toLocaleString(),
      icon: <GitPullRequest className="h-5 w-5 text-emerald-500" />,
      description: "Total lines of code added",
    },
    {
      title: "Lines Removed",
      value: stats.linesRemoved.toLocaleString(),
      icon: <GitBranch className="h-5 w-5 text-rose-500" />,
      description: "Total lines of code removed",
    },
    {
      title: "Net Lines of Code",
      value: stats.netLinesOfCode.toLocaleString(),
      icon: <Code className="h-5 w-5 text-blue-500" />,
      description: "Net contribution to codebase",
    },
  ];

  return (
    <div className={cn("w-full py-4 sm:py-6", className)}>
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {statCards.map(card => (
          <Card
            key={card.title}
            className="p-4 sm:p-6 border border-border bg-background hover:shadow-md transition-shadow"
          >
            <div className="flex flex-col space-y-1 sm:space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-xs sm:text-sm font-medium text-muted-foreground truncate pr-1">{card.title}</h3>
                <div className="flex-shrink-0">{card.icon}</div>
              </div>
              <p className="text-xl sm:text-3xl font-bold">{card.value}</p>
              <p className="text-xs text-muted-foreground hidden sm:block">{card.description}</p>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default CumulativeGitHubStatsCards;
