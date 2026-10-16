"use client";

/**
 * Modern AI Analysis Component
 * @module components/features/ai-analysis/modern-ai-analysis.client
 * @description
 * A clean, modern, non-cliche presentation for AI analysis.
 * Replaces the terminal aesthetic with a refined, editorial card style.
 */

import { Sparkles, CheckCircle2, Layers, Hash } from "lucide-react";
import type {
  AnalysisSectionProps,
  TerminalListItemProps,
  TechDetailProps,
} from "@/types/ai-analysis";

// Reusable UI components for consistent styling across split views
export const ModernAnalysisCard = ({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) => (
  <div
    className={`bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden ${className}`}
  >
    {children}
  </div>
);

export const modernHelpers = {
  AnalysisSection: ({ children, label }: AnalysisSectionProps) => (
    <div className="mb-6 last:mb-0">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-3 flex items-center gap-2">
        {label === "Summary" && <Sparkles className="w-3.5 h-3.5 text-amber-500" />}
        {label === "Highlights" && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />}
        {label === "Details" && <Layers className="w-3.5 h-3.5 text-blue-500" />}
        {label === "Related" && <Hash className="w-3.5 h-3.5 text-violet-500" />}
        {label}
      </h3>
      <div className="text-gray-700 dark:text-gray-300 leading-relaxed">{children}</div>
    </div>
  ),
  TerminalListItem: ({ children }: TerminalListItemProps) => (
    <div className="flex items-start gap-3 mb-3 last:mb-0 group">
      <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-emerald-500/40 group-hover:bg-emerald-500 transition-colors shrink-0" />
      <span className="text-sm text-gray-600 dark:text-gray-300">{children}</span>
    </div>
  ),
  TechDetail: ({ label, value }: TechDetailProps) => (
    <div className="flex flex-col gap-1.5 py-3 border-b border-gray-100 dark:border-gray-800 last:border-0">
      <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
        {label}
      </span>
      <span className="text-sm font-medium text-gray-900 dark:text-gray-100 leading-relaxed capitalize">
        {value}
      </span>
    </div>
  ),
  skipAnimation: true,
};
