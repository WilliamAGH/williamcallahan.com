"use client";

/**
 * Book AI Analysis Component
 * @module components/features/books/book-ai-analysis.client
 * @description
 * Terminal-native AI analysis component for books that auto-triggers
 * and displays structured analysis with typewriter reveal animation.
 */

import { useState, useCallback, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertCircle, RotateCcw, ChevronRight, Terminal, BookOpen } from "lucide-react";
import {
  INITIAL_BOOK_ANALYSIS_STATE,
  type BookAnalysisState,
  type BookAiAnalysisProps,
} from "@/types/book-ai-analysis";
import { bookAiAnalysisResponseSchema } from "@/types/schemas/book-ai-analysis";
import { aiQueueStatsSchema } from "@/types/schemas/ai-openai-compatible-client";
import { extractBookAnalysisContext } from "@/lib/books/analysis/extract-context";
import {
  buildBookAnalysisSystemPrompt,
  buildBookAnalysisUserPrompt,
} from "@/lib/books/analysis/build-prompt";
import { aiChat } from "@/lib/ai/openai-compatible/browser-client";
import { parseLlmJson, persistAnalysisToS3 } from "@/lib/ai/analysis-client-utils";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const AI_FEATURE_NAME = "book-analysis";
const AUTO_TRIGGER_QUEUE_THRESHOLD = 5;

const LOADING_MESSAGES = [
  "Analyzing literary context...",
  "Extracting key themes...",
  "Identifying ideal readers...",
  "Synthesizing insights...",
];

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function BlinkingCursor() {
  return <span className="inline-block w-2 h-4 bg-[#7aa2f7] ml-1 animate-pulse" />;
}

function TerminalLoading({ message }: { message: string }) {
  return (
    <div className="font-mono text-sm">
      <div className="flex items-center gap-2 text-gray-400 mb-2">
        <span className="text-[#7aa2f7]">$</span>
        <span>analyze --book</span>
      </div>
      <div className="flex items-center gap-2 text-[#9ece6a]">
        <span className="animate-spin">⠋</span>
        <span>{message}</span>
        <BlinkingCursor />
      </div>
    </div>
  );
}

function AnalysisSection({
  label,
  children,
  index,
  accentColor = "#7aa2f7",
}: {
  label: string;
  children: React.ReactNode;
  index: number;
  accentColor?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.08, duration: 0.3, ease: "easeOut" }}
      className="group"
    >
      <div className="flex items-center gap-2 mb-1.5">
        <ChevronRight
          className="w-3 h-3 transition-transform group-hover:translate-x-0.5"
          style={{ color: accentColor }}
        />
        <span className="text-xs font-mono uppercase tracking-wider" style={{ color: accentColor }}>
          {label}
        </span>
      </div>
      <div className="pl-5 text-sm text-gray-300 leading-relaxed">{children}</div>
    </motion.div>
  );
}

function TerminalListItem({ children, index }: { children: React.ReactNode; index: number }) {
  return (
    <motion.li
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: index * 0.05 }}
      className="flex items-start gap-2 text-gray-400"
    >
      <span className="text-[#565f89] select-none mt-0.5">→</span>
      <span>{children}</span>
    </motion.li>
  );
}

function TechDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2 font-mono text-xs">
      <span className="text-[#565f89]">{label}:</span>
      <span className="text-[#bb9af7]">{value}</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

export function BookAiAnalysis({
  book,
  className = "",
  autoTrigger = true,
  initialAnalysis,
}: BookAiAnalysisProps) {
  const [state, setState] = useState<BookAnalysisState>(() => {
    if (initialAnalysis?.analysis) {
      return { status: "success", analysis: initialAnalysis.analysis, error: null };
    }
    return INITIAL_BOOK_ANALYSIS_STATE;
  });

  const startedFromCache = useRef(!!initialAnalysis?.analysis);
  const [loadingMessage, setLoadingMessage] = useState<string>(
    LOADING_MESSAGES[0] ?? "Analyzing...",
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
        const context = extractBookAnalysisContext(book);
        const systemPrompt = buildBookAnalysisSystemPrompt();
        const userPrompt = buildBookAnalysisUserPrompt(context);

        const responseText = await aiChat(
          AI_FEATURE_NAME,
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

        const parseResult = bookAiAnalysisResponseSchema.safeParse(parsedJson);
        if (!parseResult.success) {
          console.error("AI response validation failed:", parseResult.error);
          throw new Error("AI response did not match expected format");
        }

        setState({ status: "success", analysis: parseResult.data, error: null });
        void persistAnalysisToS3("books", book.id, parseResult.data);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        const message = error instanceof Error ? error.message : "Failed to generate analysis";
        setState({ status: "error", analysis: null, error: message });
      }
    },
    [book],
  );

  generateAnalysisRef.current = generateAnalysis;

  useEffect(() => {
    if (initialAnalysis?.analysis) {
      setState({ status: "success", analysis: initialAnalysis.analysis, error: null });
      startedFromCache.current = true;
    } else {
      setState(INITIAL_BOOK_ANALYSIS_STATE);
      startedFromCache.current = false;
    }
    hasTriggered.current = false;
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
  }, [book.id, initialAnalysis]);

  const handleManualTrigger = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();
    void generateAnalysis(abortControllerRef.current.signal);
  }, [generateAnalysis]);

  useEffect(() => {
    if (startedFromCache.current) return;
    if (!autoTrigger || hasTriggered.current) return;

    hasTriggered.current = true;
    const controller = new AbortController();
    abortControllerRef.current = controller;

    async function checkQueueAndTrigger() {
      try {
        const response = await fetch(`/api/ai/queue/${AI_FEATURE_NAME}`, {
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
  }, [autoTrigger, book.id]);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (state.status !== "loading") return;

    let messageIndex = 0;
    const interval = setInterval(() => {
      messageIndex = (messageIndex + 1) % LOADING_MESSAGES.length;
      const nextMessage = LOADING_MESSAGES[messageIndex];
      if (nextMessage) setLoadingMessage(nextMessage);
    }, 1800);

    return () => clearInterval(interval);
  }, [state.status]);

  if (state.status === "loading") {
    return (
      <div className={`bg-[#1a1b26] border border-[#3d4f70] rounded-lg p-4 sm:p-5 ${className}`}>
        <TerminalLoading
          message={queueMessage ? `${queueMessage} — ${loadingMessage}` : loadingMessage}
        />
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className={`bg-[#1a1b26] border border-[#f7768e]/40 rounded-lg p-4 sm:p-5 ${className}`}>
        <div className="font-mono text-sm">
          <div className="flex items-center gap-2 text-gray-400 mb-2">
            <span className="text-[#7aa2f7]">$</span>
            <span>analyze --book</span>
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
          <div className="text-xs text-gray-500 font-mono">$ analyze --book</div>
        </div>
        <ChevronRight className="w-4 h-4 text-gray-600 group-hover:text-[#7aa2f7] group-hover:translate-x-0.5 transition-all" />
      </button>
    );
  }

  const analysis = state.analysis;
  if (!analysis) return null;

  return (
    <AnimatePresence mode="wait">
      <motion.div
        initial={{ opacity: 0 }}
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
            <span className="text-xs font-mono text-gray-500 ml-2">book.analysis</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="px-2 py-0.5 text-xs font-mono bg-[#7aa2f7]/10 text-[#7aa2f7] rounded">
              {analysis.category}
            </span>
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
        <div className="p-4 sm:p-5 space-y-5">
          <AnalysisSection label="Summary" index={0}>
            {analysis.summary}
          </AnalysisSection>

          {analysis.keyThemes.length > 0 && (
            <AnalysisSection label="Key Themes" index={1} accentColor="#9ece6a">
              <ul className="space-y-1.5 mt-1">
                {analysis.keyThemes.map((theme, idx) => (
                  <TerminalListItem key={idx} index={idx}>
                    {theme}
                  </TerminalListItem>
                ))}
              </ul>
            </AnalysisSection>
          )}

          <AnalysisSection label="Ideal Reader" index={2} accentColor="#e0af68">
            {analysis.idealReader}
          </AnalysisSection>

          {(analysis.contextualDetails.writingStyle ||
            analysis.contextualDetails.readingLevel ||
            analysis.contextualDetails.commitment) && (
            <AnalysisSection label="Details" index={3} accentColor="#bb9af7">
              <div className="space-y-1 mt-1 bg-black/20 rounded p-3 border border-[#3d4f70]/50">
                {analysis.contextualDetails.writingStyle && (
                  <TechDetail label="style" value={analysis.contextualDetails.writingStyle} />
                )}
                {analysis.contextualDetails.readingLevel && (
                  <TechDetail label="level" value={analysis.contextualDetails.readingLevel} />
                )}
                {analysis.contextualDetails.commitment && (
                  <TechDetail label="commitment" value={analysis.contextualDetails.commitment} />
                )}
              </div>
            </AnalysisSection>
          )}

          <AnalysisSection label="Why It Matters" index={4} accentColor="#73daca">
            {analysis.whyItMatters}
          </AnalysisSection>

          {analysis.relatedReading.length > 0 && (
            <AnalysisSection label="Related Reading" index={5} accentColor="#ff9e64">
              <div className="flex flex-wrap gap-1.5 mt-1">
                {analysis.relatedReading.map((item, idx) => (
                  <motion.span
                    key={idx}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: idx * 0.05 }}
                    className="px-2 py-0.5 text-xs font-mono bg-[#ff9e64]/10 text-[#ff9e64] rounded border border-[#ff9e64]/20"
                  >
                    {item}
                  </motion.span>
                ))}
              </div>
            </AnalysisSection>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-[#3d4f70] bg-[#16161e]">
          <div className="flex items-center gap-2 text-xs font-mono text-gray-600">
            <span className="text-[#9ece6a]">✓</span>
            <span>Analysis complete</span>
            <span className="text-gray-700">•</span>
            <BookOpen className="w-3 h-3" />
            <span>AI-powered insights</span>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
