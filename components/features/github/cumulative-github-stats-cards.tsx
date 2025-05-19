"use client";

import React from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { GitBranch, GitCommit, GitPullRequest, Code } from "lucide-react";

interface GitHubStats {
  totalContributions: number;
  linesAdded: number;
  linesRemoved: number;
  netLinesOfCode: number;
}

interface CumulativeGitHubStatsCardsProps {
  stats: GitHubStats;
  className?: string;
}

const CumulativeGitHubStatsCards: React.FC<CumulativeGitHubStatsCardsProps> = ({
  stats,
  className,
}) => {
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
    <div className={cn("w-full py-6", className)}>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card, index) => (
          <Card
            key={index}
            className="p-6 border border-border bg-background hover:shadow-md transition-shadow"
          >
            <div className="flex flex-col space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-muted-foreground">
                  {card.title}
                </h3>
                {card.icon}
              </div>
              <p className="text-3xl font-bold">{card.value}</p>
              <p className="text-xs text-muted-foreground">
                {card.description}
              </p>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default CumulativeGitHubStatsCards;