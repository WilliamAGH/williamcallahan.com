"use client";

/**
 * Modern AI Analysis Component
 * @module components/features/ai-analysis/modern-ai-analysis.client
 * @description
 * A clean, modern, non-cliche presentation for AI analysis.
 * Replaces the terminal aesthetic with a refined, editorial card style.
 */

import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Cpu,
  Layers,
  Hash,
  ArrowRight,
} from "lucide-react";
import type {
  AiAnalysisTerminalProps,
  AnalysisSectionProps,
  TerminalListItemProps,
  TechDetailProps,
} from "@/types/ai-analysis";
import { useAiAnalysis } from "@/hooks/use-ai-analysis";

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

// Re-use the props interface as it covers all necessary data requirements
export function ModernAiAnalysis<TEntity, TAnalysis>({
  entity,
  entityId,
  featureName,
  persistenceKey,
  loadingMessages,
  extractContext,
  buildSystemPrompt,
  buildUserPrompt,
  responseFormat,
  responseSchema,
  renderAnalysis,
  getCategory,
  autoTrigger = true,
  initialAnalysis,
  className = "",
  onAnalysisComplete,
}: Readonly<AiAnalysisTerminalProps<TEntity, TAnalysis>>) {
  const { state, loadingMessage, startedFromCache, handleManualTrigger } = useAiAnalysis({
    entity,
    entityId,
    featureName,
    persistenceKey,
    loadingMessages,
    extractContext,
    buildSystemPrompt,
    buildUserPrompt,
    responseFormat,
    responseSchema,
    autoTrigger,
    initialAnalysis,
  });

  useEffect(() => {
    if (state.status === "success" && state.analysis) {
      onAnalysisComplete?.(state.analysis);
    }
  }, [state.status, state.analysis, onAnalysisComplete]);

  // If we have data, we render the content
  const analysis = state.analysis;
  const isSuccess = state.status === "success" && analysis;
  const isLoading = state.status === "loading";
  const isError = state.status === "error";
  const isIdle = state.status === "idle";

  // We need to adapt the renderAnalysis function to our modern layout
  // Since renderAnalysis expects helpers for the terminal, we'll need to
  // inspect the analysis object directly in the parent component or
  // provide "modern" helpers that render differently.
  //
  // However, the `renderAnalysis` prop is designed for the terminal.
  // For this modern component, we might want to render specific parts
  // if we know the shape, OR we can try to use the helpers to render
  // into our new structure.
  //
  // BETTER APPROACH: The `BookmarkAiAnalysis` component defines `renderBookmarkAnalysis`.
  // We should probably export a specialized render function for the modern look
  // from there, OR just handle the specific shape of BookmarkAiAnalysisResponse
  // if we make this component less generic.
  //
  // BUT to keep it generic like AiAnalysisTerminal, we can provide
  // "Modern" implementations of the helpers.

  return (
    <div className={`w-full ${className}`}>
      <AnimatePresence mode="wait">
        {isLoading && (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 shadow-sm"
          >
            <div className="flex flex-col items-center justify-center py-8 text-center space-y-4">
              <div className="relative">
                <div className="w-10 h-10 rounded-full border-2 border-gray-100 dark:border-gray-800" />
                <div className="absolute inset-0 w-10 h-10 rounded-full border-t-2 border-amber-500 animate-spin" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-amber-500" />
                </div>
              </div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400 animate-pulse">
                {loadingMessage}
              </p>
            </div>
          </motion.div>
        )}

        {isError && (
          <motion.div
            key="error"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="bg-red-50 dark:bg-red-900/10 rounded-xl border border-red-100 dark:border-red-900/20 p-6"
          >
            <div className="flex items-start gap-4">
              <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-full shrink-0">
                <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
              </div>
              <div className="space-y-2">
                <h3 className="font-semibold text-red-900 dark:text-red-200">Analysis Failed</h3>
                <p className="text-sm text-red-700 dark:text-red-300">
                  {state.error || "Something went wrong while analyzing this content."}
                </p>
                <button
                  type="button"
                  onClick={handleManualTrigger}
                  className="mt-2 inline-flex items-center gap-2 text-xs font-medium text-red-700 dark:text-red-300 hover:text-red-900 dark:hover:text-red-100 transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Try Again
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {isIdle && (
          <motion.div
            key="idle"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <button
              type="button"
              onClick={handleManualTrigger}
              className="w-full group bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800 border border-gray-200 dark:border-gray-800 rounded-xl p-6 transition-all shadow-sm hover:shadow-md text-left flex items-center justify-between"
            >
              <div className="flex items-center gap-4">
                <div className="p-2.5 bg-amber-50 dark:bg-amber-900/20 rounded-lg text-amber-600 dark:text-amber-500 group-hover:scale-110 transition-transform">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-medium text-gray-900 dark:text-gray-100">Analyze Content</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Generate a smart summary and highlights
                  </p>
                </div>
              </div>
              <ArrowRight className="w-5 h-5 text-gray-300 group-hover:text-amber-500 transition-colors" />
            </button>
          </motion.div>
        )}

        {isSuccess && (
          <motion.div
            key="success"
            initial={startedFromCache ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden"
          >
            {/* Header / Category Badge */}
            {getCategory && (
              <div className="px-6 pt-6 pb-2">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
                  <Hash className="w-3 h-3" />
                  {getCategory(analysis)}
                </span>
              </div>
            )}

            {/* Main Content */}
            <div className="p-6 pt-2">{renderAnalysis(analysis, modernHelpers)}</div>

            {/* Subtle Footer */}
            <div className="px-6 py-3 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-[10px] font-medium text-gray-400 uppercase tracking-widest">
                <Cpu className="w-3 h-3" />
                <span>AI Generated</span>
              </div>
              <button
                type="button"
                onClick={handleManualTrigger}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                title="Refresh Analysis"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
