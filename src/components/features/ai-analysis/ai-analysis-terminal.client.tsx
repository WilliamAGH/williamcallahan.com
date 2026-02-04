"use client";

/**
 * Generic AI Analysis Terminal Component
 * @module components/features/ai-analysis/ai-analysis-terminal.client
 * @description
 * Reusable terminal-style AI analysis component that handles loading states,
 * error handling, queue management, and animated content reveal.
 * Domain-specific components configure this via props.
 */

import { useState, useCallback, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertCircle, RotateCcw, ChevronRight, Terminal } from "lucide-react";
import { aiQueueStatsSchema } from "@/types/schemas/ai-openai-compatible-client";
import { aiChat } from "@/lib/ai/openai-compatible/browser-client";
import { parseLlmJson, persistAnalysisToS3 } from "@/lib/ai/analysis-client-utils";
import type {
  AiAnalysisTerminalProps,
  AnalysisRenderHelpers,
  AnalysisState,
} from "@/types/ai-analysis";
import {
  TerminalLoading,
  AnalysisSection,
  TerminalListItem,
  TechDetail,
} from "./ai-analysis-terminal-ui.client";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const AUTO_TRIGGER_QUEUE_THRESHOLD = 5;

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

export function AiAnalysisTerminal<TEntity, TAnalysis>({
  entity,
  entityId,
  featureName,
  persistenceKey,
  loadingMessages,
  extractContext,
  buildSystemPrompt,
  buildUserPrompt,
  responseSchema,
  renderAnalysis,
  getCategory,
  footerIcon,
  footerText = "Powered by AI",
  autoTrigger = true,
  initialAnalysis,
  className = "",
}: AiAnalysisTerminalProps<TEntity, TAnalysis>) {
  const [state, setState] = useState<AnalysisState<TAnalysis>>(() => {
    if (initialAnalysis?.analysis) {
      return { status: "success", analysis: initialAnalysis.analysis, error: null };
    }
    return { status: "idle", analysis: null, error: null };
  });

  const startedFromCache = useRef(!!initialAnalysis?.analysis);
  const [loadingMessage, setLoadingMessage] = useState<string>(
    loadingMessages[0] ?? "Analyzing...",
  );
  const [queueMessage, setQueueMessage] = useState<string | null>(null);
  const hasTriggered = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const generateAnalysisRef = useRef<((signal?: AbortSignal) => Promise<void>) | null>(null);

  const generateAnalysis = useCallback(
    async (signal?: AbortSignal) => {
      setState({ status: "loading", analysis: null, error: null });
      setQueueMessage(null);

      try {
        const context = extractContext(entity);
        const systemPrompt = buildSystemPrompt();
        const userPrompt = buildUserPrompt(context);

        const responseText = await aiChat(
          featureName,
          { system: systemPrompt, userText: userPrompt, priority: 0 },
          {
            signal,
            onQueueUpdate: (update) => {
              if (update.event === "queued" || update.event === "queue") {
                setQueueMessage(update.position ? `Queued (position ${update.position})` : null);
                return;
              }
              if (update.event === "started") {
                setQueueMessage(null);
              }
            },
          },
        );

        let parsedJson: unknown;
        try {
          parsedJson = parseLlmJson(responseText);
        } catch (error) {
          console.error("Failed to parse AI response:", responseText, error);
          throw new Error("Invalid JSON response from AI service", { cause: error });
        }

        const parseResult = responseSchema.safeParse(parsedJson);
        if (!parseResult.success) {
          console.error("AI response validation failed:", parseResult.error);
          throw new Error("AI response did not match expected format");
        }

        setState({ status: "success", analysis: parseResult.data, error: null });
        void persistAnalysisToS3(persistenceKey, entityId, parseResult.data);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        const message = error instanceof Error ? error.message : "Failed to generate analysis";
        setState({ status: "error", analysis: null, error: message });
      }
    },
    [
      entity,
      entityId,
      featureName,
      persistenceKey,
      extractContext,
      buildSystemPrompt,
      buildUserPrompt,
      responseSchema,
    ],
  );

  generateAnalysisRef.current = generateAnalysis;

  // Reset state when entity changes
  useEffect(() => {
    if (initialAnalysis?.analysis) {
      setState({ status: "success", analysis: initialAnalysis.analysis, error: null });
      startedFromCache.current = true;
    } else {
      setState({ status: "idle", analysis: null, error: null });
      startedFromCache.current = false;
    }
    hasTriggered.current = false;
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
  }, [entityId, initialAnalysis]);

  const handleManualTrigger = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();
    void generateAnalysis(abortControllerRef.current.signal);
  }, [generateAnalysis]);

  // Auto-trigger with queue check
  useEffect(() => {
    if (startedFromCache.current) return;
    if (!autoTrigger || hasTriggered.current) return;

    hasTriggered.current = true;
    const controller = new AbortController();
    abortControllerRef.current = controller;

    async function checkQueueAndTrigger() {
      try {
        const response = await fetch(`/api/ai/queue/${featureName}`, {
          signal: controller.signal,
        });
        if (response.ok) {
          const data: unknown = await response.json();
          const parseResult = aiQueueStatsSchema.safeParse(data);
          if (parseResult.success && parseResult.data.pending > AUTO_TRIGGER_QUEUE_THRESHOLD) {
            hasTriggered.current = false;
            return;
          }
        }
        void generateAnalysisRef.current?.(controller.signal);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        void generateAnalysisRef.current?.(controller.signal);
      }
    }

    void checkQueueAndTrigger();
  }, [autoTrigger, entityId, featureName]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  // Cycle loading messages
  useEffect(() => {
    if (state.status !== "loading") return;

    let messageIndex = 0;
    const interval = setInterval(() => {
      messageIndex = (messageIndex + 1) % loadingMessages.length;
      const nextMessage = loadingMessages[messageIndex];
      if (nextMessage) setLoadingMessage(nextMessage);
    }, 1800);

    return () => clearInterval(interval);
  }, [state.status, loadingMessages]);

  // Loading state
  if (state.status === "loading") {
    return (
      <div className={`bg-[#1a1b26] border border-[#3d4f70] rounded-lg p-4 sm:p-5 ${className}`}>
        <TerminalLoading
          message={queueMessage ? `${queueMessage} — ${loadingMessage}` : loadingMessage}
        />
      </div>
    );
  }

  // Error state
  if (state.status === "error") {
    return (
      <div className={`bg-[#1a1b26] border border-[#f7768e]/40 rounded-lg p-4 sm:p-5 ${className}`}>
        <div className="font-mono text-sm">
          <div className="flex items-center gap-2 text-gray-400 mb-2">
            <span className="text-[#7aa2f7]">$</span>
            <span>analyze</span>
          </div>
          <div className="flex items-start gap-2 text-[#f7768e]">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <div>
              <span className="font-medium">Error:</span> {state.error}
            </div>
          </div>
          <button
            type="button"
            onClick={handleManualTrigger}
            className="mt-3 flex items-center gap-1.5 text-xs text-[#7aa2f7] hover:text-[#9ece6a] transition-colors font-mono"
          >
            <RotateCcw className="w-3 h-3" />
            <span>retry</span>
          </button>
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
        className={`group flex items-center gap-3 w-full bg-[#1a1b26] border border-[#3d4f70] hover:border-[#7aa2f7] rounded-lg p-4 sm:p-5 transition-all ${className}`}
      >
        <div className="flex items-center justify-center w-8 h-8 rounded bg-[#7aa2f7]/10 text-[#7aa2f7] group-hover:bg-[#7aa2f7]/20 transition-colors">
          <Terminal className="w-4 h-4" />
        </div>
        <div className="flex-1 text-left">
          <div className="text-sm font-medium text-gray-200 group-hover:text-white transition-colors">
            Run AI Analysis
          </div>
          <div className="text-xs text-gray-500 font-mono">$ analyze</div>
        </div>
        <ChevronRight className="w-4 h-4 text-gray-600 group-hover:text-[#7aa2f7] group-hover:translate-x-0.5 transition-all" />
      </button>
    );
  }

  // Success state
  const analysis = state.analysis;
  if (!analysis) return null;

  // Use initial={false} when we started with cached content to avoid hydration mismatch
  // and ensure content is visible immediately on SSR
  const skipInitialAnimation = startedFromCache.current;

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
        className={`bg-[#1a1b26] border border-[#3d4f70] rounded-lg overflow-hidden ${className}`}
      >
        {/* Header bar */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#3d4f70] bg-[#16161e]">
          <div className="flex items-center gap-2">
            <div className="flex gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-[#f7768e]" />
              <div className="w-2.5 h-2.5 rounded-full bg-[#e0af68]" />
              <div className="w-2.5 h-2.5 rounded-full bg-[#9ece6a]" />
            </div>
            <span className="text-xs font-mono text-gray-500 ml-2">summary / context</span>
          </div>
          <div className="flex items-center gap-3">
            {getCategory && (
              <span className="px-2 py-0.5 text-xs font-mono bg-[#7aa2f7]/10 text-[#7aa2f7] rounded">
                {getCategory(analysis)}
              </span>
            )}
            <button
              type="button"
              onClick={handleManualTrigger}
              className="text-gray-500 hover:text-[#7aa2f7] transition-colors p-1"
              title="Regenerate analysis"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-5 space-y-5">{renderAnalysis(analysis, helpers)}</div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-[#3d4f70] bg-[#16161e]">
          <div className="flex items-center gap-2 text-xs font-mono text-gray-600">
            <span className="text-[#9ece6a]">✓</span>
            <span>Analysis complete</span>
            <span className="text-gray-700">•</span>
            {footerIcon}
            <span>{footerText}</span>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
