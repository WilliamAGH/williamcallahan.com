"use client";

/**
 * Book AI Analysis Component
 * @module components/features/books/book-ai-analysis.client
 * @description
 * Thin wrapper around the generic AiAnalysisTerminal for book-specific analysis.
 * Provides domain-specific configuration: context extraction, prompts, schema, and rendering.
 */

import { motion } from "framer-motion";
import { BookOpen } from "lucide-react";
import type { BookAiAnalysisProps, BookAnalysisContext } from "@/types/book-ai-analysis";
import {
  bookAiAnalysisResponseSchema,
  type BookAiAnalysisResponse,
} from "@/types/schemas/book-ai-analysis";
import { extractBookAnalysisContext } from "@/lib/books/analysis/extract-context";
import {
  buildBookAnalysisSystemPrompt,
  buildBookAnalysisUserPrompt,
} from "@/lib/books/analysis/build-prompt";
import { AiAnalysisTerminal } from "@/components/features/ai-analysis/ai-analysis-terminal.client";
import type { AnalysisRenderHelpers } from "@/types/ai-analysis";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const AI_FEATURE_NAME = "book-analysis";
const PERSISTENCE_KEY = "books";

const LOADING_MESSAGES = [
  "Analyzing literary context...",
  "Extracting key themes...",
  "Identifying ideal readers...",
  "Synthesizing insights...",
];

const BOOK_ANALYSIS_RESPONSE_FORMAT = {
  type: "json_schema",
  json_schema: {
    name: "book_analysis",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        summary: { type: "string" },
        category: { type: "string" },
        keyThemes: { type: "array", items: { type: "string" } },
        idealReader: { type: "string" },
        contextualDetails: {
          type: "object",
          additionalProperties: false,
          properties: {
            writingStyle: { type: ["string", "null"] },
            readingLevel: { type: ["string", "null"] },
            commitment: { type: ["string", "null"] },
          },
          required: ["writingStyle", "readingLevel", "commitment"],
        },
        relatedReading: { type: "array", items: { type: "string" } },
        whyItMatters: { type: "string" },
      },
      required: [
        "summary",
        "category",
        "keyThemes",
        "idealReader",
        "contextualDetails",
        "relatedReading",
        "whyItMatters",
      ],
    },
  },
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Analysis Renderer
// ─────────────────────────────────────────────────────────────────────────────

function renderBookAnalysis(
  analysis: BookAiAnalysisResponse,
  { AnalysisSection, TerminalListItem, TechDetail, skipAnimation }: AnalysisRenderHelpers,
) {
  return (
    <>
      <AnalysisSection label="Summary" index={0} skipAnimation={skipAnimation}>
        {analysis.summary}
      </AnalysisSection>

      {analysis.keyThemes.length > 0 && (
        <AnalysisSection
          label="Key Themes"
          index={1}
          accentColor="#9ece6a"
          skipAnimation={skipAnimation}
        >
          <ul className="space-y-1.5 mt-1">
            {analysis.keyThemes.map((theme, idx) => (
              <TerminalListItem key={idx} index={idx} skipAnimation={skipAnimation}>
                {theme}
              </TerminalListItem>
            ))}
          </ul>
        </AnalysisSection>
      )}

      <AnalysisSection
        label="Ideal Reader"
        index={2}
        accentColor="#e0af68"
        skipAnimation={skipAnimation}
      >
        {analysis.idealReader}
      </AnalysisSection>

      {(analysis.contextualDetails.writingStyle ||
        analysis.contextualDetails.readingLevel ||
        analysis.contextualDetails.commitment) && (
        <AnalysisSection
          label="Details"
          index={3}
          accentColor="#bb9af7"
          skipAnimation={skipAnimation}
        >
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

      <AnalysisSection
        label="Why It Matters"
        index={4}
        accentColor="#73daca"
        skipAnimation={skipAnimation}
      >
        {analysis.whyItMatters}
      </AnalysisSection>

      {analysis.relatedReading.length > 0 && (
        <AnalysisSection
          label="Related Reading"
          index={5}
          accentColor="#ff9e64"
          skipAnimation={skipAnimation}
        >
          <div className="flex flex-wrap gap-1.5 mt-1">
            {analysis.relatedReading.map((item, idx) => (
              <motion.span
                key={idx}
                initial={skipAnimation ? false : { opacity: 0, scale: 0.9 }}
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
    </>
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
  return (
    <AiAnalysisTerminal
      entity={book}
      entityId={book.id}
      featureName={AI_FEATURE_NAME}
      persistenceKey={PERSISTENCE_KEY}
      loadingMessages={LOADING_MESSAGES}
      extractContext={extractBookAnalysisContext}
      buildSystemPrompt={buildBookAnalysisSystemPrompt}
      buildUserPrompt={(ctx) => buildBookAnalysisUserPrompt(ctx as BookAnalysisContext)}
      responseFormat={BOOK_ANALYSIS_RESPONSE_FORMAT}
      responseSchema={bookAiAnalysisResponseSchema}
      renderAnalysis={renderBookAnalysis}
      getCategory={(a) => a.category}
      footerIcon={<BookOpen className="w-3 h-3" />}
      footerText="AI-powered insights"
      autoTrigger={autoTrigger}
      initialAnalysis={initialAnalysis}
      className={className}
    />
  );
}
