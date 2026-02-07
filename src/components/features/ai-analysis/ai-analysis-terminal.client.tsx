"use client";

/**
 * Generic AI Analysis Component
 * @module components/features/ai-analysis/ai-analysis-terminal.client
 * @description
 * Reusable AI analysis component that handles loading states,
 * error handling, queue management, and animated content reveal.
 * Domain-specific components configure this via props.
 */

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertCircle, RotateCcw, ChevronRight, ChevronDown } from "lucide-react";
import type { AiAnalysisTerminalProps, AnalysisRenderHelpers } from "@/types/ai-analysis";
import { useAiAnalysis } from "@/hooks/use-ai-analysis";
import {
  TerminalLoading,
  BlinkingCursor,
  AnalysisSection,
  TerminalListItem,
  TechDetail,
  CollapsedTerminalHint,
} from "./ai-analysis-terminal-ui.client";

export function AiAnalysisTerminal<TEntity, TAnalysis>({
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
  onAnalysisComplete,
  className = "",
  defaultCollapsed = false,
}: Readonly<AiAnalysisTerminalProps<TEntity, TAnalysis>>) {
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);

  // Reset collapse state when entity changes
  useEffect(() => {
    setIsCollapsed(defaultCollapsed);
  }, [entityId, defaultCollapsed]);

  const {
    state,
    queueMessage,
    loadingMessage,
    streamingText,
    startedFromCache,
    handleManualTrigger,
  } = useAiAnalysis({
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

  // Notify parent when analysis becomes available
  useEffect(() => {
    if (state.status === "success" && state.analysis) {
      onAnalysisComplete?.(state.analysis);
    }
  }, [state.status, state.analysis, onAnalysisComplete]);

  const streamScrollRef = useRef<HTMLPreElement>(null);

  // Auto-scroll streaming text to bottom
  useEffect(() => {
    if (streamScrollRef.current) {
      streamScrollRef.current.scrollTop = streamScrollRef.current.scrollHeight;
    }
  }, [streamingText]);

  const cardBase =
    "bg-white dark:bg-gray-800/30 border border-gray-200 dark:border-gray-700/50 rounded-xl";

  // Loading state — show streaming text once content starts arriving
  if (state.status === "loading" && !state.analysis) {
    if (!streamingText) {
      return (
        <div className={`${cardBase} p-5 sm:p-6 ${className}`}>
          <TerminalLoading
            message={queueMessage ? `${queueMessage} — ${loadingMessage}` : loadingMessage}
          />
        </div>
      );
    }

    return (
      <div className={`${cardBase} overflow-hidden ${className}`}>
        <div className="flex items-center justify-between px-5 py-2.5 border-b border-gray-100 dark:border-gray-800">
          <span className="text-xs text-gray-500 dark:text-gray-400">Generating...</span>
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
        </div>
        <div className="p-5 sm:p-6">
          <pre
            ref={streamScrollRef}
            className="text-xs text-gray-500 dark:text-gray-400 whitespace-pre-wrap break-words max-h-48 overflow-y-auto leading-relaxed font-mono"
          >
            {streamingText}
            <BlinkingCursor />
          </pre>
        </div>
      </div>
    );
  }

  // Error state
  if (state.status === "error") {
    return (
      <div className={`${cardBase} border-red-200 dark:border-red-900/30 p-5 sm:p-6 ${className}`}>
        <div className="flex items-start gap-3">
          <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm text-red-700 dark:text-red-400">{state.error}</p>
            <button
              type="button"
              onClick={handleManualTrigger}
              className="mt-2 text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors flex items-center gap-1.5"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Retry</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Idle state
  if (state.status === "idle") {
    return (
      <button
        type="button"
        onClick={handleManualTrigger}
        className={`group w-full ${cardBase} hover:border-gray-300 dark:hover:border-gray-600 p-4 sm:p-5 transition-colors text-left ${className}`}
      >
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-500 dark:text-gray-400 group-hover:text-gray-700 dark:group-hover:text-gray-200 transition-colors">
            Generate analysis
          </span>
          <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300 group-hover:translate-x-0.5 transition-all" />
        </div>
      </button>
    );
  }

  // Success state (or partial loading state with existing analysis)
  const analysis = state.analysis;
  if (!analysis) return null;
  const skipInitialAnimation = startedFromCache || state.status === "loading";
  const helpers: AnalysisRenderHelpers = {
    AnalysisSection,
    TerminalListItem,
    TechDetail,
    skipAnimation: skipInitialAnimation,
  };

  return (
    <AnimatePresence mode="wait">
      <motion.div
        initial={skipInitialAnimation ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className={`${cardBase} overflow-hidden ${className}`}
      >
        {/* Minimal header with controls */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-3">
            {getCategory && (
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                {getCategory(analysis)}
              </span>
            )}
            {state.status === "loading" && (
              <span className="flex items-center gap-1.5 text-xs text-blue-500">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                <span>Updating...</span>
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleManualTrigger}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors p-1"
              title="Regenerate analysis"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setIsCollapsed((prev) => !prev)}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors p-1"
              title={isCollapsed ? "Expand analysis" : "Collapse analysis"}
              aria-label={isCollapsed ? "Expand analysis" : "Collapse analysis"}
              aria-expanded={!isCollapsed}
            >
              <ChevronDown
                className={`w-3.5 h-3.5 transition-transform duration-200 ${isCollapsed ? "" : "rotate-180"}`}
              />
            </button>
          </div>
        </div>

        {isCollapsed ? (
          <CollapsedTerminalHint onExpand={() => setIsCollapsed(false)} />
        ) : (
          <div className="p-5 sm:p-6 space-y-5">
            {renderAnalysis(analysis, helpers)}

            {/* Subtle auto-generated indicator */}
            <div className="pt-2">
              <span className="text-[10px] text-gray-400 dark:text-gray-500 tracking-wider">
                auto-generated
              </span>
            </div>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
