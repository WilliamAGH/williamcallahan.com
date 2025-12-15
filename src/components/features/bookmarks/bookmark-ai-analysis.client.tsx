"use client";

/**
 * Bookmark AI Analysis Component
 * @module components/features/bookmarks/bookmark-ai-analysis.client
 * @description
 * Terminal-native AI analysis component that auto-triggers and displays
 * structured analysis with typewriter reveal animation.
 */

import { useState, useCallback, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertCircle, RotateCcw, ChevronRight, Terminal } from "lucide-react";
import {
  INITIAL_BOOKMARK_ANALYSIS_STATE,
  type BookmarkAnalysisState,
  type BookmarkAiAnalysisProps,
} from "@/types/bookmark-ai-analysis";
import { bookmarkAiAnalysisResponseSchema } from "@/types/schemas/bookmark-ai-analysis";
import { extractBookmarkAnalysisContext } from "@/lib/bookmarks/analysis/extract-context";
import {
  buildBookmarkAnalysisSystemPrompt,
  buildBookmarkAnalysisUserPrompt,
} from "@/lib/bookmarks/analysis/build-prompt";
import { aiChat } from "@/lib/ai/openai-compatible/browser-client";
import { jsonrepair } from "jsonrepair";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const AI_FEATURE_NAME = "bookmark-analysis";

// ─────────────────────────────────────────────────────────────────────────────
// JSON Parsing Utilities
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Strips LLM control tokens and extracts JSON content.
 */
function stripLlmTokens(rawText: string): string {
  let text = rawText.trim();

  // Strip LLM control tokens (e.g., <|channel|>final <|constrain|>JSON<|message|>)
  text = text.replace(/<\|[^|]+\|>[^{"]*/g, "");

  // Strip markdown code blocks
  if (text.startsWith("```")) {
    text = text.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");
  }

  return text.trim();
}

/**
 * Parses JSON from LLM output using jsonrepair for robustness.
 * Handles control tokens, malformed JSON, missing quotes, etc.
 */
function parseLlmJson(rawText: string): unknown {
  const cleaned = stripLlmTokens(rawText);

  // Use jsonrepair to fix common LLM JSON issues
  const repaired = jsonrepair(cleaned);

  return JSON.parse(repaired);
}

// Terminal-style loading messages that cycle through
const LOADING_MESSAGES = [
  "Fetching context vectors...",
  "Analyzing semantic structure...",
  "Extracting key patterns...",
  "Synthesizing insights...",
];

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

/** Blinking cursor for terminal effect */
function BlinkingCursor() {
  return <span className="inline-block w-2 h-4 bg-[#7aa2f7] ml-1 animate-pulse" />;
}

/** Terminal-style loading state */
function TerminalLoading({ message }: { message: string }) {
  return (
    <div className="font-mono text-sm">
      <div className="flex items-center gap-2 text-gray-400 mb-2">
        <span className="text-[#7aa2f7]">$</span>
        <span>analyze --deep</span>
      </div>
      <div className="flex items-center gap-2 text-[#9ece6a]">
        <span className="animate-spin">⠋</span>
        <span>{message}</span>
        <BlinkingCursor />
      </div>
    </div>
  );
}

/** Analysis section with staggered reveal */
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

/** Terminal-style list item */
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

/** Technical details in key-value format */
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

export function BookmarkAiAnalysis({
  bookmark,
  className = "",
  autoTrigger = true,
}: BookmarkAiAnalysisProps & { autoTrigger?: boolean }) {
  const [state, setState] = useState<BookmarkAnalysisState>(INITIAL_BOOKMARK_ANALYSIS_STATE);
  const [loadingMessage, setLoadingMessage] = useState<string>(LOADING_MESSAGES[0] ?? "Analyzing...");
  const [queueMessage, setQueueMessage] = useState<string | null>(null);
  const hasTriggered = useRef(false);

  const generateAnalysis = useCallback(async () => {
    setState({ status: "loading", analysis: null, error: null });
    setQueueMessage(null);

    try {
      // Extract context from bookmark
      const context = extractBookmarkAnalysisContext(bookmark);

      // Build prompts
      const systemPrompt = buildBookmarkAnalysisSystemPrompt();
      const userPrompt = buildBookmarkAnalysisUserPrompt(context);

      // Call AI service
      const responseText = await aiChat(
        AI_FEATURE_NAME,
        {
          system: systemPrompt,
          userText: userPrompt,
          priority: 0,
        },
        {
          onQueueUpdate: update => {
            if (update.event === "queued" || update.event === "queue") {
              if (update.position) {
                setQueueMessage(`Queued (position ${update.position})`);
              } else {
                setQueueMessage(null);
              }
              return;
            }

            if (update.event === "started") {
              setQueueMessage(null);
            }
          },
        },
      );

      // Parse JSON response using jsonrepair for robustness
      let parsedJson: unknown;
      try {
        parsedJson = parseLlmJson(responseText);
      } catch (error) {
        console.error("Failed to parse AI response:", responseText, error);
        throw new Error("Invalid JSON response from AI service", { cause: error });
      }

      // Validate with Zod schema
      const parseResult = bookmarkAiAnalysisResponseSchema.safeParse(parsedJson);
      if (!parseResult.success) {
        console.error("AI response validation failed:", parseResult.error);
        throw new Error("AI response did not match expected format");
      }

      setState({ status: "success", analysis: parseResult.data, error: null });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to generate analysis";
      setState({ status: "error", analysis: null, error: message });
    }
  }, [bookmark]);

  // Auto-trigger analysis on mount (implicit UX)
  useEffect(() => {
    if (autoTrigger && !hasTriggered.current && state.status === "idle") {
      hasTriggered.current = true;
      void generateAnalysis();
    }
  }, [autoTrigger, state.status, generateAnalysis]);

  // Cycle through loading messages
  useEffect(() => {
    if (state.status !== "loading") return;

    let messageIndex = 0;
    const interval = setInterval(() => {
      messageIndex = (messageIndex + 1) % LOADING_MESSAGES.length;
      const nextMessage = LOADING_MESSAGES[messageIndex];
      if (nextMessage) {
        setLoadingMessage(nextMessage);
      }
    }, 1800);

    return () => clearInterval(interval);
  }, [state.status]);

  // Loading state - terminal style
  if (state.status === "loading") {
    return (
      <div className={`bg-[#1a1b26] border border-[#3d4f70] rounded-lg p-4 sm:p-5 ${className}`}>
        <TerminalLoading message={queueMessage ? `${queueMessage} — ${loadingMessage}` : loadingMessage} />
      </div>
    );
  }

  // Error state - terminal style
  if (state.status === "error") {
    return (
      <div className={`bg-[#1a1b26] border border-[#f7768e]/40 rounded-lg p-4 sm:p-5 ${className}`}>
        <div className="font-mono text-sm">
          <div className="flex items-center gap-2 text-gray-400 mb-2">
            <span className="text-[#7aa2f7]">$</span>
            <span>analyze --deep</span>
          </div>
          <div className="flex items-start gap-2 text-[#f7768e]">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <div>
              <span className="font-medium">Error:</span> {state.error}
            </div>
          </div>
          <button
            type="button"
            onClick={generateAnalysis}
            className="mt-3 flex items-center gap-1.5 text-xs text-[#7aa2f7] hover:text-[#9ece6a] transition-colors font-mono"
          >
            <RotateCcw className="w-3 h-3" />
            <span>retry</span>
          </button>
        </div>
      </div>
    );
  }

  // Idle state - show trigger option (only if autoTrigger is false)
  if (state.status === "idle") {
    return (
      <button
        type="button"
        onClick={generateAnalysis}
        className={`group flex items-center gap-3 w-full bg-[#1a1b26] border border-[#3d4f70] hover:border-[#7aa2f7] rounded-lg p-4 sm:p-5 transition-all ${className}`}
      >
        <div className="flex items-center justify-center w-8 h-8 rounded bg-[#7aa2f7]/10 text-[#7aa2f7] group-hover:bg-[#7aa2f7]/20 transition-colors">
          <Terminal className="w-4 h-4" />
        </div>
        <div className="flex-1 text-left">
          <div className="text-sm font-medium text-gray-200 group-hover:text-white transition-colors">
            Run AI Analysis
          </div>
          <div className="text-xs text-gray-500 font-mono">$ analyze --deep</div>
        </div>
        <ChevronRight className="w-4 h-4 text-gray-600 group-hover:text-[#7aa2f7] group-hover:translate-x-0.5 transition-all" />
      </button>
    );
  }

  // Success state - display analysis with terminal aesthetics
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
            <span className="text-xs font-mono text-gray-500 ml-2">analysis.output</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="px-2 py-0.5 text-xs font-mono bg-[#7aa2f7]/10 text-[#7aa2f7] rounded">
              {analysis.category}
            </span>
            <button
              type="button"
              onClick={generateAnalysis}
              className="text-gray-500 hover:text-[#7aa2f7] transition-colors p-1"
              title="Regenerate analysis"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-5 space-y-5">
          {/* Summary */}
          <AnalysisSection label="Summary" index={0}>
            {analysis.summary}
          </AnalysisSection>

          {/* Key Features */}
          {analysis.keyFeatures.length > 0 && (
            <AnalysisSection label="Key Features" index={1} accentColor="#9ece6a">
              <ul className="space-y-1.5 mt-1">
                {analysis.keyFeatures.map((feature, idx) => (
                  <TerminalListItem key={idx} index={idx}>
                    {feature}
                  </TerminalListItem>
                ))}
              </ul>
            </AnalysisSection>
          )}

          {/* Use Cases */}
          {analysis.useCases.length > 0 && (
            <AnalysisSection label="Use Cases" index={2} accentColor="#e0af68">
              <ul className="space-y-1.5 mt-1">
                {analysis.useCases.map((useCase, idx) => (
                  <TerminalListItem key={idx} index={idx}>
                    {useCase}
                  </TerminalListItem>
                ))}
              </ul>
            </AnalysisSection>
          )}

          {/* Technical Details */}
          {(analysis.technicalDetails.language ||
            analysis.technicalDetails.platform ||
            analysis.technicalDetails.installMethod) && (
            <AnalysisSection label="Technical" index={3} accentColor="#bb9af7">
              <div className="space-y-1 mt-1 bg-black/20 rounded p-3 border border-[#3d4f70]/50">
                {analysis.technicalDetails.language && (
                  <TechDetail label="lang" value={analysis.technicalDetails.language} />
                )}
                {analysis.technicalDetails.platform && (
                  <TechDetail label="platform" value={analysis.technicalDetails.platform} />
                )}
                {analysis.technicalDetails.installMethod && (
                  <TechDetail label="install" value={analysis.technicalDetails.installMethod} />
                )}
              </div>
            </AnalysisSection>
          )}

          {/* Related Projects - compact chips */}
          {analysis.relatedProjects.length > 0 && (
            <AnalysisSection label="Related" index={4} accentColor="#73daca">
              <div className="flex flex-wrap gap-1.5 mt-1">
                {analysis.relatedProjects.map((project, idx) => (
                  <motion.span
                    key={idx}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: idx * 0.05 }}
                    className="px-2 py-0.5 text-xs font-mono bg-[#73daca]/10 text-[#73daca] rounded border border-[#73daca]/20"
                  >
                    {project}
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
            <span>Powered by AI</span>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
